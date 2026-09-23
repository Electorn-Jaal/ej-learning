"""Extracts the CEFR placement workbook to JSON, without interpreting it.

Parsing spreadsheets belongs where the tooling is, so this does the reading and
the TypeScript importer does the loading. Nothing here cleans or decides: the
class codes stay as typed, junk student codes are carried through, and the
importer is what validates them - because the raw rows have to reach
staging.import_rows intact for a later re-run to be possible.

One thing it does correct, and only because the source is unrecoverable
otherwise: Grade / Class is read from `Form Responses 1`, never from the
derived sheets. Sheets read "8-1" as a date and wrote 2026-08-01, destroying
the class in every sheet computed from it.

Every sheet in the workbook is extracted, named or not. An earlier version
listed five sheets by name and the workbook has eighteen, so the per-child
weekly and daily plans - 2424 and 1880 rows of them - were invisible to
everything downstream. Naming sheets to read is a decision that silently
expires the next time the school adds one; reading them all and letting the
importer choose does not.

    python scripts/src/extract-cefr.py <workbook.xlsx> local-data/extracted/cefr-extract.json
"""

import json
import re
import sys
from pathlib import Path

import openpyxl

ITEM_HEADER = re.compile(r"\[(CEFR-\d+)\]\[([^\]]+)\]\[([^\]]+)\]\s*(.*)", re.S)


def sheet_rows(wb, name):
    """Header row as keys, remaining rows as dicts. Blank trailing rows dropped."""
    if name not in wb.sheetnames:
        return []
    rows = list(wb[name].iter_rows(values_only=True))
    if not rows:
        return []
    header = [str(c).strip() if c is not None else "" for c in rows[0]]
    out = []
    for row in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in row):
            continue
        out.append(
            {
                header[i]: (None if v is None else str(v).strip())
                for i, v in enumerate(row)
                if i < len(header) and header[i]
            }
        )
    return out


def main(source: Path, target: Path) -> None:
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)

    responses = list(wb["Form Responses 1"].iter_rows(values_only=True))
    header = [str(c) if c is not None else "" for c in responses[0]]

    # A duplicate, entirely empty CEFR-016 column makes the count 61. Dropping
    # empty item columns leaves the 60 the score is actually out of.
    item_cols = [
        i
        for i, h in enumerate(header)
        if h.startswith("[CEFR-")
        and any(r[i] is not None for r in responses[1:] if i < len(r))
    ]

    items = []
    for order, i in enumerate(item_cols, start=1):
        code, level, domain, prompt = ITEM_HEADER.match(header[i]).groups()
        options = sorted(
            {
                str(r[i]).strip()
                for r in responses[1:]
                if i < len(r) and r[i] is not None and str(r[i]).strip()
            }
        )
        items.append(
            {
                "itemCode": code,
                "level": level,
                "domain": domain,
                "prompt": " ".join(prompt.split()),
                "itemOrder": order,
                "observedOptions": options,
            }
        )

    submissions = []
    idx = {name: header.index(name) for name in ("Timestamp", "Score", "Student Code", "Grade / Class") if name in header}
    for r in responses[1:]:
        if idx.get("Score") is None or idx["Score"] >= len(r) or r[idx["Score"]] is None:
            continue
        answers = {}
        for i in item_cols:
            code = ITEM_HEADER.match(header[i]).group(1)
            answers[code] = (
                str(r[i]).strip() if i < len(r) and r[i] is not None and str(r[i]).strip() else None
            )
        submissions.append(
            {
                "timestamp": str(r[idx["Timestamp"]]) if idx.get("Timestamp") is not None and idx["Timestamp"] < len(r) and r[idx["Timestamp"]] is not None else None,
                "rawStudentCode": str(r[idx["Student Code"]]).strip() if idx.get("Student Code") is not None and idx["Student Code"] < len(r) and r[idx["Student Code"]] is not None else None,
                # Read here on purpose; the derived sheets hold dates instead.
                "rawClass": str(r[idx["Grade / Class"]]).strip() if idx.get("Grade / Class") is not None and idx["Grade / Class"] < len(r) and r[idx["Grade / Class"]] is not None else None,
                "score": int(r[idx["Score"]]),
                "answers": answers,
            }
        )

    # Every sheet, under its own name, so a sheet nobody has looked at yet is
    # still in the file when somebody does.
    sheets = {name: sheet_rows(wb, name) for name in wb.sheetnames}

    payload = {
        "source": source.name,
        "sheetsRead": list(wb.sheetnames),
        "itemCount": len(items),
        "submissionCount": len(submissions),
        "items": items,
        "submissions": submissions,
        # The five the importers already read, kept at their existing keys so
        # nothing that works today has to change to pick up the other thirteen.
        "resourceMap": sheets.get("Resource Map", []),
        "rubrics": sheets.get("Productive Rubrics", []),
        "teacherScripts": sheets.get("Teacher Scripts", []),
        "cefrResults": sheets.get("CEFR Results", []),
        "sheets": sheets,
    }
    wb.close()

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{target}: {len(items)} items, {len(submissions)} submissions")
    for name, rows in sheets.items():
        if rows:
            print(f"  {name}: {len(rows)} rows")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
