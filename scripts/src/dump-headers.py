"""Prints what is inside a workbook, so a pile of them can be triaged quickly.

    python scripts/src/dump-headers.py <workbook.xlsx> [more.xlsx ...]

Reads nothing into the system and changes nothing on disk. It answers the three
questions docs/data-requirements.md section 8 asks of every sheet:

  - what are the columns, and which of our data blocks could they feed
  - is this sheet typed by a person, or computed from another one
  - has Excel already damaged anything that looks like a class code

The third matters because it is unrecoverable from the damaged sheet. A class
written "8-1" is read as a date and stored as 2026-08-01, in every sheet
computed from the one it was typed in. Finding the sheet where it is still
text is the difference between importing a class and guessing it.
"""

import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl

# Words that hint at a block in docs/data-requirements.md section 4. Matched
# against the header text in lower case, Mongolian and English together.
BLOCKS: dict[str, tuple[str, ...]] = {
    "Анги (4.1)": ("анги", "бүлэг", "class", "grade"),
    "Сурагч (4.2)": ("сурагч", "суралцагч", "нэр", "овог", "student", "register", "код", "code"),
    "Багш (4.3)": ("багш", "teacher", "заадаг"),
    "Номын бүтэц (4.5)": ("хуудас", "page", "бүлэг", "хэсэг", "chapter", "section", "unit", "гарчиг"),
    "Сэдэв/чадвар (4.6)": ("сэдэв", "чадвар", "skill", "topic", "outcome", "үр дүн"),
    "Хичээл (4.7)": ("хичээл", "төлөвлөгөө", "lesson", "plan", "долоо хоног", "week"),
    "Асуулт (4.8)": ("асуулт", "сорил", "тест", "question", "item", "сонголт", "option", "хариулт", "answer", "түлхүүр", "key"),
    "Дүн": ("оноо", "дүн", "үнэлгээ", "score", "mark", "result", "хувь"),
    "Урьдач нөхцөл (4.9)": ("урьдач", "шаардлага", "суурь", "prerequisite", "depends"),
}

# "8-1", "10-2", "9 - 1" and the like: a class as a teacher writes it, and
# exactly what a spreadsheet mistakes for a date.
CLASS_LIKE = re.compile(r"^\s*(\d{1,2})\s*[-–/]\s*(\d{1,2})\s*$")


# A column label is short. Anything longer is the text of a question, and
# matching keywords inside it produces nonsense - a listening question reading
# "Listen to your teacher" is not a sheet about teachers.
LABEL_MAX = 40


def blocks_for(headers: list[str]) -> list[str]:
    labels = " | ".join(h for h in headers if len(h) <= LABEL_MAX).lower()
    return [name for name, words in BLOCKS.items() if any(w in labels for w in words)]


def scan(path: Path) -> None:
    print(f"\n{'=' * 70}\n{path.name}\n{'=' * 70}")

    values = openpyxl.load_workbook(path, read_only=True, data_only=True)
    # A second read that keeps formulas, so a computed sheet can be told from a
    # typed one. read_only is off here because formulas are not served in it.
    try:
        formulas = openpyxl.load_workbook(path, data_only=False)
    except Exception:
        formulas = None

    for name in values.sheetnames:
        rows = values[name].iter_rows(values_only=True)
        try:
            header_row = next(rows)
        except StopIteration:
            print(f"\n[{name}]  хоосон")
            continue

        headers = [str(c).strip() if c is not None else "" for c in header_row]
        named = [h for h in headers if h]

        # Counted per column rather than per sheet. A whole-sheet total is
        # useless here: a Timestamp column is 109 dates and means nothing, while
        # one date under a header reading "Grade / Class" is the whole problem.
        dates_by_column: dict[int, int] = {}
        class_by_column: dict[int, int] = {}
        body = 0
        for row in rows:
            if all(c is None or str(c).strip() == "" for c in row):
                continue
            body += 1
            for index, cell in enumerate(row):
                if isinstance(cell, (datetime, date)):
                    dates_by_column[index] = dates_by_column.get(index, 0) + 1
                elif isinstance(cell, str) and CLASS_LIKE.match(cell):
                    class_by_column[index] = class_by_column.get(index, 0) + 1

        computed = 0
        if formulas is not None and name in formulas.sheetnames:
            sheet = formulas[name]
            for row in sheet.iter_rows(min_row=2, max_row=min(sheet.max_row, 40)):
                for cell in row:
                    if isinstance(cell.value, str) and cell.value.startswith("="):
                        computed += 1

        print(f"\n[{name}]  {len(named)} багана, {body} мөр")
        for index, header in enumerate(headers):
            if header:
                print(f"   {index:>3}. {header[:62]}")

        hits = blocks_for(named)
        print(f"   → магадгүй: {', '.join(hits) if hits else 'таних үг олдсонгүй'}")

        if computed:
            print(f"   ⚠ ТОМЬЁОТОЙ ({computed}+ нүд) — ДЕРИВАТИВ хуудас")
        else:
            # Not evidence of anything. A Google Sheets export keeps values and
            # drops formulas, so a computed sheet arrives looking hand-typed.
            # Only the person who made the file knows; ask them.
            print("   ? томьёо олдсонгүй — гараар бичсэн гэсэн БАТАЛГАА БИШ (эзнээс нь асуу)")

        def label(index: int) -> str:
            return headers[index][:40] if index < len(headers) and headers[index] else f"#{index}"

        def about_class(index: int) -> bool:
            return any(w in label(index).lower() for w in BLOCKS["Анги (4.1)"])

        # "9/12" in a score column matches the class pattern too, so only
        # columns that claim to hold a class are reported. Everything else
        # would be noise dressed up as a finding.
        for index, count in sorted(class_by_column.items()):
            if about_class(index):
                print(f"   ✔ '{label(index)}' — анги текстээр {count} нүд, БҮТЭН")

        # Dates are only interesting where a class is supposed to be. Anywhere
        # else they are a timestamp doing its job, and flagging them buries the
        # one line that matters.
        for index, count in sorted(dates_by_column.items()):
            if about_class(index):
                print(f"   ⚠ '{label(index)}' — огноо {count} нүд ← АНГИ ЭВДЭРСЭН, энэ хуудсыг бүү ашигла")

        others = [label(i) for i in sorted(dates_by_column) if not about_class(i)]
        if others:
            print(f"   · огноотой бусад багана (хэвийн): {', '.join(others[:4])}")


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    for name in argv:
        path = Path(name)
        if not path.exists():
            print(f"олдсонгүй: {path}")
            continue
        try:
            scan(path)
        except Exception as error:  # a broken workbook should not stop the rest
            print(f"{path.name}: уншиж чадсангүй — {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
