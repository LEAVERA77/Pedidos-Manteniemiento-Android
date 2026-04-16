#!/usr/bin/env bash
# =============================================================================
# Proxy HTTPS con Caddy frente a Nominatim (Docker en puerto 8080)
# Oracle Cloud VM — ejecutar como root o con sudo donde corresponda.
# Dominio: sustituir NOMINATIM_HOST por tu FQDN (DNS A → IP pública de la VM).
# made by leavera77
# =============================================================================
set -euo pipefail

NOMINATIM_HOST="${NOMINATIM_HOST:-nominatim.ejemplo.com}"
UPSTREAM="${UPSTREAM:-127.0.0.1:8080}"

if [[ "${NOMINATIM_HOST}" == "nominatim.ejemplo.com" ]]; then
  echo "Definí NOMINATIM_HOST con tu dominio real, p. ej.:"
  echo "  export NOMINATIM_HOST=nominatim.tudominio.com"
  echo "  sudo -E bash scripts/oracle/setup_https_caddy.sh"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
else
  echo "Instalá Caddy según tu distro: https://caddyserver.com/docs/install"
  exit 1
fi

cat >/etc/caddy/Caddyfile <<EOF
${NOMINATIM_HOST} {
  encode gzip zstd
  reverse_proxy ${UPSTREAM}
}
EOF

systemctl enable caddy
systemctl restart caddy
systemctl status caddy --no-pager || true

echo "Listo. Comprobar: curl -sS https://${NOMINATIM_HOST}/search?q=Parana\\&format=json\\&limit=1 | head -c 400"
echo "Luego actualizar en Render: NOMINATIM_BASE_URL=https://${NOMINATIM_HOST}"
