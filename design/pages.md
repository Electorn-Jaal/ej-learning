# Хуудасны audit

Кодоос 2026-09-25-нд гаргав. Хуудас: 33 (`src/pages/`), үүнээс 32 нь route-тэй.

Баганууд:
- **UI**: `components/ui/`-аас импортолсон component-ууд.
- **Бусад**: бусад component-ууд.
- **Алдаа**: хүсэлт амжилтгүй болоход хуудас мессеж харуулдаг эсэх.
- **bp**: `sm:`/`md:`/`lg:` breakpoint хэдэн удаа ашиглагдсан. 0 гэдэг нь хуудас
  нэг баганаар урсдаг гэсэн үг, эвдэрхий гэсэн үг биш. Mobile дээр шалгах хэрэгтэй.

## Student

Цэсний бүлгүүд: Өнөөдөр · Миний хичээлүүд · Миний ажлууд · Шалгалт ба ахиц · Бие даан судлах

| Хуудас | Route | Зорилго | UI | Бусад | Алдаа | bp |
|---|---|---|---|---|---|---|
| Today | `/` | Өнөөдрийн хичээл, хийх ажил | button, row-action, skeleton | InfoBox | ✓ | 1 |
| Schedule | `/schedule` | Цагийн хуваарь | card, popover, skeleton | DayNavigation | ✓ | 2 |
| Subjects | `/subjects` | Миний хичээлүүд | badge, button, card, skeleton | | ✓ | 4 |
| SubjectDetail | `/subjects/:code` | Нэг хичээл, багш, ном | button, card, skeleton | TeacherCard | ✓ | 1 |
| Plan | `/subjects/:code/plan` | Хувийн төлөвлөгөө | skeleton | LessonBody, StudyPlanCards | ✓ | 0 |
| SubjectView | `/subject/:code/:view` | Хичээлийн агуулга + сорил | button, skeleton | LessonQuiz, LessonBody | ✓ | 0 |
| Assignment | `/assignment/:id` | Даалгаврыг алхамаар хийж илгээх | button, card, skeleton | | **✗** | 5 |
| Exams | `/exams` | Шалгалт өгөх | button, label, radio-group, skeleton | | ✓ | 1 |
| Homework | `/homework` | Нэмэлт ажил | button, skeleton | homework | ✓ | 0 |
| Progress | `/progress` | Миний ахиц | skeleton | SkillStandingChart | **✗** | 0 |
| Profile | `/profile` | Хувийн мэдээлэл | avatar, badge, card, skeleton | BackLink | **✗** | 4 |

## Teacher

Цэсний бүлгүүд: Нүүр · Журнал · Ажил ба шалгалт · Сурагчдын ахиц · Сургалтын материал · Сургуулийн мэдээлэл

| Хуудас | Route | Зорилго | UI | Бусад | Алдаа | bp |
|---|---|---|---|---|---|---|
| Dashboard | `/teacher` | Нүүр | button, card, row-action, skeleton | InfoBox | ✓ | 1 |
| Schedule | `/teacher/schedule` | Хичээл ба төлөвлөгөө | badge, button, card, native-select, skeleton | DatePicker, DayNavigation, ReplanPrompt, TeacherWeek, TimetableStudents | ✓ | 0 |
| ClassDay | `/teacher/class/:classId` | Нэг ангийн тухайн өдрийн хичээл | button, native-select, skeleton | BookViewer, ReplanPrompt | ✓ | 1 |
| Assessment | `/teacher/assessment` | Дэвтрийн үнэлгээ (хичээл ордог багш, admin) | button, card, input, select, skeleton | status-palette | ✓ | 2 |
| Homework | `/teacher/homework` | Нэмэлт ажил өгөх | button, native-select, skeleton | homework | ✓ | 0 |
| Exams | `/teacher/exams` | Шалгалт | button, native-select, skeleton | | ✓ | 1 |
| QuizResults | `/teacher/results` | Өдрийн сорилын дүн | button, card, input, native-select, **select**, skeleton | DatePicker, QuizPaperView | ✓ | 3 |
| Analytics | `/teacher/analytics` | Дүн шинжилгээ | card, native-select, page-header, skeleton | ScoreBands, SkillStandingChart | **✗** | 1 |
| Productive | `/teacher/productive` | Бичих, ярих чадварын дүгнэлт | badge, button, card, page-header, skeleton, textarea | | ✓ | 0 |
| Catalog | `/teacher/catalog` | Хичээлийн агуулга | input, page-header, select, skeleton | | ✓ | 4 |
| Clubs | `/teacher/clubs` | Дугуйлан | button, native-select, skeleton | | ✓ | 4 |
| Profile | `/teacher/profile` | Хувийн мэдээлэл | badge, card, skeleton | BackLink, StaffFields, StaffPhoto | ✓ | 0 |
| ClassTopics | — | **Route байхгүй.** Энэ хуудас ажиллахгүй; hook-ийг нь зөвхөн Dashboard ашигладаг | badge, button, card, page-header, skeleton | | ✓ | 0 |

## Admin (багшийн shell, "Удирдлага" бүлэг)

