"""Writes a small, valid multi-page PDF to stand in for a real textbook.

Mock data: replace the file and the content.source_versions row pointing at it
when the actual book arrives. Written by hand rather than with a PDF library so
seeding needs no extra dependency; the cross-reference offsets are computed
from the real byte positions, so the file opens in any reader.
"""

import sys
import zlib
from pathlib import Path

PAGES = [
    ("Монгол хэл 9", "Ерөнхий боловсролын сургуулийн 9-р анги"),
    ("I бүлэг. Эхийн бүтэц", "Цогцолбор, догол мөр, утгын холбоо"),
    ("1.1 Эхийн бүтцийг таних", "Эх нь оршил, гол хэсэг, төгсгөлөөс бүрдэнэ."),
    ("1.2 Гол санааг ялгах", "Догол мөр бүрийн түлхүүр өгүүлбэрийг олно."),
    ("II бүлэг. Найруулга", "Өгүүлбэрийн бүтэц, холбоос үг"),
    ("2.1 Өгүүлбэрийн гол гишүүд", "Өгүүлэгдэхүүн ба өгүүлэхүүнийг тодорхойлно."),
    ("2.2 Холбоос үг хэрэглэх", "Утгын холбоог холбоос үгээр илэрхийлнэ."),
    ("III бүлэг. Үг зүй", "Үгийн бүтэц, үг бүтэх ёс"),
]


def escape(text: str) -> bytes:
    # PDF literal strings need these escaped; the text is written as UTF-16BE
    # so Cyrillic survives, which is what the BOM below marks.
    raw = b"\xfe\xff" + text.encode("utf-16-be")
    out = bytearray()
    for byte in raw:
        if byte in (0x28, 0x29, 0x5C):  # ( ) \
            out += b"\\" + bytes([byte])
        else:
            out.append(byte)
    return bytes(out)


def build() -> bytes:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)  # object numbers are 1-based

    font_id = add(
        b"<< /Type /Font /Subtype /Type0 /BaseFont /ArialUnicodeMS "
        b"/Encoding /Identity-H /DescendantFonts [<< /Type /Font "
        b"/Subtype /CIDFontType2 /BaseFont /ArialUnicodeMS /CIDSystemInfo "
        b"<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
        b"/DW 1000 >>] >>"
    )

    page_ids: list[int] = []
    content_ids: list[int] = []
    for index, (title, subtitle) in enumerate(PAGES, start=1):
        stream = (
            b"BT /F1 20 Tf 72 720 Td " + escape(title) + b" Tj ET\n"
            b"BT /F1 12 Tf 72 690 Td " + escape(subtitle) + b" Tj ET\n"
            b"BT /F1 10 Tf 72 72 Td " + escape(f"{index}") + b" Tj ET\n"
        )
        packed = zlib.compress(stream)
        content_ids.append(
            add(
                b"<< /Length "
                + str(len(packed)).encode()
                + b" /Filter /FlateDecode >>\nstream\n"
                + packed
                + b"\nendstream"
            )
        )
        page_ids.append(0)  # placeholder, filled once the pages tree exists

    pages_id = len(objects) + len(PAGES) + 1

    for index, content_id in enumerate(content_ids):
        page_ids[index] = add(
            b"<< /Type /Page /Parent "
            + str(pages_id).encode()
            + b" 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "
            + str(font_id).encode()
            + b" 0 R >> >> /Contents "
            + str(content_id).encode()
            + b" 0 R >>"
        )

    add(
        b"<< /Type /Pages /Count "
        + str(len(page_ids)).encode()
        + b" /Kids ["
        + b" ".join(str(pid).encode() + b" 0 R" for pid in page_ids)
        + b"] >>"
    )
    catalog_id = add(b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>")

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += str(number).encode() + b" 0 obj\n" + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        b"trailer\n<< /Size "
        + str(len(objects) + 1).encode()
        + b" /Root "
        + str(catalog_id).encode()
        + b" 0 R >>\nstartxref\n"
        + str(xref_at).encode()
        + b"\n%%EOF\n"
    )
    return bytes(out)


if __name__ == "__main__":
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    target.write_bytes(data)
    print(f"{target} ({len(data)} bytes, {len(PAGES)} pages)")
