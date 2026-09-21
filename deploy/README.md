# EJ Learning: shared server deployment and later relocation

Status: deployment preparation. Read-only SSH preflight succeeded on 2026-09-21: Ubuntu 24.04 amd64, about 20 GB available RAM and 331 GB free disk at inspection time. TMS Nginx owns port 80; port 18080 was free. No application was deployed by preflight. Current pnpm native-package overrides exclude ARM builds.

## Branch and manual deployment

Work is on `chore/ej-subpath-deploy`, based on committed application revision `a320d86`. Concurrent uncommitted feature work is excluded. Push/PR builds and tests disposable containers only. Merge reviewed application/deployment changes to `main`; then use Actions → **EJ container check and manual deploy** → **Run workflow** on main. A push/merge alone does not deploy. The first run requires `initialize_empty_database=true`; later updates leave it false.

The workflow publishes the tested api/web/tools images to GHCR with the full commit SHA, copies release config via SSH, and starts only Compose project `ej-learning`. Repository secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_PASSWORD`; optional `SERVER_FINGERPRINT` verifies the SSH host key. `SERVER_PORT` is a repository variable (default 22). GHCR uses the job's temporary `GITHUB_TOKEN`; no Docker Hub secrets are required. Keep package visibility private and ensure the organization allows Actions to create packages.

Server state lives under `$HOME/ej-learning` for the SSH user: `server.env`, `storage/`, `backups/`, and `releases/<sha>/`. The initial database contains schema only. The workflow does not import local students or seed demo accounts, create the first admin, modify TMS, or configure public ingress/TLS. Those are explicit first-provisioning steps. Do not repeatedly initialize a partially provisioned database; inspect it and use the migrator once baseline history is verified.

Run the container integration test with `node deploy/smoke.mjs` after building `ej-learning-{api,web,tools}:ej-check`. It creates and removes only a random `ej-smoke-*` project with synthetic data and checks login, cookies, PDF and path routing. It sends cookies explicitly over local HTTP and is not a browser HTTPS verification.

## Isolation and ingress

Use `/srv/ej-learning` for this application, Compose project `ej-learning`, its own PostgreSQL 18 volume and network, and `/srv/ej-learning/storage` for PDF files. Never reuse TMS databases, volumes, credentials or Compose project names. Do not run TMS cleanup commands.

Only web publishes a port, initially `127.0.0.1:18080`. API and DB are internal. The deployment is built for `/ej/`: assets and router use that prefix, the client calls `/ej/api/`, PDF links are prefixed, and Nginx rewrites cookie Path to `/ej/`. Root `/api` is not served by EJ. This is routing separation, not a browser security boundary: TMS and EJ on the same origin must both be trusted.

Inspect the live TMS gateway network/config before applying `compose.gateway.yml` and the example `nginx-tms-location.conf.example`. Only EJ web joins the shared gateway network. Do not point a container at the host's `127.0.0.1`. Preserve the existing TMS config and test before graceful reload. Production login cookies require HTTPS; see [IP HTTPS provisioning](ip-https.md).

Before deployment record: host architecture/OS, free RAM/disk, Docker/Compose versions, existing port bindings, gateway configuration and certificate owner. Budget memory after observing TMS usage. Choose resource limits after inspection; these files do not reserve capacity.

## Build a release

Copy `deploy/.env.example` to `deploy/.env`. Set a random database password (hex avoids URL escaping), matching DATABASE_URL, absolute storage path, image prefix and a unique reviewed release tag. Use the same tag for api/web/tools. Keep this file outside Git and restrict it to the operator. Pin base-image digests in the reviewed release for reproducible rebuilds.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml --profile ops config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml --profile ops build
```

Run CI build/tests before publishing. Images may be pushed to a private registry with `compose --profile ops push`, or transferred using `docker image save` / `docker image load`. No registry/provider-specific code is required. Do not include local `.env`, backups, student source data or PDFs in images; `.dockerignore` limits the context.

