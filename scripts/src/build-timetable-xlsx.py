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

# Two fixed columns before the grid: the teacher and the subject.
#
# The school's own sheet also carries a department column and two numbering
# columns. The numbers are a printing convenience - a number that means
# nothing outside the page it is printed on is not worth exporting - and the
# department is dropped because our register does not hold the real ones: every
# teacher it knows about is filed under "Сургалтын алба", where the school's
# sheet distinguishes МХБЗАН, АХЗАН and the rest. An always-identical column is
# width spent on nothing, and it pushes the frozen edge a column further right.
HEAD = ["Багшийн нэр", "Хичээл"]

# Things the school writes into the cell where a class name goes, rather than
# on a row of their own. ИЗ is the one we know of: on the "Бага анги" rows the
# hour simply says ИЗ, and reading it back as a subject with a class in every
# cell - which is how the database holds it, correctly - would put a row on
# this sheet that the school does not recognise. The sheet is for reading
# beside the one on the wall, so it follows the wall.
CELL_SUBJECTS = {"ИЗ"}

THIN = Side(style="thin", color="999999")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTRE = Alignment(horizontal="center", vertical="center")
UPRIGHT = Alignment(horizontal="center", vertical="bottom", textRotation=90)


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
            ws.cell(mid, column).alignment = CENTRE
            ws.cell(mid, column).border = BOX
            # Upright. "08:00-08:40" laid flat forces a column wide enough to
            # hold it, and a week of those runs off the side of the paper; the
            # class names underneath need five characters, not eleven.
            ws.cell(low, column).alignment = UPRIGHT
            ws.cell(low, column).border = BOX
            ws.column_dimensions[get_column_letter(column)].width = 6
            column += 1
        ws.cell(top, first, WEEKDAYS[day - 1] if day <= len(WEEKDAYS) else str(day))
        ws.cell(top, first).font = Font(bold=True)
        ws.cell(top, first).alignment = CENTRE
        if column - 1 > first:
            ws.merge_cells(start_row=top, start_column=first, end_row=top, end_column=column - 1)

    # Fold the cell-written subjects into the teacher's other row. Where a
    # teacher has nothing else, the row stays - better a row the school does
    # not use than an hour that vanishes.
    for key in [k for k in rows if k[2] in CELL_SUBJECTS]:
        host = next((k for k in rows if k[1] == key[1] and k[2] not in CELL_SUBJECTS), None)
        if host is None:
            continue
        for at, _cell in rows[key].items():
            # Never over-write a real lesson: two things in one hour is a
            # clash, and the sheet says so rather than choosing.
            if at in rows[host] and rows[host][at] != key[2]:
                rows[host][at] = rows[host][at] + " / " + key[2]
            else:
                rows[host][at] = key[2]
        del rows[key]

    order = sorted(rows, key=lambda key: (key[0] or "￿", key[1], key[2]))
    by_teacher = {}
    for key in order:
        by_teacher.setdefault(key[1], []).append(key)

    line = low + 1
    for key in order:
        _code, teacher, subject = key
        # The name once per teacher, not once per row: the school's sheet does
        # the same, and a column of repeated names is harder to read down.
        first_of_teacher = by_teacher[teacher][0] == key
        ws.cell(line, 1, teacher if first_of_teacher else "")
        ws.cell(line, 2, subject)
        for index in range(1, len(HEAD) + 1):
            ws.cell(line, index).border = BOX
        for at, cell in rows[key].items():
            if at in where:
                target_cell = ws.cell(line, where[at], cell)
                target_cell.alignment = CENTRE
        for at in where.values():
            ws.cell(line, at).border = BOX

        # A double or triple session becomes one box, the way the school draws
        # it. Three adjacent hours all saying "10-12-р анги" is one lesson that
        # runs for three hours, and three separate boxes read as three
        # lessons - which is exactly how the school's own merged cells were
        # misread on the way in.
        #
        # Only within a weekday: the last hour of Monday and the first of
        # Tuesday are adjacent on the page and a week apart in the room.
        for day in days:
            period = 1
            while period <= per_day[day]:
                value = rows[key].get((day, period))
                run = period
                while (run + 1 <= per_day[day]
                       and value is not None
                       and rows[key].get((day, run + 1)) == value):
                    run += 1
                if run > period:
                    ws.merge_cells(
                        start_row=line, start_column=where[(day, period)],
                        end_row=line, end_column=where[(day, run)],
                    )
                period = run + 1
        line += 1

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 24
    ws.row_dimensions[low].height = 62
    # Everything left of the first hour and above the first teacher stays put.
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
