# EJ Learning

Сургуулийн сургалт, өдөр тутмын үйл ажиллагааг үе шаттай дэмжих систем. Эхний хөгжүүлэлт нь багш–сурагчийн сургалтын ажилд төвлөрнө: хичээл төлөвлөх, материал үзэх, сорил гүйцэтгэх, үр дүнг хянах.

Төлөв: хөгжүүлэлтийн шат. Нэвтрэлт, хуваарь, сорил, үнэлгээний код байна; production-д ашиглах бэлэн байдал баталгаажаагүй. Дэлгэрэнгүйг [одоогийн төлөв](docs/implementation-status.md)-өөс үзнэ.

## Баримтууд

- [Зорилго ба шаардлага](docs/requirements.md) — батлагдсан чиглэл, баталгаажуулах санал.
- [Ажлын урсгалын жишээ](docs/scenarios.md) — хэрэглэгч системийг ямар дарааллаар ашиглах вэ. Менежер, багштай ярилцахад.
- [Шаардлагын жагсаалт](docs/functional-requirements.md) — дугаарласан FR/NFR, тус бүрийн хэрэгжилтийн төлөвтэй.
- [User story ба хүлээн авах шалгуур](docs/user-stories.md) — шаардлага бүрийг ямар тестээр баталгаажуулсан.
- [Менежерээс тодруулах зүйлс](docs/client-questions.md) — уулзалтын хуудас, шийдвэрийн бүртгэл.
- [Хэрэгжүүлэлтийн төлөв](docs/implementation-status.md) — кодод байгаа зүйл, зөрүү, эрсдэл, шалгалтын тэмдэглэл.
- [Хөгжүүлэлтийн суурь ба дараагийн ажил](docs/development-foundation.md) — эзэмшил, эрх, орчин, хариуцлага, ажлын дараалал.
- [Өгөгдөл бэлтгэх](docs/data-requirements.md) — багш, менежерт зориулсан бэлтгэлийн заавар.
- [Өгөгдлийн бүтэц](docs/database-mapping.md) — schema, модуль, migration, хадгалалт ба нөөцлөлт.

## Бүтэц

| Зам | Үүрэг |
|---|---|
| artifacts/ej-learning | React + Vite интерфэйс |
| artifacts/api-server | Node.js + Express API; identity, content, learning модулиуд |
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

### 3. Database бэлтгэх

Хоёр тохиолдол байна. Шинэ компьютер дээр эхнийхийг сонгоно.

**А. Шинэ хоосон database (шинэ компьютер, шинэ clone)**

PostgreSQL дотор хоосон database үүсгэнэ. Нэр нь `ej_learning_local` эсвэл `ej_learning_test` байх ба ард нь нэмэлт үг залгаж болно (`ej_learning_local_nurlan`). Setup нь `ej_learning_dev` нэрийг зориуд хүлээж авдаггүй — байгаа хөгжүүлэлтийн database-ыг санамсаргүй дарж бичихээс хамгаалсан.

~~~powershell
psql -U postgres -c "CREATE DATABASE ej_learning_local"
~~~

.env доторх `DATABASE_URL`-ыг тэр database руу заана, дараа нь:

~~~powershell
corepack pnpm db:setup
~~~

Энэ нэг команд дараах зүйлийг хийнэ:

- Database үнэхээр хоосон эсэхийг шалгана. Хоосон биш бол юу ч өөрчлөхгүйгээр зогсоно.
- 12 migration-ыг journal-ийн дарааллаар үүсгэж, `drizzle.__drizzle_migrations`-д бүртгэнэ. Дараа нь `migrate` ажиллуулахад дахин хэрэглэгдэхгүй.
- Зохиомол өгөгдөл суулгана: нэг анги, нэг сурагч, нэг хичээл, өнөөдрийн хуваарь, гурван сонголттой нэг асуулт, нэг хуудас PDF.
- `demo-admin`, `demo-teacher`, `demo-student` гэсэн гурван бүртгэл үүсгэж, санамсаргүй нууц үгийг `local-data/generated/<database>-accounts.json`-д бичнэ.

Бодит сурагчийн мэдээлэл, `backups/` доторх dump шаардахгүй. Бүх зохиомол мөр `MOCK-LOCAL-` угтвартай тул хожим ялгахад хялбар.

**Б. Аль хэдийн бүтэц нь байгаа database**

