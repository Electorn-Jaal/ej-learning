#!/usr/bin/env bash
set -Eeuo pipefail
ingress="$HOME/ej-learning/ingress"
exec 9>"$ingress/.certificate.lock"
flock -n 9 || exit 0
docker run --rm \
  -v "$ingress/certificates:/etc/letsencrypt" \
  -v "$ingress/certbot-work:/var/lib/letsencrypt" \
  -v "$ingress/certbot-logs:/var/log/letsencrypt" \
  -v "$ingress/webroot:/var/www/acme" \
  certbot/certbot:v5.4.0 renew --quiet
docker compose -p ej-ingress -f "$ingress/compose.yml" exec -T tls nginx -t
docker compose -p ej-ingress -f "$ingress/compose.yml" exec -T tls nginx -s reload
curl --fail --silent --show-error --connect-to 116.206.83.75:443:127.0.0.1:443 https://116.206.83.75/ej/api/healthz