## First deployment

Create the storage directory and place the chosen PDFs there, preserving their database-relative paths. Files need to be readable by container UID 1000. The API mounts them read-only. Select either a fresh database or a reviewed existing-data restore, never both.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --wait db
# NEW EMPTY DATABASE ONLY: schema, no accounts/demo data.
docker compose --env-file deploy/.env -f deploy/compose.yml run --rm tools node lib/db/scripts/init-production.mjs --empty-database
# Create first admin interactively; generated password is printed once. Do not log/share it.
docker compose --env-file deploy/.env -f deploy/compose.yml run --rm -w /app/artifacts/api-server tools node scripts/run-ts.mjs scripts/create-user.ts --username admin --role ADMIN --display-name Administrator
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --wait api web
curl --fail http://127.0.0.1:18080/ej/api/healthz
```

The existing `db:setup` is local-only and seeds demo data. Do not use it for production. The ordinary migrator cannot initialize the commented historical baseline; `init-production.mjs` explicitly handles it and refuses occupied databases. A restored database must have verified migration history before `migrate`.

The health endpoint checks HTTP liveness only. Also query the DB/migration journal, then test HTTPS login/logout, role access, PDF reading, a quiz submission and persistence after restart. A newly initialized schema has no school/course data; agree on the import dataset before opening access.

## Update and rollback

Record the old image tags/digests and migration journal. Back up DB/storage first. Pull/load all three new images, stop `web api` for a short maintenance window, run `compose run --rm tools` to apply migrations, then `compose up -d --wait api web`. Each command needs the same `--env-file deploy/.env -f deploy/compose.yml` flags. Never run `down -v`.

If migration fails, keep traffic closed and diagnose; do not continue automatically. Application rollback means selecting previous api/web/tools tags and restarting them, only when the schema remains compatible. Database rollback requires restoring the matched pre-update backup into a separate volume/database and accounting for any newer writes. Do not blindly reverse migration SQL or overwrite the only database copy.

## Backup and moving servers

Keep timestamped backups outside the server as well as locally, with restricted access. Back up after stopping API writes and any external imports. Example on Linux, after creating a new private backup directory:

```sh
umask 077
docker compose --env-file deploy/.env -f deploy/compose.yml stop web api
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T db pg_dump -U ej_owner -d ej_learning -Fc > /secure/backup/ej-learning.dump
tar -C /srv/ej-learning/storage -czf /secure/backup/storage.tar.gz .
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --wait api web
```

Use unique backup paths; check every exit status before proceeding. Also retain the release manifest, Compose/config files, image digests and securely escrowed environment settings. A database dump and storage archive are a matched pair. Schedule backups once the host's scheduler and off-server destination are known; scheduling is not installed by this preparation.

Relocation procedure:

1. Provision a Linux amd64 host; transfer the same release images, configs and paired backups securely. Keep PostgreSQL major version 18 for the move; handle upgrades separately.
2. Start a fresh isolated DB volume. Do NOT run schema initialization before restore. Restore with `pg_restore --exit-on-error --no-owner --no-privileges -U ej_owner -d ej_learning` via `compose exec -T db`, feeding the dump on stdin. Extract the storage archive into the new storage directory. Verify permissions and migration journal.
3. Test the new server with the intended HTTPS hostname (temporary local DNS override) before changing public DNS. Confirm login, PDF, quiz persistence and restore success.
4. For final cutover stop writes on the old host, make a final paired backup, restore into a fresh target, verify, then switch DNS/gateway. Never allow both copies to accept writes.
5. Keep the old server and backup intact until acceptance. If the new server has accepted writes, returning to the old server requires transferring those changes; switching DNS back alone would lose data.

References: [Compose project isolation](https://docs.docker.com/compose/how-tos/project-name/), [Compose networking](https://docs.docker.com/compose/how-tos/networking/), [PostgreSQL 18 volume layout](https://hub.docker.com/_/postgres).
