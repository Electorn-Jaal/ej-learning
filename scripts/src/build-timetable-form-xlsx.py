"""Builds the school's fill-in timetable workbook from the database's own JSON.

    pnpm --filter @workspace/api-server export-timetable
    python scripts/src/build-timetable-form-xlsx.py \
        local-data/extracted/timetable.json \
        local-data/generated/timetable-form.xlsx

The school keeps its timetable in two shapes and needs both. The other builder,
build-timetable-xlsx.py, produces the one that goes on the wall: teachers down
the side, the week across the top, a class in every cell. This one produces the
one they fill in: a sheet per class, the week across the top, and a SUBJECT in
every cell.

The difference is not cosmetic. The wall sheet answers "where is this teacher
at ten past nine"; the form answers "what does 9а have on Tuesday", and it
splits what from who - the subject goes in the grid, and the teacher who takes
it is named once on a separate sheet. A school filling in a blank timetable
thinks class by class, which is why their own form is built this way.

Sheets, in the order the school's form has them:

    Заавар             how to fill it in
    Жагсаалт           the lists the dropdowns draw from
    Цагийн хуваарь     the bells
    1а … 12а           one per class, the grid to fill
    Багш хуваарилалт   class + subject -> teacher

Produced filled rather than blank: filling it is what makes it checkable
against the paper, and blanking it is one delete away.
"""

import json
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

WEEKDAYS = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан"]

THIN = Side(style="thin", color="999999")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTRE = Alignment(horizontal="center", vertical="center")
WRAP = Alignment(horizontal="center", vertical="center", wrap_text=True)
HEADER = Font(bold=True)
SHADE = PatternFill("solid", fgColor="EFEFEF")

INSTRUCTIONS = [
    ("Юуг бөглөх вэ", True),
    ("Энэ хуудсууд системээс гарсан. Одоо байгаа хуваарь бөглөгдсөн байгаа —"
     " шалгаж, өөрчлөх хэрэгтэйг нь засна.", False),
    ("", False),
    ("Хоёр зүйл", True),
    ("1. Анги бүрийн хуудсанд цаг, гараг тус бүрд ХИЧЭЭЛИЙН нэрийг бичнэ."
     " Багшийг нь энд бичихгүй.", False),
    ("2. «Багш хуваарилалт» хуудсанд анги, хичээл бүрд хэн заахыг бичнэ.", False),
    ("", False),
    ("Хаанаас сонгох вэ", True),
    ("«Жагсаалт» хуудсанд байгаа нэрсийг ашиглана. Тэнд байхгүй хичээл, багш"
     " гарвал эхлээд тэр хуудсанд нэмнэ — үгүй бол системд таарахгүй.", False),
    ("", False),
    ("Анхаарах зүйл", True),
    ("· Хичээл ороогүй цагийг хоосон үлдээнэ. Зураас, «-» гэх мэт тэмдэг"
     " тавихгүй.", False),
    ("· Анги хоёр бүлэг болж хуваагддаг цагийг хичээлийн нэрийн ард хаалтанд"
     " бүлгээ бичиж өгнө: «Дизайн технологи (6а-1)».", False),
    ("· Хэд хэдэн анги нийлдэг цагийг мөн хаалтанд бичнэ:"
     " «Биеийн тамир (6-7-р анги)».", False),
    ("· Дугуйлан энд ороогүй. Тэр нь ангид харьяалагддаггүй тул системийн"
     " «Дугуйлан» хуудсанд тусдаа бүртгэгдэнэ.", False),
]


def sheet_title(name):
    """Excel forbids : \\ / ? * [ ] in a sheet name and caps it at 31 chars."""
    cleaned = "".join("-" if ch in ':\\/?*[]' else ch for ch in str(name))
    return cleaned[:31] or "?"


