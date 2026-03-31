import re
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path


EIA_860M_URL = "https://www.eia.gov/electricity/data/eia860m/"
MONTH_TO_NUMBER = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_latest_release(html: str) -> tuple[str, str]:
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
    matches = re.findall(
        r'href="(?P<href>/electricity/data/eia860m/xls/(?P<file>(?P<month>[a-z]+)_generator(?P<year>\d{4})\.xlsx))"',
        html,
        flags=re.IGNORECASE,
    )
    if not matches:
        raise RuntimeError("Unable to find any EIA 860M workbook links on the EIA page.")

    latest = max(matches, key=lambda item: (int(item[3]), MONTH_TO_NUMBER[item[2].lower()]))
    href = latest[0]
    month = latest[2].capitalize()
    year = latest[3]
    return f"https://www.eia.gov{href}", f"{month} {year}"


def parse_release_date(html: str) -> str:
    match = re.search(
        r'Release Date:</span>\s*<span class="date">([A-Za-z]+ \d{1,2}, \d{4})</span>',
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        return ""
    return datetime.strptime(match.group(1), "%B %d, %Y").date().isoformat()


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request) as response:
        destination.write_bytes(response.read())


def run_builder(script: Path, workbook: Path, output_path: Path, release_label: str, release_date: str) -> None:
    subprocess.run(
        [sys.executable, str(script), str(workbook), str(output_path), release_label, release_date, EIA_860M_URL],
        check=True,
    )


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    html = fetch_text(EIA_860M_URL)
    workbook_url, release_label = parse_latest_release(html)
    release_date = parse_release_date(html)
    workbook_name = workbook_url.rsplit("/", 1)[-1]
    workbook_path = repo_root / "data" / "eia860m" / workbook_name

    download_file(workbook_url, workbook_path)
    run_builder(repo_root / "scripts" / "build_generator_data.py", workbook_path, repo_root / "data" / "generator_data_860m.json", release_label, release_date)
    run_builder(repo_root / "scripts" / "build_planned_generator_data.py", workbook_path, repo_root / "data" / "planned_generator_data_860m.json", release_label, release_date)

    print(f"Updated EIA 860M assets from {release_label} ({release_date or 'release date unavailable'})")


if __name__ == "__main__":
    main()
