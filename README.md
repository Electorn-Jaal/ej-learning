# EJ Learning

Сургуулийн сургалт, өдөр тутмын үйл ажиллагааг үе шаттай дэмжих систем. Эхний хөгжүүлэлт нь багш–сурагчийн сургалтын ажилд төвлөрнө: хичээл төлөвлөх, материал үзэх, сорил гүйцэтгэх, үр дүнг хянах.

Төлөв: хөгжүүлэлтийн шат. Нэвтрэлт, хуваарь, сорил, үнэлгээний код байна; production-д ашиглах бэлэн байдал баталгаажаагүй. Дэлгэрэнгүйг [одоогийн төлөв](docs/implementation-status.md)-өөс үзнэ.

## Баримтууд

- [Зорилго ба шаардлага](docs/requirements.md) — батлагдсан чиглэл, баталгаажуулах санал.
- [Хэрэгжүүлэлтийн төлөв](docs/implementation-status.md) — кодод байгаа зүйл, зөрүү, эрсдэл, шалгалтын тэмдэглэл.
- [Хөгжүүлэлтийн суурь ба дараагийн ажил](docs/development-foundation.md) — эзэмшил, эрх, орчин, хариуцлага, ажлын дараалал.
- [Өгөгдөл бэлтгэх](docs/data-requirements.md) — багш, менежерт зориулсан бэлтгэлийн заавар.
- [Өгөгдлийн бүтэц](docs/database-mapping.md) — schema, модуль, migration, хадгалалт ба нөөцлөлт.

## Бүтэц

| Зам | Үүрэг |
|---|---|
| artifacts/ej-learning | React + Vite интерфэйс |
| artifacts/api-server | Node.js + Express API; identity, content, learning модулиуд |
| artifacts/mockup-sandbox | Загварын туршилтын орчин; бүтээгдэхүүний хэсэг биш |
| lib/db | PostgreSQL, Drizzle schema ба migration |
| lib/api-spec | OpenAPI гэрээ, codegen |
| lib/api-client-react, lib/api-zod | Үүсгэсэн клиент ба баталгаажуулах схем |
| scripts | Workspace-ийн туслах script; scripts/src дотор Excel/PDF боловсруулах Python |
| docs | Зорилго, шаардлага, техникийн заавар |

Browser → интерфэйс → API → PostgreSQL. PDF материал API-ийн тохируулсан файлын хадгалалтаас уншигдана.

### Өгөгдлийн хавтаснууд

Гурван хавтас гурван өөр зориулалттай. Гурвуулаа .gitignore-д орсон; Git repository нь database, upload файл, эх өгөгдлийн backup биш.

| Хавтас | Зориулалт | Агуулга |
|---|---|---|
| local-data/ | Сурагчийн эх өгөгдөл, түүнээс гаргасан файл. Зөвхөн local | source/ — хүлээн авсан workbook, PDF хэвээр нь. extracted/ — extract script-ийн гаргасан JSON. generated/ — script-ийн үүсгэсэн бүртгэлийн жагсаалт |
| storage/ | Ажиллаж байгаа API-ийн хүргэдэг агуулгын файл | EJ_STORAGE_DIR заана; content/ доор PDF |
| backups/ | Database-ийн dump; сэргээх зориулалттай | pg_dump-ийн файлууд. Устгахгүй |

local-data/ дотор сурагчийн код, анги, хариулт болон үүсгэсэн нууц үг байна. Хуулах, хуваалцах, Git-д оруулах, тайланд хэвлэхгүй. Дэлгэрэнгүй дүрмийг [өгөгдөл бэлтгэх](docs/data-requirements.md)-ээс үзнэ.

## Local эхлэл

### 1. Урьдчилсан нөхцөл

- Node.js 24+, Corepack; pnpm-ийн хувилбар root package.json-д заасан байна.
- PostgreSQL. Database нэрийг .env.example-ээс таахгүй, холболтоо шалгана.
- Тохирох schema, migration history, тусдаа local хэрэглэгчийн бүртгэл.
- Материал үзүүлэх бол тохирох PDF болон database-ийн storage reference.

### 2. Тохиргоо

Windows PowerShell дээр төслийн үндсэн хавтсаас:

