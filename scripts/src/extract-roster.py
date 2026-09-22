"""Extracts the school's teacher and student workbooks to JSON, without interpreting them.

    python scripts/src/extract-roster.py \
        "Багш нарын бүртгэл 2026-2027.xlsx" \
        "Сурагчийн мэдээлэл 2026-2027.xlsx" \
        local-data/extracted/roster.json

Same split as extract-cefr.py and extract-daily-schedule.py: spreadsheet
parsing lives where the tooling is, and the TypeScript importer decides what
any of it means. Nothing here drops a row, fixes a spelling or picks which
sheet is authoritative - that is the importer's job, and a rule applied here
would be invisible to it.

## What the workbooks are

The teacher workbook is one flat sheet exported from the ministry's system:
thirty staff, a header on row 1, no merged cells. Everything in it is a
column.

The student workbook is six sheets that mean six different things, and only
one of them is this year's register:

  Нийт сурагч             this year's roll, header on row 3 under a merged
                          title. Two columns are both called "Системд", so
                          they are read positionally.
  шинэ бүртгэсэн          children registered since the year began, a subset
                          of the roll - kept so the importer can see the two
                          disagree where they do.
  Шилжсэн сурагч          children who left. Two header rows, the second
                          naming sub-columns under merged pairs.
  2025-2026 оны сурагчид  last year's roll, which is what says whether a
                          child who is no longer listed left or was dropped.
  Тоо мэдээ               the school's own count per class, with its own
                          two-row header. It is the only independent check on
                          the roll, so it comes across as numbers.
  Шинэ элсэлт 2026-2027   the admissions pipeline, not a register: most rows
                          have no registration number and many are enquiries.
                          Extracted, but the importer is not expected to
                          enrol from it.

## Registration numbers

Every row keeps whatever was typed, including the blanks and the one case
where two sheets spell the same child's number differently. Deciding which is
right needs the school, not a script.

The output holds real registration numbers, so it is written under
local-data/, which is not in Git. See docs/data-requirements.md.
"""

import datetime as dt
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

import openpyxl


def json_value(value):
    """Return a JSON-safe value without turning numbers into text.

    Dates and times need an explicit type marker because JSON has no native
    representation for them. Everything else keeps the value and type that
    openpyxl read from the workbook.
    """
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return {"type": type(value).__name__, "value": value.isoformat()}
    return value


def raw_workbook(path: Path) -> dict:
    """Capture every populated cell and the layout needed to locate it.

    This is the evidence layer. It does not choose an authoritative sheet,
    rename a column, normalize text or drop a populated cell. Formulas are
    retained as formulas; the cached result is included when Excel saved one.
    """
    formulas = openpyxl.load_workbook(path, data_only=False)
    cached = openpyxl.load_workbook(path, data_only=True)
    sheets = []

    for sheet_name in formulas.sheetnames:
        sheet = formulas[sheet_name]
        cached_sheet = cached[sheet_name]
        cells = []
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                record = {
                    "row": cell.row,
                    "column": cell.column,
                    "coordinate": cell.coordinate,
                    "dataType": cell.data_type,
                    "value": json_value(cell.value),
                }
                if cell.data_type == "f":
                    record["cachedValue"] = json_value(cached_sheet[cell.coordinate].value)
                cells.append(record)

        sheets.append(
            {
                "name": sheet_name,
                "maxRow": sheet.max_row,
                "maxColumn": sheet.max_column,
                "mergedRanges": [str(area) for area in sheet.merged_cells.ranges],
                "cells": cells,
            }
        )

    return {
        "file": path.name,
        "sizeBytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "sheets": sheets,
    }


def norm(value) -> str:
    """Cell text with the invisible differences taken out.

    Excel hands back non-breaking spaces from pasted text and the odd
    full-width digit, and a registration number that differs from another only
    by an invisible character is worse than one that differs visibly: it looks
    identical in every report while failing every comparison.
    """
    if value is None:
        return ""
    return unicodedata.normalize("NFKC", str(value)).replace("\u00a0", " ").strip()