def main(source: Path, target: Path) -> int:
    data = json.loads(source.read_text(encoding="utf-8"))
    slots = data["slots"]
    if not slots:
        print("Хуваарь хоосон байна.", file=sys.stderr)
        return 1

    year = data.get("schoolYear", "")
    bells = {}
    for period in data.get("periods", []):
        if period["schoolYear"] == year:
            bells[period["periodNo"]] = (period["startsAt"], period["endsAt"])

    classes = sorted(
        {row["className"] for row in slots if row["className"]},
        # 1а before 10а: the school reads its classes by year, and a plain
        # sort puts 10а second.
        key=lambda name: (int("".join(ch for ch in name if ch.isdigit()) or 0), name),
    )
    subjects = sorted({row["subjectName"] for row in slots if row["subjectName"]})
    teachers = sorted({row["teacherName"] for row in slots if row["teacherName"]})

    # class -> (weekday, period) -> what is taught
    grid = {name: {} for name in classes}
    # class -> subject -> teachers who take it
    who = {}
    last_period = 0
    for row in slots:
        name = row["className"]
        if not name:
            continue
        last_period = max(last_period, row["periodNo"])
        # The group in brackets, the way the instructions ask the school to
        # write it. Without it a split class reads as the whole class being in
        # two places.
        text = row["subjectName"]
        if row["groupLabel"]:
            text = f"{text} ({row['groupLabel']})"
        at = (row["weekdayNo"], row["periodNo"])
        if at in grid[name] and grid[name][at] != text:
            grid[name][at] = grid[name][at] + " / " + text
        else:
            grid[name][at] = text
        if row["teacherName"]:
            who.setdefault(name, {}).setdefault(row["subjectName"], set()).add(row["teacherName"])

    wb = Workbook()

    # ------------------------------------------------------------ Заавар
    ws = wb.active
    ws.title = "Заавар"
    ws.cell(1, 1, f"ХИЧЭЭЛИЙН ХУВААРЬ — {year}").font = Font(bold=True, size=14)
    line = 3
    for text, bold in INSTRUCTIONS:
        cell = ws.cell(line, 2, text)
        if bold:
            cell.font = HEADER
        cell.alignment = Alignment(vertical="top", wrap_text=True)
        line += 1
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 96

    # ---------------------------------------------------------- Жагсаалт
    ws = wb.create_sheet("Жагсаалт")
    ws.cell(1, 1, "Бүх сонголт эндээс. Энд байхгүй нэр системд таарахгүй.").font = HEADER
    for index, title in enumerate(["Багш", "Хичээл", "Анги"], start=1):
        cell = ws.cell(2, index, title)
        cell.font = HEADER
        cell.fill = SHADE
        cell.border = BOX
        ws.column_dimensions[get_column_letter(index)].width = 28
    for index, column in enumerate([teachers, subjects, classes], start=1):
        for offset, value in enumerate(column):
            ws.cell(3 + offset, index, value).border = BOX
    lists = ws

    # ---------------------------------------------------- Цагийн хуваарь
    ws = wb.create_sheet("Цагийн хуваарь")
    ws.cell(1, 1, "Цагийн хуваарь").font = HEADER
    for index, title in enumerate(["Цаг", "Нэр", "Эхлэх", "Дуусах"], start=1):
        cell = ws.cell(2, index, title)
        cell.font = HEADER
        cell.fill = SHADE
        cell.border = BOX
    for offset, period in enumerate(sorted(bells)):
        starts, ends = bells[period]
        for index, value in enumerate([period, f"{period}-р цаг", starts, ends], start=1):
            ws.cell(3 + offset, index, value).border = BOX
    for index, width in enumerate([8, 14, 12, 12], start=1):
        ws.column_dimensions[get_column_letter(index)].width = width

    # ------------------------------------------------- one sheet per class
    subject_rule = DataValidation(
        type="list",
        formula1=f"=Жагсаалт!$B$3:$B${2 + max(len(subjects), 1)}",
        allow_blank=True,
        showDropDown=False,
    )
    subject_rule.error = "«Жагсаалт» хуудсанд байгаа хичээлээс сонгоно уу."
    subject_rule.errorTitle = "Тохирохгүй хичээл"

    for name in classes:
        ws = wb.create_sheet(sheet_title(name))
        ws.add_data_validation(subject_rule)
        ws.cell(1, 1, f"{name} анги — хичээлийн хуваарь ({year})").font = Font(bold=True, size=12)
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=1 + len(WEEKDAYS))

        ws.cell(2, 1, "Цаг").font = HEADER
        ws.cell(2, 1).fill = SHADE
        ws.cell(2, 1).border = BOX
        for index, day in enumerate(WEEKDAYS, start=2):
            cell = ws.cell(2, index, day)
            cell.font = HEADER
            cell.fill = SHADE
            cell.border = BOX
            cell.alignment = CENTRE
            ws.column_dimensions[get_column_letter(index)].width = 26

        for offset, period in enumerate(range(1, last_period + 1)):
            row = 3 + offset
            starts, ends = bells.get(period, ("", ""))
            label = f"{period}. {starts}–{ends}" if starts else f"{period}-р цаг"
            cell = ws.cell(row, 1, label)
            cell.fill = SHADE
            cell.border = BOX
            cell.alignment = CENTRE
            for index, _day in enumerate(WEEKDAYS, start=2):
                target_cell = ws.cell(row, index, grid[name].get((index - 1, period)))
                target_cell.border = BOX
                target_cell.alignment = WRAP
            ws.row_dimensions[row].height = 30

        ws.column_dimensions["A"].width = 18
        last = 2 + last_period
        subject_rule.add(f"B3:{get_column_letter(1 + len(WEEKDAYS))}{last}")
        ws.cell(last + 2, 1, "Хичээл ороогүй цагийг хоосон үлдээнэ.").font = Font(italic=True)
        ws.freeze_panes = ws.cell(3, 2)

    # ------------------------------------------------ Багш хуваарилалт
    ws = wb.create_sheet("Багш хуваарилалт")
    ws.cell(1, 1, "Анги, хичээл бүрийг хэн заахыг энд бичнэ.").font = HEADER
    for index, title in enumerate(["Анги", "Хичээл", "Багш", "Тэмдэглэл"], start=1):
        cell = ws.cell(2, index, title)
        cell.font = HEADER
        cell.fill = SHADE
        cell.border = BOX
    teacher_rule = DataValidation(
        type="list",
        formula1=f"=Жагсаалт!$A$3:$A${2 + max(len(teachers), 1)}",
        allow_blank=True,
        showDropDown=False,
    )
    teacher_rule.error = "«Жагсаалт» хуудсанд байгаа багшаас сонгоно уу."
    teacher_rule.errorTitle = "Тохирохгүй багш"
    ws.add_data_validation(teacher_rule)

    line = 3
    for name in classes:
        for subject in sorted(who.get(name, {})):
            names = sorted(who[name][subject])
            for teacher in names:
                for index, value in enumerate([name, subject, teacher], start=1):
                    ws.cell(line, index, value).border = BOX
                # Two teachers on one subject in one class is either a split
                # class or a mistake; the sheet says which it looks like rather
                # than picking one.
                if len(names) > 1:
                    ws.cell(line, 4, "Хоёр багштай — бүлэг хуваасан эсэхийг шалгана уу.")
                ws.cell(line, 4).border = BOX
                line += 1
    teacher_rule.add(f"C3:C{max(line - 1, 3)}")
    for index, width in enumerate([12, 30, 24, 46], start=1):
        ws.column_dimensions[get_column_letter(index)].width = width
    ws.freeze_panes = ws.cell(3, 1)

    target.parent.mkdir(parents=True, exist_ok=True)
    wb.save(target)
    print(f"Анги {len(classes)}, хичээл {len(subjects)}, багш {len(teachers)}, цаг {len(slots)}.")
    print(f"Багш хуваарилалт: {line - 3} мөр.")
    print(target)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(Path(sys.argv[1]), Path(sys.argv[2])))
