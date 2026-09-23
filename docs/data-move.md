# Moving the school's data onto the server

The application is deployed and its database is empty: one administrator
account and nothing else. Every student, teacher, class, timetable slot and
book outline exists only in the local PostgreSQL on the machine the import
scripts were run on. This is the procedure for moving it once, and for proving
afterwards that nothing was lost on the way.

Read it through before starting. Every step is reversible until step 6.

## What is being moved

Measured on 2026-09-23:

| | |
|---|---|
| Database dump | about 15 MB |
| Storage (textbook PDFs) | 289 MB, 13 files |
| Students / teachers / classes | 292 / 32 / 14, all marked REAL |
| Timetable slots | 552 |
| Book outline sections | 99 (Математик VI and Монгол хэл VI) |

The dump and the storage archive are a **matched pair**. A database that names
a PDF the storage does not have shows a child a book that will not open.

## 1. Give the roster passwords nobody can guess

The accounts were set up with passwords derived from the account number -
`ej26s0106` had `Ej26S0106!`. That is acceptable on a laptop and not
acceptable on the internet: one guessed login exposes every child's name,
placement level and answers.

```sh
pnpm --filter @workspace/api-server reset-roster-passwords              # dry run
pnpm --filter @workspace/api-server reset-roster-passwords -- --apply --yes
```

It writes two files under `local-data/generated/`, readable only by you:

- `student-passwords-<date>.csv` - class, name, username, password
- `staff-passwords-<date>.csv` - teacher code, name, username, password

**These are the only copy.** The database stores a hash; a lost file means
resetting again, not recovering. Print them, hand them out, and keep the
originals somewhere locked.

Administrators are not touched. Usernames are not touched.

## 2. Take the dump and the storage archive

Run from the repository root. `--format=custom` is what `pg_restore` reads.

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  --format=custom --no-owner --no-privileges `
  --dbname postgresql://postgres:PASSWORD@localhost:5432/ej_learning_local `
  --file ej-learning-2026-09-23.dump

tar -czf storage-2026-09-23.tar.gz -C storage .
```

Record what you are moving, so there is something to compare against
afterwards:

```powershell
node --env-file-if-exists=.env lib/db/scripts/census.mjs --out census-before.json
```

## 3. Copy all three to the server

```sh
scp ej-learning-2026-09-23.dump storage-2026-09-23.tar.gz census-before.json \
  USER@HOST:~/
```

Nothing goes through GitHub. The data travels from your machine to the server
and stops there.

## 4. Stop the application, keep the database running

```sh
release=$HOME/ej-learning/releases/6399ac74467a432ba905e4ad6bc04a47bc2e1c06
compose="docker compose --project-name ej-learning --env-file $HOME/ej-learning/server.env -f $release/deploy/compose.yml"

$compose stop web api
```

The database container stays up: it is what the restore talks to.

## 5. Replace the empty database

The dump carries the schema as well as the rows, so the target must be empty
and **`init-production.mjs` must not be run first**. Dropping and recreating is
how the target is made empty.

```sh
$compose exec -T db psql -U ej_owner -d postgres -c \
  'DROP DATABASE ej_learning WITH (FORCE)'
$compose exec -T db psql -U ej_owner -d postgres -c \
  'CREATE DATABASE ej_learning OWNER ej_owner'

$compose exec -T db pg_restore --exit-on-error --no-owner --no-privileges \
  -U ej_owner -d ej_learning < ~/ej-learning-2026-09-23.dump
```

`--exit-on-error` matters: without it `pg_restore` reports success after
skipping whatever failed.

The administrator account that was on the server disappears here, along with
the nine sessions. The `admin` account from the local database takes its place.
Make sure you know its password before running this.

## 6. Put the books where the database expects them

```sh
sudo tar -xzf ~/storage-2026-09-23.tar.gz -C /srv/ej-learning/storage
sudo chown -R 1000:1000 /srv/ej-learning/storage
```

The API mounts this read-only as container user 1000. Check
`EJ_STORAGE_PATH` in `server.env` if the path differs.

## 7. Start the application and prove the move

```sh
$compose up -d --wait api web
curl --fail http://127.0.0.1:18080/ej/api/healthz
```

Then run **Actions → Server database census (read only)** and compare it with
`census-before.json`. Every table must carry the same number of rows. A
restore that "succeeded" while silently dropping a table is invisible until a
teacher opens a screen with nothing behind it.

By hand, in the browser:

- sign in as `admin` and change that password immediately;
- sign in as one teacher and one student from the printed lists;
- open a lesson that has a book and check the PDF opens at the right page;
- submit one quiz answer, restart the containers, and check it is still there.

## If something goes wrong

Before step 5 nothing has changed: start `api` and `web` again and the empty
server is as it was.

After step 5, the recovery is to repeat steps 5 and 6 from the same pair of
files. The local database is untouched throughout and remains the authority
until the checks in step 7 pass.

Do not run `docker compose down -v`. It removes the volume.

## After acceptance

- Keep the dump, the archive and the password lists somewhere off the server.
- Schedule a backup on the host: the pair is
  `pg_dump -Fc` plus a storage archive, taken with the API stopped.
- The 39 rows parked in `staging.import_rows` are CEFR results whose student
  names nobody has confirmed. They travel with the dump and stay parked until
  a teacher confirms them.