`db:setup` ажиллуулахгүй — хоосон биш тул татгалзана. Оронд нь хянасан migration урсгалыг ашиглана: [database-mapping.md](docs/database-mapping.md#migration-ба-baseline).

### 4. Ажиллуулах ба нэвтрэх

~~~powershell
corepack pnpm db:check
corepack pnpm dev
~~~

`db:check` нь холболт, database-ийн нэр, хүснэгтийн жагсаалтыг харуулна; schema бүрэн нийцсэн эсэхийг батлахгүй.

Вэб: http://localhost:5173 · API: http://localhost:5000/api

`db:setup`-аар бэлтгэсэн бол `local-data/generated/<database>-accounts.json` доторх нууц үгээр `demo-student` эсвэл `demo-teacher` нэрээр нэвтэрнэ. Сурагчийн хуудсанд өнөөдрийн зохиомол хичээл, багшийн хуудсанд тухайн анги харагдана. Энэ файлыг хуваалцахгүй.

Хуучин `EJ_LOCAL_PREVIEW`/header сонголт нь одоогийн нэвтрэх заавар биш.

Frontend өөрчлөлтөө шууд шинэчилнэ; backend-ийн өөрчлөлтийн дараа dev процессыг дахин асаана. Vite `/api` хүсэлтийг backend рүү дамжуулна. Энэ нь production hosting-ийн тохиргоо биш.

Бодит хэрэглэгч үүсгэх CLI `artifacts/api-server/scripts/create-user.ts`-д байна. Энэ нь database-д бичдэг тул эхлээд зөв орчин, дүр, сурагч/багшийн холбоог шалгана. Автоматаар үүсгэсэн нууц үгийг нэг удаа хэвлэдэг; логийг хуваалцахгүй. Одоогийн баримт, commit-д shared password хадгалахгүй.

### 5. Жишиг сургууль (харах, үзүүлэх, шалгахад)

`db:setup`-ийн зохиомол өгөгдөл нь зориуд жижиг — нэг анги, нэг хичээл, нэг асуулт. Тест батлахад тохирно, харин системийг нүдээр харах, уялдааг шалгахад хангалтгүй. Бүрэн жишиг сургууль босгох бол:

~~~powershell
corepack pnpm db:demo
~~~

Юу үүсэх вэ: 3 анги, 24 сурагч, 2 хичээл, урьдач нөхцөлөөр холбогдсон 6 чадвар, нэг багш нэг ангид хоёр хичээл заасан тохиолдол, урьд өмнөх хуудастай ном (хэвлэгдсэн хуудас ≠ файлын хуудас), сар орчмын хуваарь, гурван түвшинд тархсан сорилын үр дүн, багшийн гараар өгсөн үнэлгээ, нөхөх оноолт.

Ажиллагааг нь тестээр биш, ажиллаж байгаа сервер дээр шалгах бол:

~~~powershell
corepack pnpm dev          # нэг цонхонд
corepack pnpm db:demo:walk # нөгөөд нь
~~~

Энэ нь нэвтрэлт → ангийн жагсаалт → хуваарь → өдрийн ажил → номын зөв хуудас → сорил → үнэлгээ → нөхөх ажил → багшийн дэлгэц → эрхийн хязгаар гэсэн гинжийг дамжиж, холбоос бүрийг тайлагнана.

Бүртгэлийн нэр, нууц үг `local-data/generated/<database>-demo-accounts.json`-д бичигдэнэ.

`db:demo` нь `db:setup`-ийн дараа ажиллана, зөвхөн `ej_learning_local`/`ej_learning_test` нэртэй database дээр, мөн нэг database дээр хоёр удаа ажиллахгүй.

### 6. Эхнээс нь дахин эхлэх

Зохиомол орчноо цэвэрлэх бол database-ыг устгаад дахин үүсгэнэ. `db:setup` нь хоосон database-д л ажилладаг тул энэ нь давтагдах цорын ганц зам:

~~~powershell
psql -U postgres -c "DROP DATABASE ej_learning_local"
psql -U postgres -c "CREATE DATABASE ej_learning_local"
Remove-Item local-data/generated/ej_learning_local*.json
Remove-Item storage/content/* -Recurse
corepack pnpm db:setup
~~~

`storage/`-г мөн цэвэрлэх хэрэгтэй: `db:setup` нь байгаа файлыг дарж бичихээс татгалздаг тул үлдсэн PDF дараагийн суулгалтыг зогсооно.

`reset-dev` script нь өөр зүйл: тэр нь байгаа database дотроос бүх мөрийг устгадаг. Ердийн startup алхам биш.

## Шалгалт

~~~powershell
corepack pnpm build
corepack pnpm test
~~~

build нь typecheck-ийг өөрөө ажиллуулна; тусад нь `corepack pnpm typecheck` гэж болно. build давсан нь runtime зөв гэсэн баталгаа биш — тэрийг тест шалгана.

`test` нь бүрэн integration suite ажиллуулна. Ажиллах бүрдээ `ej_learning_test_<санамсаргүй>` нэртэй түр database өөрөө үүсгэж, `db:setup`-аар босгож, API асааж, шалгаад бүгдийг устгана. Одоо байгаа database-д хүрэхгүй; бодит сурагчийн өгөгдөл шаардахгүй.

Юуг шалгадаг вэ: migration бүрэн хэрэглэгдсэн эсэх, гурван дүрээр нэвтрэх, буруу нууц үг хаагдах, session гарахад хүчингүй болох, сурагч багшийн хуудсанд орж чадахгүй байх, өдрийн хичээл ирэх, PDF хүргэгдэх, сорил серверээр шалгагдах, зөв хариулт илгээхээс өмнө сурагчид ил болохгүй байх.

Шаардлага: ажиллаж байгаа local PostgreSQL болон `.env` доторх `DATABASE_URL`. Тест нь тэр холболтоор зөвхөн шинэ түр database үүсгэдэг.

Эдгээр хоёр команд GitHub дээр pull request бүрт автоматаар ажиллана — `.github/workflows/ci.yml`. Merge хийхээс өмнө үр дүн нь PR хуудсан дээр харагдана.

Хуучин `test:db` нь нэвтрэлтгүй preview API-г хүлээдэг байсан тул хассан.

## Өөрчлөлт хийх

API өөрчлөлтийг lib/api-spec/openapi.yaml-д тусгаад corepack pnpm --filter @workspace/api-spec run codegen ажиллуулж, дараа нь diff хянана. Generated файлыг дангаар гараар засахгүй.

Database өөрчлөлтийг schema → generate → SQL хяналт → тусдаа орчны туршилт → migrate дарааллаар хийнэ. db push, reset, restore, baseline тэмдэглэх командыг энгийн startup алхам гэж үзэхгүй. [Maintenance ба startup-ийн зааг](docs/database-mapping.md#maintenance-нь-startup-биш).

GitHub руу анхны push хийхээс өмнө [нийтлэхийн өмнөх асуудлууд](docs/implementation-status.md#github-руу-илгээхийн-өмнө)-ыг шийдвэрлэнэ. Private repository байсан ч сурагчийн эх өгөгдөл, нууц үг оруулахгүй.
