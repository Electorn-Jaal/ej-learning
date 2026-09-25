"""Builds the school's timetable workbook from the database's own JSON.

    pnpm --filter @workspace/api-server export-timetable
    python scripts/src/build-timetable-xlsx.py \
        local-data/extracted/timetable.json \
        local-data/generated/timetable-export.xlsx

The layout is the school's, not a convenient one: teacher-and-subject rows
against weekday-and-period columns, a class name in each cell. Anybody
checking this against the paper on the wall should be able to do it by
looking, rather than by translating one shape into another.

A group label is written into the cell the way the school writes it - 6а-1
rather than 6а - because two halves of a class in the same period are two
different lessons and a grid that hides that says the teacher is in one place
when they are in two.
"""

import json
import sys
from pathlib import Path

# Windows consoles still default to cp1252, which cannot print a Mongolian
# filename let alone a subject. Without this the workbook is written and the
# script then dies on its own success message.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.utils import get_column_letter

WEEKDAYS = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан"]
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

# Three fixed columns before the grid: the teacher's department, their name,
# and the subject. The school's own sheet carries two numbering columns as
# well; those are a printing convenience and are left out, because a number
# that means nothing outside the page it is printed on is not worth exporting.
HEAD = ["Тэнхим", "Багшийн нэр", "Хичээл"]

THIN = Side(style="thin", color="999999")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTRE = Alignment(horizontal="center", vertical="center")


def main(source: Path, target: Path) -> int:
    data = json.loads(source.read_text(encoding="utf-8"))
    slots = data["slots"]
    if not slots:
        print("Хуваарь хоосон байна.", file=sys.stderr)
        return 1

    # How many periods each weekday actually runs to. Fixed at ten it would
    # print five empty columns for a school that stops at seven; taken from the
    # data it prints what the school has.
    per_day = {}
    for slot in slots:
        day = slot["weekdayNo"]
        per_day[day] = max(per_day.get(day, 0), slot["periodNo"])
    days = sorted(per_day)

    bells = {}
    for period in data.get("periods", []):
        if period["schoolYear"] == data.get("schoolYear"):
            bells[period["periodNo"]] = "%s-%s" % (period["startsAt"], period["endsAt"])

    # One row per teacher and subject, which is how the school reads it: a
    # teacher who takes two subjects appears twice, and each line is a thing
    # they are answerable for rather than a person.
    rows = {}
    for slot in slots:
        key = (slot["teacherCode"] or "", slot["teacherName"] or "—", slot["subjectName"])
        rows.setdefault(key, {})
        cell = slot["className"]
        if slot["groupLabel"]:
            cell = slot["groupLabel"]
        at = (slot["weekdayNo"], slot["periodNo"])
        # Two classes in one period is a clash, not a choice. It is written in
        # full rather than resolved, because the export exists to find these.
        if at in rows[key] and rows[key][at] != cell:
            rows[key][at] = rows[key][at] + " / " + cell
        else:
            rows[key][at] = cell

    wb = Workbook()
    ws = wb.active
    ws.title = data.get("schoolYear", "Хуваарь")

    ws.cell(1, 1, 'ЕРӨНХИЙ БОЛОВСРОЛЫН "ЭЛЕКТРОН ЖААЛ" СУРГУУЛЬ').font = Font(bold=True)
    ws.cell(2, 1, "%s оны хичээлийн жилийн хуваарь" % data.get("schoolYear", "")).font = Font(bold=True)
    ws.cell(3, 1, "Системээс гаргав. Цаг: %d" % len(slots))

    top, mid, low = 5, 6, 7
    for index, title in enumerate(HEAD, start=1):
        ws.cell(top, index, title).font = Font(bold=True)
        ws.merge_cells(start_row=top, start_column=index, end_row=low, end_column=index)
        ws.cell(top, index).alignment = CENTRE

    column = len(HEAD) + 1
    where = {}
    for day in days:
        first = column
        for period in range(1, per_day[day] + 1):
            where[(day, period)] = column
            ws.cell(mid, column, ROMAN[period - 1] if period <= len(ROMAN) else str(period))
            ws.cell(low, column, bells.get(period, ""))
            for row in (mid, low):
                ws.cell(row, column).alignment = CENTRE
                ws.cell(row, column).border = BOX
            ws.column_dimensions[get_column_letter(column)].width = 9
            column += 1
        ws.cell(top, first, WEEKDAYS[day - 1] if day <= len(WEEKDAYS) else str(day))
        ws.cell(top, first).font = Font(bold=True)
        ws.cell(top, first).alignment = CENTRE
        if column - 1 > first:
            ws.merge_cells(start_row=top, start_column=first, end_row=top, end_column=column - 1)

    order = sorted(rows, key=lambda key: (key[0] or "￿", key[1], key[2]))
    by_teacher = {}
    for key in order:
        by_teacher.setdefault(key[1], []).append(key)

    line = low + 1
    for key in order:
        code, teacher, subject = key
        # The name once per teacher, not once per row: the school's sheet does
        # the same, and a column of repeated names is harder to read down.
        first_of_teacher = by_teacher[teacher][0] == key
        ws.cell(line, 1, "")
        ws.cell(line, 2, teacher if first_of_teacher else "")
        ws.cell(line, 3, subject)
        for index in range(1, len(HEAD) + 1):
            ws.cell(line, index).border = BOX
        for at, cell in rows[key].items():
            if at in where:
                target_cell = ws.cell(line, where[at], cell)
                target_cell.alignment = CENTRE
        for at in where.values():
            ws.cell(line, at).border = BOX
        line += 1

    ws.column_dimensions["A"].width = 12
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 22
    ws.freeze_panes = ws.cell(low + 1, len(HEAD) + 1)

    target.parent.mkdir(parents=True, exist_ok=True)
    wb.save(target)
    print("Багш-хичээл %d мөр, цаг %d." % (len(rows), len(slots)))
    print(target)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(Path(sys.argv[1]), Path(sys.argv[2])))
