"""Builds the empty workbook a school fills in.

    python scripts/src/make-import-template.py
    python scripts/src/make-import-template.py local-data/generated/ej-import.xlsx

Handing a teacher a description of the data and asking them to make a
spreadsheet produces nine spreadsheets, each with its own column names, its own
spelling of the same code, and a cell holding two values. Cleaning that costs
more than filling it did. This writes the sheet they fill instead: named
columns, one greyed example row per sheet, and the rules on the first page.

The example rows are meant to be deleted. They are there because "Ангийн код"
means nothing until you see 9A sitting under it.

Nothing here talks to the database. The importer that reads the filled sheet is
a separate job, and this file is the contract between the two: change a column
here and that importer changes with it.
"""

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="E8E4DC")
EXAMPLE_FONT = Font(color="8A8577", italic=True)
TITLE_FONT = Font(bold=True, size=14)

# Sheet name, the columns, and one example row. Column order is the order a
# person fills them in, not the order the database stores them.
SHEETS: list[tuple[str, list[str], list[list[str]]]] = [
    (
        "1. Анги",
        ["Ангийн код", "Нэр", "Түвшин", "Хичээлийн жил"],
        [["9A", "9а анги", "9", "2026-2027"], ["9B", "9б анги", "9", "2026-2027"]],
    ),
    (
        "2. Сурагч",
        ["Сурагчийн код", "Нэр", "Ангийн код", "Хичээлийн жил"],
        [
            ["S-0001", "Б. Ариунаа", "9A", "2026-2027"],
            ["S-0002", "Д. Батбаяр", "9A", "2026-2027"],
        ],
    ),
    (
        "3. Багш",
        ["Багшийн код", "Нэр", "Ангийн код", "Хичээл"],
        [
            ["T-01", "С. Оюунаа", "9A", "Математик"],
            ["T-01", "С. Оюунаа", "9B", "Математик"],
            ["T-02", "Ж. Сарантуяа", "9A", "Англи хэл"],
        ],
    ),
    (
        "4. Ном",
        ["Номын код", "Гарчиг", "Хичээл", "Нийт хуудас", "PDF файлын нэр"],
        [["MATH-9", "Математик 9", "Математик", "184", "matematik-9.pdf"]],
    ),
    (
        "5. Номын бүтэц",
        ["Номын код", "Бүлгийн дугаар", "Гарчиг", "Эхлэх хуудас", "Дуусах хуудас"],
        [
            ["MATH-9", "3.1", "Бутархай тоо", "41", "44"],
            ["MATH-9", "3.2", "Бутархай тоо нэмэх", "45", "48"],
        ],
    ),
    (
        "6. Чадвар",
        ["Чадварын код", "Нэр", "Хичээл", "Анги"],
        [
            ["M-9-01", "Ижил хуваарьтай бутархайг нэмнэ", "Математик", "9"],
            ["M-9-02", "Хуваарь тэнцүүлнэ", "Математик", "9"],
        ],
    ),
    (
        "7. Чадвар — номын хэсэг",
        ["Чадварын код", "Номын код", "Бүлгийн дугаар"],
        [["M-9-01", "MATH-9", "3.2"], ["M-9-02", "MATH-9", "3.1"]],
    ),
    (
        "8. Асуулт",
        [
            "Асуултын код",
            "Чадварын код",
            "Бүлгийн дугаар",
            "Дараалал",
            "Асуулт",
            "Хариулт 1",
            "Хариулт 2",
            "Хариулт 3",
            "Хариулт 4",
            "Зөв хариулт",
            "Тайлбар",
        ],
        [
            [
                "M-9-01-Q1",
                "M-9-01",
                "3.2",
                "1",
                "2/7 + 3/7 = ?",
                "5/7",
                "5/14",
                "6/7",
                "5/49",
                "5/7",
                "Хуваарь ижил тул хүртвэрийг нэмнэ",
            ],
            [
                "M-9-01-Q2",
                "M-9-01",
                "",
                "2",
                "1/5 + 3/5 = ?",
                "4/5",
                "4/10",
                "3/5",
                "4/25",
                "4/5",
                "",
            ],
        ],
    ),
    (
        "9. Улирал",
        ["Хичээлийн жил", "Улирал", "Эхлэх огноо", "Дуусах огноо"],
        [
            ["2026-2027", "1", "2026-09-01", "2026-10-31"],
            ["2026-2027", "2", "2026-11-10", "2026-12-30"],
        ],
    ),
]

