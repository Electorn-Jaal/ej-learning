# Өгөгдлийн бүтэц ба кодын холбоо

Шинэчилсэн: 2026-09-18. Эх кодын үзлэг; live database-ийн тоо, migration хэрэглэгдсэн эсэхийг энэ удаа шалгаагүй.

| Schema / өгөгдөл | Үүрэг | Кодын эх сурвалж |
|---|---|---|
| core | Хэрэглэгч, дүр, session, сурагч, багш, анги, элсэлт, хичээл | lib/db/src/schema/database.ts, identity.ts |
| core.class_subjects | Анги ямар хичээл үзэх, аль номоор — үндсэн сургалтын гол холбоос | database.ts. `class_teachers` (хэн заадаг) -тай хольж болохгүй: агуулга багшаа даган алга болох ёсгүй |
| content | Ном, хувилбар, бүтэц, сэдэв, чадвар, урьдач нөхцөл, холбоос | lib/db/src/schema/database.ts |
| learning | Хичээл, даалгавар, чадварын үнэлгээ | database.ts |
| learning.terms, class_schedule, student_assignments | Улирал, ангийн хуваарь, сурагчийн оноолт | scheduling.ts |
| core.teacher_subjects | Багш ямар хичээл заадаг — мэргэжил, хуваарь биш | identity.ts. `class_teachers` (хэн аль ангийг хариуцдаг) -аас тусдаа: сургуулийн бүртгэлд мэргэжил бий, анги хариуцуулалт алга. Багшийн уншдаг дэлгэцүүд үүн дээр тулгуурлан ажилладаг |
| learning.class_topics | Анги үндсэн номынхоо аль сэдэв дээр яваа — зөвхөн багш бичнэ | scheduling.ts. Хуанлиас тооцдоггүй: хоцорсон анги эрт улирлын сэдэв дээр байж болно |
| learning.class_periods | Сургуулийн хонхны цаг (1-р цаг хэдэд эхлэх) | scheduling.ts. Хуваарийн сүлжээний мөр бүр нь энэ хүснэгтийн нэг мөр. Хичээлийн жилээр хадгална — хонхны цаг өөрчлөгддөг |
| learning.class_schedule.period_no | Тухайн хичээл өдрийн хэддүгээр цагт орох | NULL байж болно: сургууль хуваарь өгөөгүй бол «тэр өдөр орно, цаг нь тодорхойгүй» |
| learning.quiz_attempts | Сорилын хариулт ба үр дүн | quiz.ts |
| assessment | Асуултын сан, сонголт, оношилгооны түүх | database.ts, quiz.ts |
| core.student_guardians | Хүүхдийн гэр бүлийн утас, хэн болох | identity.ts. `core` дэх хамгийн эмзэг хүснэгт — хүсэлтийн параметрээр биш, сессийн id-гаар л шүүнэ. Утасны 41-ээс 15-д нь л «аав/ээж» гэж бичсэн тул бусад нь `null`; бичигдээгүйг зохиохгүй |
| core.student_transfers | Шилжиж явсан хүүхэд — хаашаа, яагаад, хэзээ | identity.ts. Сурагч устдаггүй, `is_active=false` болно. `left_class_mn` нь текст: 8б гэсэн анги энэ жил байхгүй тул гадаад түлхүүр тавибал импорт унах эсвэл ангийн мэдээлэл алдагдана |
| content.placement_pathways | Түвшин бүрт юу судлах — ном, бүлэг, даалгавар, шалгах арга | proficiency.ts. Хүүхэд бүрээр биш, (түвшин × чадвар) дүрмээр. Хүүхдийн төлөвлөгөө = түүний түвшин × энэ хүснэгт, тиймээс түвшин өөрчлөгдөхөд төлөвлөгөө өөрөө шинэчлэгдэнэ |
| content.proficiency_levels | CEFR гэх мэт түвшний шат — `framework` баганатай тул нэг хүрээгээр хязгаарлагдахгүй | database.ts. Англи хэлний A1–C2 + PRE-A1 ачаалагдсан. PRE-A1 нь CEFR-т албан ёсоор байдаггүй ч «A1-д хүрээгүй» гэдгийг дугуйруулахгүй байх цорын ганц арга |
| assessment.diagnostic_items, diagnostic_item_options | Оношилгооны асуулт ба сонголтууд | database.ts. `answer_source` нь AUTHORITATIVE / RECONSTRUCTED / UNKNOWN — CEFR-ийн түлхүүр Google Form-оос гараагүй, 108 онооноос буцаан бодогдсон тул RECONSTRUCTED |
| assessment.exam_papers, exam_paper_items | Шалгалтын хуудас ба түүний асуултууд | database.ts. Өмнө нь асуулт зөвхөн хичээл+анги+дарааллаар бүлэглэгддэг байсан тул нэгж ба улирлын шалгалтыг ялгах боломжгүй байв. Улирлыг хадгалахгүй — `scheduled_on` нь `learning.terms`-ийн мужид багтахаар тодорхойлогдоно |
| staging | Импортын job/мөрийн загвар | database.ts; бүрэн импортын бүтээгдэхүүн гэсэн үг биш |
| audit | Өөрчлөлтийн бүртгэл | database.ts; бүх үйлдэл хамрагдсан эсэхийг тусад нь шалгана |

## API холбоос

- modules/identity: нэвтрэлт, гаралт, session, нууц үг.
- modules/content: админы номын жагсаалт, PDF upload, бүтэц, page offset.
- modules/learning: өнөөдрийн хичээл, хуваарь, quiz, багшийн үнэлгээ, нөхөх ажил.
- modules/native-learning/routes.ts: ахиц, каталог, хуучин унших endpoint-ууд, Google not_connected төлөв. Role шалгалттай ч зарим багшийн жагсаалтын ангиар хязгаарлах хэрэгжилтийг шалгах шаардлагатай.
- routes/index.ts нь эдгээрийг mount хийдэг.

