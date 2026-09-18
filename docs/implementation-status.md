# Хэрэгжүүлэлтийн төлөв ба үлдсэн асуудал

Шалгасан: 2026-09-18. Эх кодын үзлэг. Live database, browser болон production ажиллагааг энэ засвараар баталгаажуулаагүй.

## Кодод байгаа боломжууд

| Боломж | Нотлох эх сурвалж | Хязгаар |
|---|---|---|
| Login, logout, session, password change | modules/identity/routes.ts; pages/Login.tsx, Password.tsx | Эрхийн бүрэн аудит хийгдээгүй |
| Өдрийн ажил, хуваарь, нэмэлт оноолт | modules/learning/routes.ts; Today.tsx, Schedule.tsx | Бодит өгөгдөлтэй хүлээн авалт шаардлагатай |
| Серверээр MCQ шалгах, хариулт хадгалах | quizPaper, recordQuizAttemptScored; schema/quiz.ts | Хадгалалтгүй UI mock гэсэн хуучин тайлбар буруу |
| Багшийн үр дүн, гараар үнэлэх | teacher/quiz-attempts, assessment-sheet, assessments | Зөвхөн бага ангид зориулсан бүрэн оношилгоо гэж дүгнэхгүй |
| Чадварын тооцоолол | modules/learning/mastery.ts | 80/50 босго, шинэ evidence 0.6 жин, mastery-д 2 оролдлого; сургалтын бодлогоор баталгаажаагүй |
| Нөхөх оноолт | modules/learning/remediation.ts; quiz submit-ээс дуудагдана | APPROVED REQUIRED холбоос, MAX_DEPTH=5; багшийн оноолтыг дарж бичихгүй байх SQL нөхцөлтэй |
| PDF ба номын бүтэц | modules/content/routes.ts; pages/admin/Books.tsx | Бүрэн агуулга батлах урсгал, хэрэглэгч удирдах UI гэсэн үг биш |

Дээрх source замууд backend-д artifacts/api-server/src, UI-д artifacts/ej-learning/src, schema-д lib/db/src доор байрлана.

## GitHub руу илгээхийн өмнө

2026-09-18-нд хийсэн цэгцлэлт:

- Сурагчийн эх workbook, ном PDF, extract хийсэн JSON, үүсгэсэн бүртгэлийн жагсаалтыг local-data/ руу шилжүүлж, .gitignore-д нэмж, Git tracking-ээс хассан. Файлууд local дээр хэвээр байна.
- Эдгээр зам болон 134 MB PDF-ийг Git түүхээс мөн цэвэрлэсэн. Repository-д remote тохируулаагүй, өмнө нь push хийгээгүй тул түүх гадагш нийтлэгдээгүй. Түүх дахин бичихийн өмнө бүрэн mirror хуулбарыг repository-ийн гадна үүсгэсэн.
- Replit-ийн scratch хавтаснуудыг (.conversation/, .config/) tracking-ээс хассан.

Үлдсэн ажил:

1. **Нууц үг солих.** Өмнөх баримтын нэг хувилбарт хөгжүүлэлтийн гурван бүртгэлийн shared password бичигдсэн байсан. Мөн create-english-accounts script нь бодит сурагчдад нууц үг үүсгэж файлд бичсэн. Эдгээр аль нэг нь ашиглагдаж байгаа бол солино. Нууц үгийг энэ баримтад давтан бичихгүй.
2. **local-data/ нь Git-ээр хамгаалагдахгүй.** Зөвхөн энэ компьютер дээр байна. Хэрэгтэй бол repository-оос тусдаа, зөвшөөрөлтэй хадгалалтад нөөцлөнө.
3. Шинэ Organization repository-ийн хаяг ба local remote тохирч байгаа эсэхийг нягтална. Энэ ажлаар remote нэмээгүй, push хийгээгүй.
4. Push хийхийн өмнө tracked файлын жагсаалтыг дахин нэг шалгана. .gitignore нь зөвхөн ирээдүйд нэмэгдэх файлд үйлчилнэ.

## Google Workspace холболт

Эх кодын үзлэг; Google account руу холбогдож шалгаагүй. Google Workspace нь эхний хөгжүүлэлтийн урьдчилсан нөхцөл биш. Сургуулийн имэйл байгаа нь Google Workspace эсвэл app integration тохирсон гэсэн үг биш.

- Идэвхтэй native-learning route нь Google холболтыг not_connected гэж буцаадаг.
- Хуучин routes/ej-learning.ts дахь mock router нь routes/index.ts-д mount хийгдээгүй.
- Application-ийн өөрийн session нэвтрэлт бий. Энэ нь Google OAuth биш.
- Интеграцийн дэлгэц, contract болон SDK dependency байгаа нь бодит sync ажиллаж байгаагийн баталгаа биш.

