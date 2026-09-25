# Figma Make-ийн prompt-ууд

Эдгээр prompt нь [pages.md](pages.md), [planned.md](planned.md) болон
`index.css`-ийн бодит утгуудаас бүтсэн.

## Яаж ашиглах вэ

**Нэг prompt = нэг дэлгэц.** Том prompt дундуураа тасарвал credit зарцуулагдсан
атлаа ашиглах үр дүн гардаггүй. Жижиг prompt бүр дуусмагц бэлэн дэлгэц үлдэнэ,
тиймээс credit дуусвал дараагийн дугаараас үргэлжлүүлэхэд хангалттай.

1. **Эхлээд A хэсэг.** Design system бусад бүх prompt-ийн суурь болно.
2. **Дараа нь B хэсэг, дугаарын дарааллаар.** Кодод байхгүй дэлгэцүүд, Make-ийг
   ашиглах гол шалтгаан энэ. Чухлаас нь эхлүүлсэн тул хаана ч зогссон ашигтай
   хэсэг нь хийгдсэн байна.
3. **C хэсгийг хамгийн сүүлд, сонголтоор.** Одоо байгаа дэлгэцүүдийг дахин
   боловсруулах хэсэг. Одоогийн web-ийг Figma-д оруулахад Make-ийн credit
   зарцуулахгүй, бодит app-аас html.to.design-аар оруулна ([README.md](README.md)).
4. **Prompt бүрийн дараа шалгана** (доорх жагсаалт). Буруу гарвал бүгдийг дахин
   хийлгэхгүй, зөвхөн засах хэсгийг нь хэлнэ: "Only change X".
5. **Desktop (1440px) эхэлж.** Mobile-ийг зөвхөн шаардлагатай дэлгэцүүдэд
   тусдаа prompt-оор хийнэ (B-д тэмдэглэсэн).

Prompt бүрийн төгсгөлд Make өмнөх дэлгэцүүдийг дахин үүсгэж credit
үрэхээс сэргийлэх мөр бий: *"Do not change other screens."*

Шинэ Make файл нээх эсвэл Make өмнөх зүйлсээ "мартсан" мэт санагдвал эхлээд
**A0**-г дахин явуулна.

---

## A. Суурь

### A0: Контекст (шинэ Make файл бүрийн эхэнд)

```text
Context for everything that follows. Do not generate any screen yet — reply
"ready".

EJ Learning is a school system for grades 1–12 in Mongolia, an existing
React + Tailwind + shadcn/ui web app. Match this visual language; do not
invent a new style. ALL on-screen text in Mongolian (Cyrillic), using the
exact labels I give.

Tokens: paper #F7F5F2, card #FDFDFB, border #E0DCD6, ink #1C2431,
muted text #5E6978, muted fill #F1EEEA, navy #064079 (links/text accents,
solid only), amber #FBC260 (navigation column and every button, ink text on
it), active nav row #FFEAB8 with 2px navy left rule, success #2F6A4E,
pending #A16A2B, destructive #AB3E36, focus ring #B17E43.
Font Plus Jakarta Sans (UI), Lora (long reading). Radius 2px everywhere.
No shadows on cards, no pale tinted backgrounds behind same-hue text. Badges are
pills (rounded-full), as in the code.
Dense working tool: 12px control text, ~28px table rows.

Layout: 256px amber navigation column on the left, 56px top bar with the page
title, content on the right. Pages do not repeat the title as an H1.
Every data screen has loaded / empty / loading / error states.
```

### A1: Foundations

```text
Create a page "01 Foundations": colour swatches with the token names from the
context, a type scale (11 caption, 12, 14, 16, 20, 24, 30) in Plus Jakarta
Sans with Lora for body reading, and the 2px radius sample. Nothing else.
```

### A2: Controls

