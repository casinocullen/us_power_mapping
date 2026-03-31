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


def as_float(value: str) -> float | None:
    try:
        stripped = value.strip()
        if not stripped:
            return None
        return float(stripped)
    except Exception:
        return None


def as_int(value: str) -> int | None:
    try:
        stripped = value.strip()
        if not stripped:
            return None
        return int(float(stripped))
    except Exception:
        return None


def clean_text(value: str) -> str:
    return " ".join((value or "").strip().split())


def as_month_text(value: str) -> str:
    month = as_int(value)
    if month is None or month < 1 or month > 12:
        return ""
    return str(month)


def infer_release_label(xlsx_path: Path) -> str:
    match = re.search(r"([a-z]+)_generator(\d{4})", xlsx_path.stem, re.IGNORECASE)
    if not match:
        return xlsx_path.stem
    return f"{match.group(1).capitalize()} {match.group(2)}"


def main():
    if len(sys.argv) < 3:
        raise SystemExit(
            "Usage: build_generator_data.py <eia860m_xlsx> <output_json> [release_label] [release_date] [source_url]"
        )

    workbook_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    release_label = sys.argv[3] if len(sys.argv) >= 4 else infer_release_label(workbook_path)
    release_date = sys.argv[4] if len(sys.argv) >= 5 else ""
    source_url = sys.argv[5] if len(sys.argv) >= 6 else "https://www.eia.gov/electricity/data/eia860m/"

    header_row = None
    plants = {}
    by_plant = {}
    tech_counts = defaultdict(int)

    for index, row in enumerate(iter_sheet_rows(workbook_path, "Operating")):
        if index == 2:
            header_row = {column: clean_text(value) for column, value in row.items()}
            continue

        if index < 3 or not header_row:
            continue

        values = {header_row.get(column, column): clean_text(value) for column, value in row.items()}
        plant_code = as_int(values.get("Plant ID", ""))
        lat = as_float(values.get("Latitude", ""))
        lon = as_float(values.get("Longitude", ""))
        if plant_code is None or lat is None or lon is None:
            continue

        status = clean_text(values.get("Status", ""))
        if not status:
            continue

        plants.setdefault(
            plant_code,
            {
                "pc": plant_code,
                "pn": clean_text(values.get("Plant Name", "")),
                "u": clean_text(values.get("Entity Name", "")),
                "city": "",
                "st": clean_text(values.get("Plant State", "")),
                "co": clean_text(values.get("County", "")),
                "ba": clean_text(values.get("Balancing Authority Code", "")),
                "sector": clean_text(values.get("Sector", "")),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
            },
        )

        technology = clean_text(values.get("Technology", "")) or "Other"
        prime_mover = clean_text(values.get("Prime Mover Code", ""))
        generator_id = clean_text(values.get("Generator ID", ""))
        nameplate = as_float(values.get("Nameplate Capacity (MW)", ""))
        summer = as_float(values.get("Net Summer Capacity (MW)", ""))
        winter = as_float(values.get("Net Winter Capacity (MW)", ""))
        operating_month = as_month_text(values.get("Operating Month", ""))
        operating_year = clean_text(values.get("Operating Year", ""))

        plant_entry = by_plant.setdefault(
            plant_code,
            {
                **plants[plant_code],
                "gc": 0,
                "nmw": 0.0,
                "smw": 0.0,
                "wmw": 0.0,
                "tech": defaultdict(int),
                "g": [],
            },
        )

        plant_entry["gc"] += 1
        if nameplate is not None:
            plant_entry["nmw"] += nameplate
        if summer is not None:
            plant_entry["smw"] += summer
        if winter is not None:
            plant_entry["wmw"] += winter

        plant_entry["tech"][technology] += 1
        tech_counts[technology] += 1
        plant_entry["g"].append([
            generator_id,
            technology,
            prime_mover,
            status,
            round(nameplate, 3) if nameplate is not None else None,
            round(summer, 3) if summer is not None else None,
            round(winter, 3) if winter is not None else None,
            operating_month,
            operating_year,
        ])

    records = []
    for plant in by_plant.values():
        records.append({
            "pc": plant["pc"],
            "pn": plant["pn"],
            "u": plant["u"],
            "city": plant["city"],
            "st": plant["st"],
            "co": plant["co"],
            "ba": plant["ba"],
            "sector": plant["sector"],
            "lat": plant["lat"],
            "lon": plant["lon"],
            "gc": plant["gc"],
            "nmw": round(plant["nmw"], 3),
            "smw": round(plant["smw"], 3),
            "wmw": round(plant["wmw"], 3),
            "tech": dict(sorted(plant["tech"].items(), key=lambda item: (-item[1], item[0]))),
            "g": sorted(plant["g"], key=lambda item: (item[1], item[0])),
        })

    records.sort(key=lambda item: (-item["smw"], item["pn"], item["pc"]))
    payload = {
        "source": {
            "name": "EIA 860M Preliminary Monthly Electric Generator Inventory",
            "release": release_label,
            "release_date": release_date,
            "source_url": source_url,
            "notes": "Built from the Operating tab of the monthly EIA-860M workbook.",
        },
        "plants": records,
        "technology_counts": dict(sorted(tech_counts.items(), key=lambda item: (-item[1], item[0]))),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, separators=(",", ":"))
    output_path.write_text(serialized, encoding="utf-8")

    print(f"Wrote {len(records)} plants to {output_path}")


if __name__ == "__main__":
    main()
