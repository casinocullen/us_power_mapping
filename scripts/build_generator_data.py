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


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: build_generator_data.py <plant_xlsx> <generator_xlsx> <output_json>")

    plant_path = Path(sys.argv[1])
    generator_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    plants = {}
    for index, row in enumerate(iter_sheet_rows(plant_path, "Plant")):
        if index < 2:
            continue

        plant_code = as_int(row.get("C", ""))
        lat = as_float(row.get("J", ""))
        lon = as_float(row.get("K", ""))
        if plant_code is None or lat is None or lon is None:
            continue

        plants[plant_code] = {
            "pc": plant_code,
            "pn": clean_text(row.get("D", "")),
            "u": clean_text(row.get("B", "")),
            "city": clean_text(row.get("F", "")),
            "st": clean_text(row.get("G", "")),
            "co": clean_text(row.get("I", "")),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
        }

    by_plant = {}
    tech_counts = defaultdict(int)

    for index, row in enumerate(iter_sheet_rows(generator_path, "Operable")):
        if index < 2:
            continue

        plant_code = as_int(row.get("C", ""))
        if plant_code is None or plant_code not in plants:
            continue

        status = clean_text(row.get("X", ""))
        if status not in {"OP", "OS", "SB"}:
            continue

        technology = clean_text(row.get("H", "")) or "Other"
        prime_mover = clean_text(row.get("I", ""))
        generator_id = clean_text(row.get("G", ""))
        nameplate = as_float(row.get("P", ""))
        summer = as_float(row.get("R", ""))
        winter = as_float(row.get("S", ""))

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
        ])

    records = []
    for plant_code, plant in by_plant.items():
        records.append({
            "pc": plant["pc"],
            "pn": plant["pn"],
            "u": plant["u"],
            "city": plant["city"],
            "st": plant["st"],
            "co": plant["co"],
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
            "name": "EIA Form 860 detailed data",
            "release": "Final 2024 data",
            "release_date": "2025-09-09",
        },
        "plants": records,
        "technology_counts": dict(sorted(tech_counts.items(), key=lambda item: (-item[1], item[0]))),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, separators=(",", ":"))
    if output_path.suffix.lower() == ".js":
        output_path.write_text(f"window.GENERATOR_PLANT_DATA={serialized};\n", encoding="utf-8")
    else:
        output_path.write_text(serialized, encoding="utf-8")

    print(f"Wrote {len(records)} plants to {output_path}")


if __name__ == "__main__":
    main()