```text
Create a page "02 Components / Controls" using the Foundations:
Button — amber fill + ink text, h36 / 12px medium / 14px padding; size sm h32;
size lg h40 with 14px text; destructive (brick); ghost (no fill until hover);
link (navy text). States: default, hover, focus, disabled, loading.
Also: Input, Select, Textarea, Checkbox, Radio, Date picker, Badge.
Do not create screens.
```

### A3: Layout ба төлөвүүд

```text
Create a page "02 Components / Layout": the navigation column (group labels +
items + active row), the top bar, the mobile menu bar (390px: current page name
+ "Цэс" with chevron, collapses the menu), Page header with up to four stats
(number large, label above, rule between, no tiles), Card, Table, Tabs, Toast,
Skeleton, Empty state (what is missing + what to do), Error state (message +
"Дахин оролдох"). Do not create screens.
```

---

## B. Кодод байхгүй дэлгэцүүд (гол ажил)

Frame нэр бүрт UC дугаар ба төлвийг бичүүлнэ. Жишээ: `UC04 · Хэсэгчлэн · Сэдэв солих`.

### B1: Багш · Сэдэв солих, preview → батлах (UC04, хамгийн чухал)

```text
New screen, teacher app, 1440px. Frame name "UC04 · Сэдэв солих".
The teacher records what happened today for one class: topics A and B were
both covered, OR only B was covered in place of A (swap). Step 2 shows a
preview table of the next days: date, planned topic before → after, changed
rows highlighted. Buttons "Батлах" and "Болих". Until Батлах, students keep
seeing the old plan — say so in one line. Use only existing components.
Do not change other screens.
```

### B2: Багш · Хувийн судлах төлөвлөгөө (UC11)

```text
New screen, teacher app, 1440px. Frame "UC11 · Хувийн төлөвлөгөө".
Left: one student's exam evidence by topic and skill (from monthly/term/
diagnostic exams only; daily quiz does not count — say so). Right: the teacher
picks material and exercises and assigns them. The system never assigns by
itself. Empty state: no exam evidence yet. Do not change other screens.
```

### B3: Багш · Өдрийн сорилын тохиргоо ба сурагч бүрийн асуулт (UC08)

```text
New screen, teacher app, 1440px. Frame "UC08 · Сорилын тохиргоо".
Settings: opening time, question count (default 5), attempts (default 3).
Below: each student's generated questions before they start, with
"Солих" per question and "Дахин сонгох" per student. After start, the set is
locked. Do not change other screens.
```

### B4: Багш · Нэмэлт ажил шалгах (UC07)

```text
New screen, teacher app, 1440px. Frame "UC07 · Нэмэлт ажил шалгах".
One assignment: list of students with every attempt (date, late or not),
open an attempt, set a checked status and write a comment. Late submissions
are allowed and marked, not blocked. Do not change other screens.
```

### B5: Багш · Шалгалтын хариу нээх хугацаа (UC09)

```text
New section on the exam form, teacher app, 1440px. Frame "UC09 · Хариу нээх".
Choose when correct answers and explanations become visible to students and
guardians: after close / on a date / never. Also the student view of a result
before release: score shown, answers "Багш хараахан нээгээгүй".
Do not change other screens.
```

### B6: Эцэг эх · Нүүр (UC16) — 390px

```text
New screen, guardian app, 390px (phone first). Frame "UC16 · Эцэг эхийн нүүр".
Child switcher at top when there are several children, always showing whose
data is on screen. Sections: today's lessons and work, attendance and
participation, work marked incomplete, exam results, teachers.
Announcements block at top labelled "Хүлээгдэж буй · D04".
Error state is required: failed load must not look like endless loading.
Do not change other screens.
```

### B7: Эцэг эх · Нүүр — 1440px

```text
Same guardian home as "UC16 · Эцэг эхийн нүүр", at 1440px. Reuse its content;
change layout only. Do not change other screens.
```

### B8: Сурагч · Багшийн оноосон төлөвлөгөө (UC11)

