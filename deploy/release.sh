#!/usr/bin/env bash
# Called only by the manually started main-branch workflow. Never edits TMS.
set -Eeuo pipefail
umask 077
release=${1:?Release SHA required}
[[ "$release" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release SHA'; exit 1; }
: "${EJ_IMAGE_PREFIX:?Image registry prefix required}"
deploy_root="$HOME/ej-learning"
mkdir -p "$deploy_root"
exec 9>"$deploy_root/.deploy.lock"
flock -n 9 || { echo 'Another EJ deployment is running'; exit 1; }
release_dir="$deploy_root/releases/$release"
test -f "$release_dir/deploy/compose.yml"
mkdir -p "$deploy_root/storage" "$deploy_root/backups"
# The non-root API must traverse the mount; files stay read-only to the API.
chmod 755 "$deploy_root/storage"
if [[ ! -f "$deploy_root/server.env" ]]; then
  [[ "${EJ_INITIALIZE_EMPTY:-false}" == true ]] || { echo 'First deployment requires initialize_empty_database'; exit 1; }
  password=$(openssl rand -hex 32)
  printf 'POSTGRES_PASSWORD=%s\nDATABASE_URL=postgresql://ej_owner:%s@db:5432/ej_learning\nEJ_STORAGE_PATH=%s/storage\nEJ_HTTP_PORT=18080\n' \
    "$password" "$password" "$deploy_root" > "$deploy_root/server.env"
  unset password
fi
export EJ_VERSION="$release"
compose=(docker compose --project-name ej-learning --env-file "$deploy_root/server.env" -f "$release_dir/deploy/compose.yml")
if grep -q '^EJ_GATEWAY_NETWORK=.' "$deploy_root/server.env"; then
  compose+=(-f "$release_dir/deploy/compose.gateway.yml")
fi
"${compose[@]}" --profile ops config --quiet
"${compose[@]}" --profile ops pull
if [[ -f "$deploy_root/current-release" ]]; then
  [[ "${EJ_INITIALIZE_EMPTY:-false}" != true ]] || { echo 'Refusing initialization of an existing deployment'; exit 1; }
  backup="$deploy_root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release"
  mkdir "$backup"
  "${compose[@]}" stop web api
  "${compose[@]}" exec -T db pg_dump -U ej_owner -d ej_learning -Fc > "$backup/database.dump"
  tar -C "$deploy_root/storage" -czf "$backup/storage.tar.gz" .
  cp "$deploy_root/current-release" "$backup/previous-release"
  "${compose[@]}" run --rm tools
else
  [[ "${EJ_INITIALIZE_EMPTY:-false}" == true ]] || { echo 'No release record; verify database before retrying initialization'; exit 1; }
  "${compose[@]}" up -d --wait db
  "${compose[@]}" run --rm tools node lib/db/scripts/init-production.mjs --empty-database
fi
"${compose[@]}" up -d --wait api web
curl --fail --silent --show-error --retry 5 --retry-delay 2 http://127.0.0.1:18080/ej/api/healthz
printf '%s\n' "$release" > "$deploy_root/current-release"
printf '%s\n' "$EJ_IMAGE_PREFIX" > "$deploy_root/image-prefix"
echo 'EJ release started on loopback port 18080. TMS/gateway unchanged.'
echo 'Public routing, HTTPS and first admin/data setup are separate initial provisioning steps.'