~~~powershell
corepack pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
~~~

.env файлыг өөрийн орчинд засна:

| Тохиргоо | Утга |
|---|---|
| DATABASE_URL | PostgreSQL холболт; username/password дахь тусгай тэмдэгтийг URL encode хийнэ |
| API_PORT | Local API порт; жишиг 5000 |
| WEB_PORT | Local вэб порт; жишиг 5173 |
| BASE_PATH | Local үндсэн зам / |
| EJ_STORAGE_DIR | Төслийн storage хавтасны абсолют зам; Windows дээр C:/.../storage хэлбэр ашиглаж болно |
| API_PROXY_TARGET | Зөвхөн API өөр хаягт ажиллах үед Vite proxy override |

Нууц утгыг issue, баримт, screenshot, commit-д оруулахгүй. .env.example нь зөвхөн placeholder байна. Backend-ийн файл хадгалалтын fallback нь process-ийн working directory-оос хамаардаг тул EJ_STORAGE_DIR-ийг ил тод тохируулна.

### 3. Database-ийн анхааруулга

**Шинэ хоосон database дээр clone → migrate хангалттай биш.** Эхний migration нь өмнө байсан database-ийн commented introspection baseline. Шинэ орчин босгох аюулгүй baseline урсгал хараахан баталгаажаагүй. [Дэлгэрэнгүй](docs/database-mapping.md#migration-ба-baseline).

### 4. Ажиллуулах

Бүтэц нь нийцсэн local database болон хэрэглэгчийн бүртгэл бэлэн үед:

~~~powershell
corepack pnpm db:check
corepack pnpm dev
~~~

db:check нь холболт ба хүснэгтийн нэрийг шалгана; schema бүрэн нийцсэн эсэхийг батлахгүй.

Вэб: http://localhost:5173 · API: http://localhost:5000/api. Хэрэглэгчийн нэр, нууц үг ба session cookie-гоор нэвтэрнэ. Хуучин EJ_LOCAL_PREVIEW/header сонголт нь одоогийн нэвтрэх заавар биш.

Frontend өөрчлөлтөө шууд шинэчилнэ; backend-ийн өөрчлөлтийн дараа dev процессыг дахин асаана. Vite /api хүсэлтийг backend рүү дамжуулна. Энэ нь production hosting-ийн тохиргоо биш.

Хэрэглэгч үүсгэх CLI artifacts/api-server/scripts/create-user.ts-д байна. Энэ нь database-д бичдэг тул эхлээд зөв орчин, дүр, сурагч/багшийн холбоог шалгана. Автоматаар үүсгэсэн нууц үгийг нэг удаа хэвлэдэг; логийг хуваалцахгүй. Одоогийн баримт, commit-д shared password хадгалахгүй.

## Шалгалт

~~~powershell
corepack pnpm typecheck
corepack pnpm build
~~~

build нь typecheck-ийг өөрөө ажиллуулна; хоёр командыг заавал дараалуулан давтахгүй. build давсан нь runtime зөв гэсэн баталгаа биш.

test:db script нь хуучин preview урсгалд зориулсан бөгөөд одоогийн auth-тай зөрдөг. Үүнийг одоогийн системийн хүлээн авах шалгалт гэж ашиглахгүй. [Шалгалтын төлөв](docs/implementation-status.md).

## Өөрчлөлт хийх

API өөрчлөлтийг lib/api-spec/openapi.yaml-д тусгаад corepack pnpm --filter @workspace/api-spec run codegen ажиллуулж, дараа нь diff хянана. Generated файлыг дангаар гараар засахгүй.

Database өөрчлөлтийг schema → generate → SQL хяналт → тусдаа орчны туршилт → migrate дарааллаар хийнэ. db push, reset, restore, baseline тэмдэглэх командыг энгийн startup алхам гэж үзэхгүй. [Maintenance ба startup-ийн зааг](docs/database-mapping.md#maintenance-нь-startup-биш).

GitHub руу анхны push хийхээс өмнө [нийтлэхийн өмнөх асуудлууд](docs/implementation-status.md#github-руу-илгээхийн-өмнө)-ыг шийдвэрлэнэ. Private repository байсан ч сурагчийн эх өгөгдөл, нууц үг оруулахгүй.