Хэрэгцээ батлагдвал эхлээд ямар мэдээллийг ямар системээс авах, аль нь үндсэн бүртгэл байх, хэн зөвшөөрөхийг шийднэ. Дараа нь тухайн үеийн албан ёсны Google баримтаар API, OAuth, scope, token хадгалалт, цуцлалт, давтан импортын дүрмийг судална. Одоогоор Cloud project үүсгэх, түлхүүр авах шаардлага тавихгүй. Өмнөх баримтын OAuth scope болон implementation алхмуудыг батлагдсан deploy заавар гэж ашиглахгүй. CSV/Excel импорт ч тусдаа баталгаажуулалт, эрх, алдааны боловсруулалт шаарддаг.

## Local орчин ба шалгалт

- test:db нь EJ_LOCAL_PREVIEW, X-Preview-Student-Id болон нэвтрэлтгүй preview API-г хүлээдэг. Идэвхтэй route-ууд auth шаарддаг тул одоогийн regression suite биш. Script-ийг энэ баримтын засвараар өөрчлөөгүй, ажиллуулаагүй.
- 0000 migration нь commented introspection baseline. Хоосон database-ийг clone-оос аюулгүй босгох урсгал дутуу.
- README болон .env.example дэх preview startup зааврыг шинэчилсэн.
- Build/typecheck үр дүнг доорх шалгалтын тэмдэглэлд бичнэ; build давсан нь runtime зөв гэсэн баталгаа биш.

## Хянуулах техникийн асуудлууд

- class_teachers primary key анги × багш; нэг ангид олон хичээл заахыг бүрэн илэрхийлэхгүй.
- grade_levels нь 1–11, terms нь 1–3 хязгаартай. Сургуулийн бодит хэрэгцээтэй тулгана.
- native-learning дахь /preview/students, /teacher/review-queue нь role шалгадаг ч харагдаж буй handler нь багшийн identity-г өгөгдлийн query-д дамжуулахгүй. Өөр ангийн мэдээлэл харагдах хүрээг production-оос өмнө шалгаж засах шаардлагатай.
- rebuild-mastery script нь бүх mastery мөрийг устгаад quiz evidence-ээс сэргээдэг. Багшийн үнэлгээ ордог болсон тул үүнийг алдагдалгүй дахин тооцоолол гэж үзэж болохгүй.
- Хуучин native-learning endpoint ба шинэ learning модуль зэрэгцэн байна. Аль UI ямар endpoint хэрэглэдгийг цэгцэлж байж legacy код хасна.
- Өмнөх handoff-д англи хэлний материалд өөр хичээлийн ном, зохиомол хуудас түр холбосон гэж тэмдэглэсэн. Live өгөгдөлд хэвээр эсэхийг шалгаагүй; бодит хэрэглээнд оруулахын өмнө баталгаажуулна.
- Production hosting, backup сэргээх, monitoring, deployment rollback баталгаажаагүй.

## Баримтын зохион байгуулалт

Зорилгыг сургуулийн өргөжих системийн хүрээнд бичиж, ойрын сургалтын хэсгээс ялгасан. Хуучин тоон snapshot, хугацааны таамаг, ажиллаж байгаа гэсэн баталгаагүй дүгнэлтүүдийг авсан.

2026-09-18-нд давхардсан файлуудыг нэгтгэв:

| Хуучин файл | Хаашаа орсон |
|---|---|
| docs/start.md | Ажиллуулах хэсэг README-д; migration baseline ба maintenance хэсэг [database-mapping.md](database-mapping.md)-д |
| docs/continue-here.md | Ажлын дараалал ба ажлын зарчим [development-foundation.md](development-foundation.md)-д |
| docs/google-workspace-readiness.md | Энэ файлын "Google Workspace холболт" хэсэгт |
| replit.md | Доорх Replit тэмдэглэлд; холбоосын жагсаалт README-д давхардаж байсан |

Replit тухай: repository-д .replit тохиргооны файлууд байгаа нь тэнд production deploy хийгдсэн гэсэн баталгаа биш. Өмнөх Replit mock үеийн Clerk, preview нэвтрэлт, legacy schema, db push заавар нь одоогийн ажиллуулах журам биш.

## Шалгалтын тэмдэглэл — 2026-09-18

- Баримтын local холбоосууд: тасарсан холбоосгүй.
- git diff --check: амжилттай.
- corepack pnpm build: typecheck болон бүх build амжилттай (exit 0).
- Vite нь tooltip, label, select дээр sourcemap location болон 500 kB-аас том chunk-ийн анхааруулга гаргасан; build зогсоогоогүй.
- Database холболт, integration test, browser smoke test энэ ажлаар ажиллуулаагүй.
- Программын runtime код, schema, database, account өөрчлөөгүй. Import/extract script-ийн файлын замыг local-data/ руу зааж зассан.