| Хуудас | Route | Зорилго | UI | Бусад | Алдаа | bp |
|---|---|---|---|---|---|---|
| Staff | `/teacher/staff` | Ажилтны бүртгэл | button, native-select, page-header, skeleton | StaffFields, StaffPhoto | ✓ | 0 |
| Guardians | `/teacher/guardians` | Эцэг эхийн бүртгэл | button, native-select, skeleton | | ✓ | 1 |
| Books | `/teacher/books` | Ном ба сэдэв | button, card, input, label, page-header, skeleton | BookUpload | ✓ | 1 |
| ContentLinks | `/teacher/content-links` | Сэдвийн холбоо | card, input, page-header, skeleton, tabs | | ✓ | 1 |
| Integrations | `/teacher/integrations` | Холболтууд | alert, badge, button, card, skeleton, table, tabs | | ✓ | 4 |

## Guardian

| Хуудас | Route | Зорилго | UI | Бусад | Алдаа | bp |
|---|---|---|---|---|---|---|
| Child | `/` | Хүүхдийн өдөр, бүртгэл | button, native-select, skeleton | | **✗** | 0 |

## Бүх role

| Хуудас | Route | Зорилго | UI | Алдаа | bp |
|---|---|---|---|---|---|
| Login | — | Нэвтрэх | button, input, label | ✓ | 48 |
| Password | `/password`, `/teacher/password` | Нууц үг солих | button, card, input, label | ✓ | 0 |
| Library | `/library`, `/teacher/library` | Номын сан | native-select, skeleton | ✓ | 3 |

---

## Олдсон зүйлс

### UX

1. **Алдааны төлөв дутуу, 5 хуудас.** Guardian/Child, student/Assignment,
   student/Progress, student/Profile, teacher/Analytics. Хамгийн муу нь
   `guardian/Child.tsx:44` ба `:122`: `if (isLoading || !data) return <Skeleton/>`.
   Хүсэлт амжилтгүй болоход skeleton хэзээ ч алга болохгүй, эцэг эх юу болсныг
   мэдэхгүй. Guardian-д зөвхөн энэ ганц хуудас байдаг.
2. **Route-гүй хуудас.** `teacher/ClassTopics.tsx` (276 мөр) ямар ч route-д
   холбогдоогүй. Нэг бол route өгөх, эсвэл устгах хэрэгтэй.
3. **Гарчгийн хэлбэр хоёр янз.** Хуудасны нэрийг shell-ийн дээд мөр харуулдаг
   (`page-header.tsx`-ийн тайлбар). Гэтэл 5 хуудас өөрийн `<h1>`-ийг нэмж
   хэвлэдэг: Assignment, Plan, SubjectDetail, SubjectView, Integrations.
   Ингэхээр нэр хоёр удаа гардаг. `PageHeader` зөвхөн 8 хуудаст ашиглагдсан.
4. **ClassDay нь 1012 мөр.** Figma-д орох хамгийн том дэлгэц. Дотор нь хэд
   хэдэн дэд хэсэг байгаа тул эхлээд wireframe хийж задлах нь зүйтэй.

### Design system

5. **Radius хоёр янз.** Token нь `--radius: 0.5rem` (8px). Гэтэл button, card,
   `NATIVE_SELECT` бүгд `rounded-[2px]`, нийт 77 удаа ашиглагдсан. Бодит хэл нь
   2px, 8px нь зөвхөн shadcn-ийн popover зэрэг үндсэн утгуудад үлдсэн. 2px-ийг
   token болгоод `--radius`-ийг түүнд тааруулах хэрэгтэй.
   `button.tsx`-ийн тайлбарт "cards round at 4" гэж бичсэн ч card нь 2px байгаа.
6. **Typography scale-д жижиг алхам дутуу.** `text-[11px]` 66 удаа,
   `text-[10px]` 11, `text-[13px]` 5, `text-[9px]` 2 удаа ашиглагдсан. Хамгийн
   их нь ClassDay, StudyPlanCards, Productive, Exams, Clubs-д байна. Caption
   (11px) token нэмбэл ихэнх нь шийдэгдэнэ.
7. **Select хоёр төрөл.** `native-select` (11 хуудас) ба shadcn `select`
   (Assessment, Catalog, QuizResults). QuizResults хоёуланг нь ашигладаг.
8. **Ашиглагдаагүй component-ууд.** `dialog` болон `sheet` хэрэглэгдээгүй.
   `toast` зөвхөн Integrations-д, `table` зөвхөн Integrations-д байна. Бусад
   жагсаалтыг гараар бичсэн. Figma-ийн 02 Components-д хэрэглэгдэж байгаа
   component-уудыг л оруулна.
9. **Фонт илүү ачаалагддаг.** Кодод Plus Jakarta Sans (sans) ба Lora (serif)
   ашиглагддаг (`index.css:1`). Гэтэл `index.html:23` мөн Inter-ийг ачаалдаг,
   тэр нь хаана ч хэрэглэгддэггүй.
10. **Шууд өнгө бага.** Tailwind-ийн шууд өнгө 28 удаа гарсан, ихэнх нь
   `teacher/Integrations.tsx` болон `error-boundary.tsx`-д. Бусад хуудас
   token ашигладаг.

### Mobile

11. Цэс mobile дээр `<details>` болж эвхэгддэг (`Navigation.tsx`). Breakpoint
    огт ашиглаагүй 11 хуудас бий. Үүний дотор ажлын гол дэлгэцүүд болох teacher
    Schedule, Homework болон guardian Child орно. Эдгээрийг 390px дээр нүдээр
    шалгах хэрэгтэй. Тоо нь ямар нэг асуудал байгааг батлахгүй.
