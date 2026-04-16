# HTTPS en Oracle Cloud — Nominatim detrás de Caddy

## Objetivo

Exponer Nominatim con **HTTPS** (Let's Encrypt) usando **Caddy** como proxy reverso hacia el backend actual (`127.0.0.1:8080` si Docker publica ahí; ajustar si tu compose usa otro puerto).

## Prerrequisitos

1. **Dominio** con registro **A** apuntando a la IP pública de la VM Oracle (ej. `167.234.235.76`).
2. **Security lists / NSG**: abrir **80/tcp** y **443/tcp** desde Internet hacia la VM (Caddy hace el challenge HTTP-01 de Let's Encrypt).
3. Nominatim respondiendo en HTTP en el upstream local (probar con `curl` desde la VM).

## Instalación rápida

En la VM (Ubuntu/Debian):

```bash
export NOMINATIM_HOST=nominatim.tudominio.com
sudo -E bash scripts/oracle/setup_https_caddy.sh
```

El script instala Caddy, escribe `/etc/caddy/Caddyfile` y reinicia el servicio.

**Importante:** el script vive en el repo en `scripts/oracle/setup_https_caddy.sh`; copialo a la VM o cloná el repo allí.

## Verificación

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "https://nominatim.tudominio.com/search?q=Parana&format=json&limit=1"
```

Esperado: `200`.

## Render

Actualizar:

`NOMINATIM_BASE_URL=https://nominatim.tudominio.com`

(sin barra final) y **redeploy** la API en Render. Ver `RENDER_ENV_VARS.md`.

## Firewall Oracle

Si el 443 no llega, revisar:

- VCN → Security List → Ingress 0.0.0.0/0 → TCP 443 (y 80).
- `iptables` / `ufw` en la VM si está activo.

## Referencias

- [Caddy — reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Let's Encrypt — HTTP-01](https://letsencrypt.org/docs/challenge-types/#http-01-challenge)

---

`made by leavera77`
