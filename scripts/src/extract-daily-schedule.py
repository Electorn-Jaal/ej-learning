"""Extracts the Daily Learning Schedule sheet to JSON, without interpreting it.

    python scripts/src/extract-daily-schedule.py <workbook.xlsx> local-data/extracted/daily-schedule.json

Same split as extract-cefr.py: spreadsheet parsing lives where the tooling is,
and the TypeScript importer decides what any of it means.

The sheet is 1880 rows of one student on one day, but the plan behind it is not
per student. There are 120 (level, week, day) slots and 117 of them hold a
single plan, so the rows are 91 students each following their level's timetable.
The three slots that differ are not noise: one variant carries
"[ADAPTIVE PRIORITY] ... REVIEW AND RETEST", which is the source system's own
remediation for students it had already measured. Collapsing those would throw
away the one place this data records an adaptive decision.

So plans are grouped by their content rather than by the slot: identical plans
become one, and a slot with two genuinely different plans stays as two, with
each student pointing at the one they were actually given.
"""

import hashlib
import json
import sys
from pathlib import Path

import openpyxl

COLUMNS = (
    "Student Code",
    "CEFR",
    "Week",
    "Day",
    "Focus Skills",
    "Book / Source",
    "Unit / Focus",
    "Pages",
    "Student Task",
    "Teacher Check",
    "Target",
    "Score",
    "Status",
)

# The part of a row that describes the work, as opposed to who did it and how
# it went. Two rows agreeing on all of this are the same plan.
PLAN_FIELDS = (
    "Focus Skills",
    "Book / Source",
    "Unit / Focus",
    "Pages",
    "Student Task",
    "Teacher Check",
    "Target",
)


def clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def main(source: Path, target: Path) -> None:
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    if "Daily Learning Schedule" not in workbook.sheetnames:
        raise SystemExit("Sheet 'Daily Learning Schedule' not found.")

    rows = list(workbook["Daily Learning Schedule"].iter_rows(values_only=True))
    header = [str(c).strip() if c is not None else "" for c in rows[0]]
    missing = [c for c in COLUMNS if c not in header]
    if missing:
        raise SystemExit(f"Columns missing from the sheet: {', '.join(missing)}")
    at = {name: header.index(name) for name in COLUMNS}

    plans: dict[str, dict] = {}
    entries: list[dict] = []
    skipped = 0

    for row in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in row):
            continue

        record = {name: clean(row[at[name]]) for name in COLUMNS}
        if not record["Student Code"] or not record["CEFR"]:
            skipped += 1
            continue
        if not record["Week"] or not record["Day"]:
            skipped += 1
            continue

        plan = {name: record[name] for name in PLAN_FIELDS}
        signature = "\x1f".join(
            f"{record['CEFR']}|{record['Week']}|{record['Day']}|"
            + "|".join(plan[name] or "" for name in PLAN_FIELDS)
        )
        planId = hashlib.sha256(signature.encode("utf-8")).hexdigest()[:12]

        if planId not in plans:
            plans[planId] = {
                "planId": planId,
                "level": record["CEFR"],
                "week": record["Week"],
                "day": record["Day"],
                **plan,
            }

        entries.append(
            {
                "planId": planId,
                "studentCode": record["Student Code"],
                "level": record["CEFR"],
                "week": record["Week"],
                "day": record["Day"],
                # Kept verbatim. These are the source system's own judgements
                # about how the day went, and it is not this script's place to
                # decide whether "NOT ASSESSED" means anything.
                "score": record["Score"],
                "status": record["Status"],
            }
        )

    payload = {
        "source": source.name,
        "sheet": "Daily Learning Schedule",
        "planCount": len(plans),
        "entryCount": len(entries),
        "skippedRows": skipped,
        "plans": sorted(plans.values(), key=lambda p: (p["level"], p["week"], p["day"], p["planId"])),
        "entries": entries,
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    adaptive = sum(1 for p in plans.values() if p["Student Task"] and "ADAPTIVE PRIORITY" in p["Student Task"])
    print(f"{len(entries)} entries for {len({e['studentCode'] for e in entries})} students")
    print(f"{len(plans)} distinct plans, of which {adaptive} are adaptive retests")
    if skipped:
        print(f"{skipped} row(s) skipped for a missing student, level, week or day")
    print(f"Written to {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
