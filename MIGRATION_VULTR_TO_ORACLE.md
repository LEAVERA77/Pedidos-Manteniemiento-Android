# Migración Nominatim: Vultr → Oracle Cloud

**Documento maestro — migración de infraestructura de geocodificación (Nominatim).**  
**Repo:** `Pedidos-Manteniemiento-Android` (carpeta de trabajo local `Nexxo`).

## Resumen ejecutivo

| Ítem | Anterior (Vultr) | Nuevo (Oracle) |
|------|------------------|------------------|
| IP / servicio | `45.76.3.146:8080` | `167.234.235.76:8080` |
| HTTPS | No (HTTP directo) | Opcional: Caddy + dominio (ver `ORACLE_HTTPS_SETUP.md`) |
| Costo referencia | ~USD 55/mes | Always Free (según shape/cuenta Oracle) |

**API Render:** `https://nexxo-api-418k.onrender.com`  
**Variable clave:** `NOMINATIM_BASE_URL` → ver `RENDER_ENV_VARS.md`.

**Neon:** tablas `calles_geometrias`, `correcciones_direcciones`, `localidades_argentinas`, etc. — auditoría de URLs viejas en `scripts/migration/cleanup_vultr_references.sql`.

## Fechas

| Hito | Fecha |
|------|--------|
| Documentación inicial en repo | 2026-04-16 |

*(Completar fechas de corte de Vultr y activación Oracle al cerrar la migración.)*

## Pasos ejecutados (checklist)

- [ ] Verificación HTTP search/reverse contra Oracle — ver `MIGRATION_VERIFICATION.md` (desde red del operador / VM).
- [ ] `NOMINATIM_BASE_URL` actualizada en Render + redeploy — `RENDER_ENV_VARS.md`.
- [ ] Consultas de auditoría Neon ejecutadas; DELETE solo si hay plan de backup — `scripts/migration/cleanup_vultr_references.sql`.
- [ ] (Opcional) HTTPS con Caddy — `ORACLE_HTTPS_SETUP.md` + `scripts/oracle/setup_https_caddy.sh`.
- [ ] Cancelación Vultr — `VULTR_CANCELLATION_GUIDE.md`.

## Comandos útiles (operador)

```bash
# Desde PC o VM con acceso al host Oracle
curl -sS "http://167.234.235.76:8080/search?q=Parana&format=json&limit=1" | head -c 600
curl -sS "http://167.234.235.76:8080/reverse?lat=-31.58&lon=-60.08&format=json" | head -c 600
```

## Enlaces

- **GitHub Pages (panel):** https://leavera77.github.io/Pedidos-MG  
- **Render API:** https://nexxo-api-418k.onrender.com  
- **Neon:** consola del proyecto (no publicar credenciales en el repo).

## Plan de contingencia (rollback)

1. En Render, restaurar `NOMINATIM_BASE_URL=http://45.76.3.146:8080` **solo si el VPS Vultr sigue levantado y accesible**.
2. Redeploy del servicio API.
3. Validar `/api/debug/...` o flujo de geocodificación según entorno.

**Advertencia:** si Vultr ya fue apagado, el rollback a esa IP no funcionará.

## Post-migración (verificación)

- [ ] Búsqueda de dirección en panel / WhatsApp devuelve coordenadas esperadas.
- [ ] Sin picos de 502/timeout en Render (logs).
- [ ] Nominatim Oracle estable (CPU/RAM en OCI Monitoring).

---

`made by leavera77`