RULES = [
    ("Юу бөглөх вэ", ""),
    (
        "",
        "Доорх 9 хуудсыг бөглөнө. Хуудас бүрийн эхний мөр бол баганын нэр — "
        "битгий өөрчилнө үү.",
    ),
    (
        "",
        "Саарал налуу бичигтэй мөрүүд бол жишээ. Бөглөж дуусаад тэдгээрийг "
        "устгана уу.",
    ),
    ("", ""),
    ("Гурван дүрэм", ""),
    (
        "1",
        "Код давтагдахгүй, өөрчлөгдөхгүй. Код бол тухайн зүйлийн байнгын нэр — "
        "нэг удаа өгсний дараа солихгүй.",
    ),
    (
        "2",
        "Нэг нүдэнд нэг утга. Багш хоёр анги заадаг бол 3-р хуудсанд хоёр мөр "
        "бичнэ, нэг нүдэнд хоёр ангийн кодыг бичихгүй.",
    ),
    (
        "3",
        "Хуудасны дугаар бол номон дээр хэвлэгдсэн дугаар. PDF-ийн хэддэх "
        "хуудас болохыг бид өөрсдөө тохируулна.",
    ),
    ("", ""),
    ("Хамгийн чухал хоёр хуудас", ""),
    (
        "7-р хуудас",
        "Чадвар бүр номын аль хэсгээс заагддагийг хэлнэ. Дутуу бол хичээл "
        "дээрээс ном нээгдэхгүй.",
    ),
    (
        "8-р хуудас",
        "Асуулт бүр дээр чадварын код ЗААВАЛ байна — оноо тэр чадварт очдог. "
        "Чадваргүй асуулт хаана ч гарч ирэхгүй.",
    ),
    ("", ""),
    ("8-р хуудасны «Бүлгийн дугаар»", ""),
    (
        "",
        "Сонголттой. Нэг чадварыг 4-6 өдөр заадаг. Энэ баганыг бөглөвөл асуулт "
        "тухайн хэсгийг үзсэн өдөр л гарна. Хоосон орхивол чадварын бүх өдөр "
        "гарна.",
    ),
    ("", ""),
    ("Эхлэхдээ", ""),
    (
        "",
        "Бүгдийг нэг дор бүү бөглөөрэй. Нэг хичээл, нэг ангиар эхэлнэ — "
        "жишээ нь 9а-гийн математик, 8 чадвар, 20-30 асуулт. Тэр багц "
        "ажилласны дараа үлдсэнийг нэмнэ.",
    ),
    ("", ""),
    ("Зөв хариулт", ""),
    (
        "",
        "«Зөв хариулт» багананд бичсэн текст нь дөрвөн хариултын аль нэгтэй "
        "яг тааралдах ёстой. Таамгаар бичихгүй — эргэлзвэл хоосон орхиод "
        "тэмдэглэл үлдээнэ үү.",
    ),
]


def write_rules(sheet) -> None:
    sheet["A1"] = "Өгөгдөл бэлтгэх заавар"
    sheet["A1"].font = TITLE_FONT
    row = 3
    for label, text in RULES:
        if label and not text:
            cell = sheet.cell(row=row, column=1, value=label)
            cell.font = Font(bold=True)
        else:
            sheet.cell(row=row, column=1, value=label).font = Font(bold=True)
            cell = sheet.cell(row=row, column=2, value=text)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        row += 1
    sheet.column_dimensions["A"].width = 16
    sheet.column_dimensions["B"].width = 86


def write_sheet(sheet, columns: list[str], examples: list[list[str]]) -> None:
    for index, name in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=index, value=name)
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        # Wide enough for the heading, and for the sentences that go under the
        # question and explanation columns.
        width = max(len(name) + 4, 14)
        if name in ("Асуулт", "Тайлбар", "Нэр", "Гарчиг"):
            width = 34
        sheet.column_dimensions[get_column_letter(index)].width = width

    for offset, example in enumerate(examples, start=2):
        for index, value in enumerate(example, start=1):
            cell = sheet.cell(row=offset, column=index, value=value)
            cell.font = EXAMPLE_FONT

    sheet.freeze_panes = "A2"


def main() -> int:
    target = Path(
        sys.argv[1] if len(sys.argv) > 1 else "local-data/generated/ej-import-template.xlsx"
    )
    target.parent.mkdir(parents=True, exist_ok=True)

    book = Workbook()
    write_rules(book.active)
    book.active.title = "Заавар"

    for name, columns, examples in SHEETS:
        write_sheet(book.create_sheet(name), columns, examples)

    book.save(target)
    print(f"Wrote {target}")
    print(f"{len(SHEETS)} sheets: {', '.join(name for name, _, _ in SHEETS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