Өдрийн хичээлийн каталог ба хэнд/хэзээ оноосон ажил нь өөр ойлголт. class_schedule-ийн unique key нь анги × хичээл × өдөр; student_assignments нь сурагч × хичээл × өдөр.

class_teachers мөр бүр өөрийн id-тай; давхардлыг (class_id, teacher_id, subject_id) дээрх UNIQUE NULLS NOT DISTINCT хамгаална. Нэг багш нэг ангид хэд хэдэн хичээл заахыг илэрхийлнэ. subject_id NULL хэвээр зөвшөөрөгдөнө — бага ангийн багш бүх хичээлийг хамарна гэсэн утгатай, NULLS NOT DISTINCT нь тийм мөрийг ч давхардуулахгүй.

Чадварын үнэлгээ AUTO эсвэл TEACHER эх сурвалжтай. Quiz-ээс дахин бодох нь багшийн үнэлгээг бүрэн сэргээхтэй адил биш.

## Migration ба baseline

Идэвхтэй экспорт lib/db/src/schema/index.ts-д; migration journal lib/db/drizzle/meta/_journal.json-д байна. Legacy schema-г шинэ шаардлагын үндэс гэж үзэхгүй.

lib/db/drizzle/0000_flowery_morlun.sql нь өмнө байсан database-аас гаргасан introspection бөгөөд comment дотор байна. Ердийн шинэ database initializer биш. mark-baseline нь бүтэц үүсгэдэггүй, зөвхөн migration history-д тэмдэглэдэг; хоосон database дээр үүнийг ажиллуулахгүй.

**Хоосон database дээр:** `corepack pnpm db:setup` (lib/db/scripts/setup-local.mjs). Энэ нь 0000-ийн comment дотроос SQL-ийг гаргаж ажиллуулаад, journal-ийн үлдсэн migration-уудыг дарааллаар хэрэглэнэ. Миграцийн бүртгэлд drizzle-ийн тооцдог hash (файлын бүтэн эхээс sha256) бичигддэг тул дараа нь `migrate` ажиллуулахад юу ч давхардахгүй. Migration файлуудыг өөрчлөөгүй.

Хамгаалалт: зөвхөн loopback холболт, зөвхөн `ej_learning_local` / `ej_learning_test` нэр, зөвхөн бүрэн хоосон database. `ej_learning_dev` зориуд хүлээн авагддаггүй. Бүх ажиллагаа нэг transaction дотор; алдаа гарвал юу ч үлдэхгүй.

Одоо байгаа database-д migration хэрэглэхээс өмнө холболт, schema, migration history болон нөөц/сэргээх боломжийг шалгана. Хянасан өөрчлөлтөд ашиглах команд:

~~~powershell
corepack pnpm --filter @workspace/db run generate
# Үүссэн SQL-ийг хянаж, тусдаа хөгжүүлэлтийн database-д туршина.
corepack pnpm --filter @workspace/db run migrate
~~~

Эдгээр нь startup бүрд ажиллуулах команд биш. push script package.json-д байгаа ч энэ төслийн migration журмыг орлохгүй.

## Maintenance нь startup биш

- reset-dev бүх мөрийг устгах үйлдэлтэй.
- rebuild-mastery нь AUTO мөрүүдийг устгаад quiz evidence-ээс дахин боддог. Багшийн (TEACHER) үнэлгээг хөндөхгүй — түүнийг сэргээх эх сурвалж байхгүй тул устгахгүй. Багшийн үнэлгээнээс өмнөх сорилыг алгасаж, хойшхийг нь дээр нь холино.
- run-remediation болон seed/import script-үүд мөн database-д бичнэ.
- import-cefr, import-daily-schedule, import-resource-map нь local-data/extracted доторх JSON-оос уншина. Эдгээр файлыг эхлээд extract script-ээр гаргана; [өгөгдөл бэлтгэх](data-requirements.md)-ийг үзнэ.
- create-english-accounts нь бодит сурагчид бүртгэл үүсгээд нууц үгийг local-data/generated/english-accounts.csv-д бичнэ. Энэ файлыг хуваалцахгүй; хэрэглэгдэж байгаа бол нууц үгийг солино.
- db:setup нь эсрэгээрээ зөвхөн зохиомол өгөгдөл суулгадаг бөгөөд хоосон database шаарддаг. Бодит өгөгдөлтэй database дээр ажиллахгүй.

Эдгээрийг ердийн ажиллуулах зааварт автоматаар нэмэхгүй. Script бүрийн эхний тайлбарыг ажиллуулахаас өмнө уншина.

## Файл ба нөөц

source_versions.storage_key нь хадгалалтын reference; өөрөө public URL биш. API нь EJ_STORAGE_DIR доторх файлыг олж хүргэнэ. Database-ийн backup болон storage-ийн backup-ийг тохирох хувилбараар хамтад нь сэргээх шаардлагатай.

backups/ доторх dump болон local-data/, storage/-ийн файлуудыг устгахгүй. Сэргээхийг эхлээд шинэ тусдаа database дээр туршиж, одоо байгаа өгөгдөл дээр шууд restore хийхгүй.

Хуучин баримтын сурагч/хичээл/хүснэгтийн тоо нь өмнөх snapshot байсан. Одоогийн үнэн гэж ашиглахгүй; хэрэгтэй үед зөвшөөрсөн орчинд дахин хэмжинэ. Энэ баримтын шинэчлэлтээр schema, өгөгдөл, migration өөрчлөөгүй.
