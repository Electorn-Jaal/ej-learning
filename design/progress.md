# Figma ажлын явц

Figma файл: https://www.figma.com/design/HoHValffFG57oK5rjDCaPi/Untitled
Node ID-ууд: [figma-state.json](figma-state.json)

Figma-д Claude Figma plugin (MCP)-ээр шууд, засаж болох layer болгон зурна.
Make ашиглахгүй. [figma-make.md](figma-make.md)-ийн prompt-ууд нь энд дэлгэц бүр
юу агуулахыг тодорхойлсон жагсаалт болж үлдэнэ.

Алхам бүрийн дараа энэ файлыг шинэчилнэ. Шинэ session эхлэхдээ эндээс
үргэлжлүүлнэ.

Тэмдэг: `[x]` хийгдсэн · `[~]` эхэлсэн · `[ ]` хийгдээгүй

## Phase 0: Шалгах [x] 2026-09-25

Figma-д байсан зүйл: `Page 1` дээр "EJ Learning foundations" (2:5) ба
"EJ Learning controls" (2:758) гэсэн хоёр зураг. `01 Foundations`,
`02 Components / Controls` хуудсууд хоосон байсан. Variable, component, style
байгаагүй. Холбогдсон 8 library бүгд community kit, EJ-ийн хэлтэй таарахгүй тул
шинээр барина.

Кодтой зөрсөн зүйлс. Код зөв гэж үзнэ:

| Юу | Хуучин зураг | Код |
|---|---|---|
| Button hover | цайвар шар | amber 85% |
| Button disabled | саарал | 50% opacity |
| Ghost hover | саарал | `#FFEAB8` |
| Badge | дөрвөлжин, success/pending | pill, navy / secondary / destructive / outline |
| Input | нэг төрөл | shadcn `Input` (h36, r6, shadow-sm) ба `NATIVE_INPUT` (h32, r2) |
| Select | h≈36 | `NATIVE_SELECT` h32, 12px |
| Checkbox | component | кодод component байхгүй, `<input type=checkbox>` |

## Starter тарифын хязгаар

Figma файл Starter тариф дээр байгаа тул дараах хязгаар бий:

- **1 collection-д 1 mode.** Dark өнгийг `Color Dark (reference)` гэсэн тусдаа
  collection-д лавлах байдлаар хадгалсан. Light/Dark гэж сольж харах боломжгүй.
- **Файлд 3 хуудас.** README-ийн 7 хуудсыг гурав болгож, дотор нь Section-оор
  хуваасан: `01 Design System`, `02 Screens`, `99 Archive`.
- **MCP дуудлагын хязгаар: Starter дээр сард 20.** 2026-09-25-нд энэ сарын
  хязгаар дууссан. Professional-ийн Full эсвэл Dev seat: өдөрт 200, минутад 10;
  Education тариф мөн адил (Figma-ийн `rate-limits-access` баримт).
  Зурахад **Full seat** хэрэгтэй, Dev seat засах эрхгүй.

## Дараагийн алхам: ТҮР ЗОГССОН

2026-09-25: хэрэглэгч Figma Professional (Full seat) авахаар шийдсэн. Figma-ийн
AI-аар биш, Claude MCP-ээр үргэлжлүүлнэ. Тариф авсны дараа:

1. Foundations-ийн цагаан дэвсгэрийг засах (Phase 2 доорх `[~]` мөр)
2. 3 хуудсыг README-ийн бүтцээр задлах, Section-уудыг хуудас болгох
3. `Color` ба `Color Dark (reference)`-ийг нэг collection-д Light/Dark mode болгож нэгтгэх
4. Phase 3 component-ууд

## Phase 1: Foundations [x] 2026-09-25

- [x] `Color` collection: `index.css`-ийн 31 token, scope ба `var(--color-…)` code syntax
- [x] `Color Dark (reference)`: 31 dark утга, picker-т харагдахгүй
- [x] `Radius` (control 2px, sm 4, md 6, lg 8, xl 12, full) ба `Spacing` (Tailwind 4px шат, 14)
- [x] 13 text style (Plus Jakarta Sans, Lora), `Shadow/sm` effect style

## Phase 2: Хуудсуудыг цэгцлэх

- [x] Хуудас: `01 Design System` (0:1), `02 Screens` (2:2), `99 Archive` (2:110)
- [x] Хуучин хоёр зургийг (2:5, 2:758) 99 Archive руу зөөсөн
- [~] `01 Design System` дээр Foundations section (11:103): өнгө бүр variable-тай
      холбогдсон, text style, radius, spacing. **Засвар үлдсэн:** дотоод мөр болон
      grid-үүд цагаан дэвсгэртэй үлдсэн, `fills = []` болгох (frame 11:104 доторх,
      блокуудаас бусад FRAME). Дуудлагын хязгаарт хүрсэн тул хийж амжаагүй.
- [ ] `02 Screens` дээр Section: UX Flows, Student, Teacher, Admin, Guardian,
      Manager, Mobile. Role бүрт Одоо байгаа / Төлөвлөсөн / Шинэ санаа

## Phase 3: Component-ууд

- [ ] Button (variant × size × state)
- [ ] Input (shadcn ба native), Select, Textarea, Checkbox, Radio, Badge
- Бүгд `01 Design System` хуудсанд, component тус бүр өөрийн Section-д
- [ ] A3 Layout: цэсний багана, top bar, mobile цэс, Page header, Card, Table,
      Tabs, Toast, Skeleton, Empty, Error

## Phase 4: Төлөвлөсөн дэлгэцүүд (B1–B13)

- [ ] B1 UC04 · Сэдэв солих, preview → батлах
- [ ] B2 UC11 · Хувийн төлөвлөгөө (багш)
- [ ] B3 UC08 · Сорилын тохиргоо
- [ ] B4 UC07 · Нэмэлт ажил шалгах
- [ ] B5 UC09 · Хариу нээх
- [ ] B6 UC16 · Эцэг эхийн нүүр (390px)
- [ ] B7 UC16 · Эцэг эхийн нүүр (1440px)
- [ ] B8 UC11 · Миний төлөвлөгөө (сурагч)
- [ ] B9 Шинэ · Сурагчийн бүртгэл
- [ ] B10 UC18 · Эцэг эхийн хүсэлт
- [ ] B11 UC19 · Шилжилт
- [ ] B12 UC20 · Жилийн дэвшилт
- [ ] B13 UC13 · Оролцоо
- B14–B16: шийдвэр (D03, D04, D05) гарсны дараа

## Одоо байгаа дэлгэцүүд

html.to.design plugin-оор бодит app-аас оруулна (гараар хийнэ).

- [ ] Сурагч (11) · [ ] Багш (13) · [ ] Админ (5) · [ ] Эцэг эх (1) · [ ] Нийтлэг (3)
