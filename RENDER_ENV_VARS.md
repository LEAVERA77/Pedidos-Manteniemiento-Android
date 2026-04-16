# Variables de entorno — Render (API GestorNova / Nexxo)

**Servicio típico:** `nexxo-api-418k.onrender.com` (ajustar si el nombre del servicio cambió).

## Migración Nominatim (Vultr → Oracle)

### Cambio obligatorio

| Variable            | Valor anterior (referencia)     | Valor nuevo                          |
|--------------------|----------------------------------|--------------------------------------|
| `NOMINATIM_BASE_URL` | `http://45.76.3.146:8080` (Vultr) | `http://167.234.235.76:8080` (Oracle) |

**Sin barra final** en la URL base (la API concatena `/search`, `/reverse`, etc.).

### Variables que suelen mantenerse (revisar en el dashboard)

- `NOMINATIM_WHATSAPP_SEARCH_MODE` — p. ej. `free-form` para el pipeline WhatsApp.
- `NOMINATIM_FETCH_TIMEOUT_MS` — timeout de fetch hacia Nominatim.
- `NOMINATIM_FROM_EMAIL` / `NOMINATIM_FROM` — **recomendado** en producción (contacto OSM). Si no están definidos, la API **no** envía `From` (un `From` con dominio `.local` u opcional mal validado delante del proxy puede causar **HTTP 406**).
- `NOMINATIM_ACCEPT` — opcional; por defecto `*/*`.
- `NOMINATIM_DISABLE_406_RETRY` — si `1`, no reintenta tras 406 con cabeceras mínimas (solo diagnóstico).
- `DEBUG_NOMINATIM` — solo desarrollo; en producción suele ir vacío o `0`.
- Resto de secretos Neon, Meta, JWT, etc. **no tocar** salvo checklist de migración.

## Cómo aplicar

1. **Render Dashboard** → Service → **Environment** → editar `NOMINATIM_BASE_URL`.
2. **Save** → se dispara **redeploy** automático (o usar **Manual Deploy**).

Alternativa CLI (si tenés `render` CLI y token):

```bash
# Ejemplo conceptual — ajustar service id y sintaxis oficial de Render CLI
# render services env set <service-id> NOMINATIM_BASE_URL=http://167.234.235.76:8080
```

## Tras HTTPS en Oracle (opcional)

Cuando tengas dominio + Caddy + Let's Encrypt (ver `ORACLE_HTTPS_SETUP.md`), actualizar a:

`NOMINATIM_BASE_URL=https://nominatim.tu-dominio.com`

y volver a **Save** + redeploy.

## Rollback (contingencia)

Volver temporalmente a:

`NOMINATIM_BASE_URL=http://45.76.3.146:8080`

solo si el VPS Vultr sigue activo y accesible; luego redeploy. Ver `MIGRATION_VULTR_TO_ORACLE.md` § Plan de contingencia.

---

`made by leavera77`
