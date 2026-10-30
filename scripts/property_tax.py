"""Validate and export the Auditor's separate calendar-year millage dataset."""
import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "property-tax"
RATE_FIELDS = ("countyMills", "schoolMills", "fireMills", "otherMills",
               "cityMills", "sanitationMills", "arenaMills")


def build_data(input_dir=INPUT):
    meta = json.loads((input_dir / "source-2025.json").read_text())
    with (input_dir / "millage-2025.csv").open(newline="") as handle:
        raw_rows = list(csv.DictReader(handle))
    codes = [row["code"] for row in raw_rows]
    if len(codes) != meta["expectedDistricts"] or len(set(codes)) != len(codes):
        raise ValueError("Millage district count or uniqueness changed")
    components = sum(Decimal(str(c["mills"])) for c in meta["countyComponents"])
    school = (Decimal(str(meta["greenvilleSchoolOperationsMills"]))
              + Decimal(str(meta["greenvilleSchoolDebtMills"])))
    districts = []
    for row in raw_rows:
        if not (len(row["code"]) == 3 and row["code"].isdigit()):
            raise ValueError("Invalid district code")
        rates = {key: Decimal(row[key] or "0") for key in RATE_FIELDS}
        total = Decimal(row["totalMills"])
        if any(not v.is_finite() or v < 0 for v in [*rates.values(), total]):
            raise ValueError(f"Invalid rate in district {row['code']}")
        if sum(rates.values()) != total:
            raise ValueError(f"Printed total mismatch in district {row['code']}")
        if rates["countyMills"] != components:
            raise ValueError("County components do not reconcile")
        if row["schoolName"] == "Greenville" and rates["schoolMills"] != school:
            raise ValueError("School components do not reconcile")
        for name, mills in [("fireName", "fireMills"), ("otherName", "otherMills"),
                            ("cityName", "cityMills"), ("sanitationName", "sanitationMills")]:
            if bool(row[name]) != bool(row[mills]):
                raise ValueError(f"Unpaired recipient/rate in {row['code']}")
        page = int(row["sourcePage"])
        if not 1 <= page <= 4:
            raise ValueError("Invalid source page")
        districts.append({**row, **{k: float(v) for k, v in rates.items()},
                          "totalMills": float(total), "sourcePage": page})
    digest = hashlib.sha256()
    for name in ("source-2025.json", "millage-2025.csv"):
        digest.update((input_dir / name).read_bytes())
    return {**meta, "version": digest.hexdigest()[:12], "districts": districts}


def export_property_tax(out_dir):
    data = build_data()
    components = {component["id"]: component["mills"] for component in data["countyComponents"]}
    target = out_dir / "data" / "property-tax" / "2025.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    download = out_dir / "public" / "downloads" / "property-tax" / "millage-2025.csv"
    download.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for district in data["districts"]:
        rows.append({"taxYear": data["taxYear"], **district,
                     "countyOperationsMills": components["county-operations"],
                     "countyDebtMills": components["county-debt"],
                     "libraryMills": components["library"],
                     "technicalCollegeMills": components["technical-college"],
                     "museumOperationsMills": components["museum-operations"],
                     "museumDebtMills": components["museum-debt"],
                     "schoolOperationsMills": data["greenvilleSchoolOperationsMills"] if district["schoolName"] == "Greenville" else "",
                     "schoolDebtMills": data["greenvilleSchoolDebtMills"] if district["schoolName"] == "Greenville" else "",
                     "componentSourcePage": data["componentSourcePage"],
                     "rateBasis": "Published full millage before legal-residence school relief or other exemptions/credits; excludes fees and penalties. Not a tax bill.",
                     "schoolSplitStatus": "verified" if district["schoolName"] == "Greenville" else "not_verified",
                     "sourceUrl": data["sourceUrl"], "sourceSha256": data["sourceSha256"],
                     "verifiedOn": data["verifiedOn"], "version": data["version"]})
    with download.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return [target, download]


if __name__ == "__main__":
    for path in export_property_tax(ROOT / "web"):
        print(path.relative_to(ROOT))
