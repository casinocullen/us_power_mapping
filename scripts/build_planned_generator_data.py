import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def parse_shared_strings(xlsx_path: Path) -> list[str]:
    with zipfile.ZipFile(xlsx_path) as archive:
        try:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        except KeyError:
            return []

    values = []
    for item in root.findall(f"{NS}si"):
        values.append("".join(node.text or "" for node in item.iter(f"{NS}t")))
    return values


def get_sheet_path(xlsx_path: Path, sheet_name: str) -> str:
    with zipfile.ZipFile(xlsx_path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))

    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

    for sheet in workbook.find(f"{NS}sheets"):
        if sheet.attrib.get("name") == sheet_name:
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            return f"xl/{rel_map[rel_id]}"

    raise ValueError(f"Sheet {sheet_name!r} not found in {xlsx_path}")


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_node = cell.find(f"{NS}v")

    if value_node is None:
        return ""

    raw = value_node.text or ""
    if cell_type == "s":
        return shared_strings[int(raw)]
    return raw


def iter_sheet_rows(xlsx_path: Path, sheet_name: str):
    shared_strings = parse_shared_strings(xlsx_path)
    sheet_path = get_sheet_path(xlsx_path, sheet_name)

    with zipfile.ZipFile(xlsx_path) as archive:
        root = ET.fromstring(archive.read(sheet_path))

    sheet_data = root.find(f"{NS}sheetData")
    if sheet_data is None:
        return

    for row in sheet_data.findall(f"{NS}row"):
        values = {}
        for cell in row.findall(f"{NS}c"):
            ref = cell.attrib.get("r", "")
            column = re.match(r"[A-Z]+", ref)
            if not column:
                continue
            values[column.group(0)] = cell_value(cell, shared_strings)
        yield values


def clean_text(value: str) -> str:
    return " ".join((value or "").strip().split())


def as_float(value: str) -> float | None:
    try:
        stripped = clean_text(value)
        if not stripped or stripped == "NA":
            return None
        return float(stripped)
    except Exception:
        return None


def parse_first_fips(value: str) -> str | None:
    for token in re.split(r"[;,|/ ]+", clean_text(value)):
        digits = re.sub(r"\D", "", token)
        if len(digits) == 4:
            digits = f"0{digits}"
        if len(digits) == 5:
            return digits
    return None


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_planned_generator_data.py <queue_xlsx> <output_json>")

    queue_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    rows = iter_sheet_rows(queue_path, "03. Complete Queue Data")
    header_row = None
    records_by_county = {}
    technology_counts = defaultdict(int)

    for index, row in enumerate(rows):
        if index == 1:
            header_row = {column: clean_text(value) for column, value in row.items()}
            continue

        if index < 2 or not header_row:
            continue

        values = {header_row.get(column, column): clean_text(value) for column, value in row.items()}
        queue_status = values.get("q_status", "").lower()
        if queue_status not in {"active", "suspended"}:
            continue

        county_fips = parse_first_fips(values.get("fips_codes", ""))
        if not county_fips:
            continue

        mw_total = sum(as_float(values.get(field, "")) or 0.0 for field in ("mw1", "mw2", "mw3"))
        technology = clean_text(values.get("type_clean", "")) or clean_text(values.get("project_type", "")) or "Other"
        project_name = clean_text(values.get("project_name", "")) or clean_text(values.get("poi_name", "")) or values.get("q_id", "Unknown")
        county_name = clean_text(values.get("county", "")) or "Unknown"
        state_code = clean_text(values.get("state", "")) or "NA"

        county_entry = records_by_county.setdefault(
            county_fips,
            {
                "fips": county_fips,
                "county": county_name,
                "st": state_code,
                "region": clean_text(values.get("region", "")) or "Unknown",
                "projects": 0,
                "mw": 0.0,
                "tech": defaultdict(int),
                "items": [],
            },
        )

        county_entry["projects"] += 1
        county_entry["mw"] += mw_total
        county_entry["tech"][technology] += 1
        technology_counts[technology] += 1
        county_entry["items"].append([
            clean_text(values.get("q_id", "")),
            project_name,
            technology,
            round(mw_total, 3),
            queue_status,
            clean_text(values.get("IA_status_clean", "")) or clean_text(values.get("IA_status_raw", "")),
            clean_text(values.get("utility", "")),
            clean_text(values.get("developer", "")),
            clean_text(values.get("prop_year", "")),
        ])

    records = []
    for county in records_by_county.values():
        county["items"].sort(key=lambda item: (-item[3], item[1], item[0]))
        records.append({
            "fips": county["fips"],
            "county": county["county"],
            "st": county["st"],
            "region": county["region"],
            "projects": county["projects"],
            "mw": round(county["mw"], 3),
            "tech": dict(sorted(county["tech"].items(), key=lambda item: (-item[1], item[0]))),
            "items": county["items"],
        })

    records.sort(key=lambda item: (-item["mw"], -item["projects"], item["st"], item["county"]))

    payload = {
        "source": {
            "name": "Berkeley Lab Queued Up",
            "release": "2025 Edition (through end of 2024)",
            "source_url": "https://emp.lbl.gov/queues",
            "notes": "Compiled from official ISO/RTO and utility interconnection queue data.",
        },
        "counties": records,
        "technology_counts": dict(sorted(technology_counts.items(), key=lambda item: (-item[1], item[0]))),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, separators=(",", ":"))
    if output_path.suffix.lower() == ".js":
        output_path.write_text(f"window.PLANNED_GENERATOR_QUEUE_DATA={serialized};\n", encoding="utf-8")
    else:
        output_path.write_text(serialized, encoding="utf-8")

    print(f"Wrote {len(records)} county-planned-generator records to {output_path}")


if __name__ == "__main__":
    main()