def header_names(sheet, header_rows: tuple[int, ...]) -> list[str]:
    """Column names, read across however many rows the header spans.

    Шилжсэн сурагч heads five columns on one row and then, under two merged
    pairs, names their halves on the row below. Reading either row alone loses
    something: the upper one calls two columns "Хөдөлгөөний мэдээлэл" and the
    lower one leaves the first five nameless. So the lower row wins where it
    has a word and the upper row stands in where it does not.
    """
    names = []
    for c in range(1, sheet.max_column + 1):
        parts = [norm(sheet.cell(row=r, column=c).value) for r in header_rows]
        names.append(next((p for p in reversed(parts) if p), ""))
    return names


def rows_under(sheet, header_row, stop_blank: bool = False) -> list[dict]:
    """Every row below a header, keyed by that header's own words.

    `header_row` may be a tuple when the header spans more than one row; rows
    are read from below the last of them.

    Column names repeat in these sheets, so a repeated name gets its column
    number appended rather than overwriting the first one. An unnamed column
    keeps its position too - dropping it would silently lose data the school
    may be relying on.
    """
    header_rows = (header_row,) if isinstance(header_row, int) else tuple(header_row)
    headers = header_names(sheet, header_rows)
    header_row = max(header_rows)
    out: list[dict] = []
    for r in range(header_row + 1, sheet.max_row + 1):
        record: dict[str, object] = {"_row": r}
        for c in range(1, sheet.max_column + 1):
            key = headers[c - 1] or f"col{c}"
            if key in record:
                key = f"{key}__{c}"
            record[key] = norm(sheet.cell(row=r, column=c).value)
        if not any(v for k, v in record.items() if k != "_row"):
            if stop_blank:
                break
            continue
        out.append(record)
    return out


def counts_sheet(sheet) -> list[dict]:
    """The school's own per-class totals.

    The header spans rows 3 and 4 with merged cells above single ones, so the
    columns are taken by position rather than by name. Only the class and the
    headcount are read: the dated columns are a history of the count, and the
    importer is checking today's roll, not how it got here.
    """
    out = []
    for r in range(5, sheet.max_row + 1):
        label = norm(sheet.cell(row=r, column=2).value)
        headcount = sheet.cell(row=r, column=12).value
        if not label:
            continue
        out.append(
            {
                "_row": r,
                "label": label,
                "headcount": int(headcount) if isinstance(headcount, (int, float)) else None,
            }
        )
    return out


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2

    teacher_path, student_path, target = (Path(a) for a in sys.argv[1:4])
    for path in (teacher_path, student_path):
        if not path.exists():
            print(f"Missing workbook: {path}")
            return 1

    teachers_wb = openpyxl.load_workbook(teacher_path, data_only=True)
    students_wb = openpyxl.load_workbook(student_path, data_only=True)

    payload = {
        "source": {
            "teachers": teacher_path.name,
            "students": student_path.name,
        },
        "raw": {
            "teachers": raw_workbook(teacher_path),
            "students": raw_workbook(student_path),
        },
        # Convenience views are deliberately separate from raw. The importer
        # may filter and validate these, but every decision remains auditable
        # against the original cell coordinates above.
        "views": {
            "staff": rows_under(teachers_wb[teachers_wb.sheetnames[0]], 1),
            "roll": rows_under(students_wb["Нийт сурагч"], 3),
            "newlyRegistered": rows_under(students_wb["шинэ бүртгэсэн"], 1),
            "transferredOut": rows_under(students_wb["Шилжсэн сурагч"], (2, 3)),
            "previousYear": rows_under(students_wb["2025-2026 оны сурагчид"], 3),
            "statedCounts": counts_sheet(students_wb["Тоо мэдээ "]),
            "admissions": rows_under(students_wb["Шинэ элсэлт 2026-2027"], 2),
        },
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {target}")
    for key in ("staff", "roll", "newlyRegistered", "transferredOut", "previousYear",
                "statedCounts", "admissions"):
        print(f"  {key:16s} {len(payload['views'][key]):4d} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