```text
New screen, student app, 1440px. Frame "UC11 · Миний төлөвлөгөө".
Work the teacher assigned to this student: material, exercises, status.
Empty state: nothing assigned yet. Do not change other screens.
```

### B9: Админ · Сурагчийн бүртгэл

```text
New screen, admin (inside teacher app, nav group "Удирдлага"), 1440px.
Frame "Шинэ · Сурагчийн бүртгэл". Table of students (name, code, class,
guardian linked yes/no), search, filter by class, add and edit form.
Do not change other screens.
```

### B10: Админ · Эцэг эхийн хүсэлт (UC18)

```text
New screen, admin, 1440px. Frame "UC18 · Эцэг эхийн хүсэлт".
Queue of requests: guardian self-registration and change-of-linked-account.
Detail shows child, requester, current link; Approve / Reject. One active
guardian account per child — show the conflict when one exists.
Do not change other screens.
```

### B11: Админ · Шилжилт (UC19)

```text
New screen, admin, 1440px. Frame "UC19 · Шилжилт".
Move a student to another class or group, or change a class's teacher, with an
effective date. History list below. Unfinished work and past results stay —
say so. Do not change other screens.
```

### B12: Админ · Жилийн дэвшилт (UC20)

```text
New screen, admin, 1440px. Frame "UC20 · Жилийн дэвшилт".
Table of every student with current and proposed grade, editable exceptions,
bulk approve with a preview count. Grade 12 → "Төгссөн".
Do not change other screens.
```

### B13: Багш · Оролцоо (UC13, ТҮР САНАЛ)

```text
Add to the class-day register, teacher app, 1440px. Frame "UC13 · Оролцоо".
Optional per-student mark: Маш сайн / Сайн / Анхаарах + note. Not a score,
not required for every student. Label "ТҮР САНАЛ". Do not change other screens.
```

### B14–B16: Хүлээгдэж буй (шийдвэр гарсны дараа)

Нэг prompt-д нэг дэлгэц, дээрхтэй ижил хэлбэрээр:

- **B14** Эцэг эх · Чөлөө хүсэх, Багш · Чөлөө батлах (D03)
- **B15** Зарлал бичих, хүлээн авагчийн preview (D04)
- **B16** Менежер: цагийн хуваарь, ирц засах хүсэлт, хяналт. Дэлгэц бүр тусдаа
  prompt (D05)

---

## C. Одоо байгаа дэлгэцийг дахин боловсруулах (сонголтоор)

Эхлээд тухайн дэлгэцийг html.to.design-аар Figma-д оруулна. Дараа нь Make-д нэг
дэлгэцийг зааж, юуг сайжруулахыг хэлнэ. Хамгийн их ашиг өгөх дараалал:

1. **Ангийн өдөр** (`ClassDay`, 1012 мөр). Том тул хоёр prompt болгож хуваана:
   (а) сэдэв, хуудас, ажил; (б) ирц ба дэвтрийн шалгалт.
2. **Сурагч · Өнөөдөр**: материал ба quiz нээгдэх цагийг ялгах.
3. **Багш · Нүүр**.
4. Mobile хувилбар: teacher Schedule, Homework (одоо breakpoint огт ашиглаагүй).

```text
Redesign only the screen "<нэр>" shown in the imported frame. Keep every piece
of information and every action; improve hierarchy and spacing using the
Design System components. Goal: <нэг өгүүлбэр>. Do not change other screens.
```

---

## Prompt бүрийн дараа шалгах

- Бичвэр бүгд монголоор, цэсний нэр кодынхтой ижил байна уу?
- Card-д shadow, цайвар өнгөт дэвсгэр нэмэгдсэн үү? Хасуулна. Badge нь кодынх шиг pill хэлбэртэй.
- Хоосон, ачаалж байгаа, алдаатай төлөв байна уу?
- Өөр дэлгэц өөрчлөгдсөн үү? Тийм бол буцаана (Make-ийн version history).
