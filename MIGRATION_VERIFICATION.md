# Verificación Nominatim — Oracle Cloud (`167.234.235.76:8080`)

**Fecha de documentación:** 2026-04-16  
**Entorno de verificación automática:** agente CI/red Cursor (no es la VM ni la red del usuario).

## Re-verificación (2026-04-15)

Desde el mismo entorno, `curl.exe` a `167.234.235.76:8080` volvió a fallar con **exit 28** (timeout / no conexión TCP en ~21 s) para search y reverse — coherente con firewall/red no alcanzable desde fuera de Oracle.

## Resultado automático

Desde el entorno de build del asistente, las peticiones HTTP a:

- `http://167.234.235.76:8080/search?q=Parana&format=json&limit=1`
- `http://167.234.235.76:8080/reverse?lat=-31.58&lon=-60.08&format=json`

**finalizaron en timeout (~20 s)** — no se pudo confirmar aquí el código HTTP ni el cuerpo JSON.

Motivos típicos:

- **Security lists / firewall** en Oracle Cloud: solo IPs whitelist o solo red interna/VPN.
- El servicio escucha solo en **localhost** del contenedor y el **puerto público** no está expuesto como se espera.
- Restricción de red del entorno que ejecuta la prueba (no alcanza la IP pública).

## Comandos para verificar (operador — ejecutar en su PC o en la VM)

Desde una máquina que deba usar la API (misma red que Render si aplica políticas de IP):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "http://167.234.235.76:8080/search?q=Parana&format=json&limit=1"
curl -sS "http://167.234.235.76:8080/search?q=Parana&format=json&limit=1" | head -c 500
curl -sS "http://167.234.235.76:8080/reverse?lat=-31.58&lon=-60.08&format=json" | head -c 500
```

**Esperado:** HTTP `200` y JSON con `place_id` / `display_name` (search) o dirección (reverse).

## Verificación desde Render (post-deploy)

Tras definir `NOMINATIM_BASE_URL=http://167.234.235.76:8080` y redeploy:

- Llamar a un endpoint de diagnóstico de la API si está habilitado (p. ej. rutas bajo `/api/debug/` según `ALLOW_DEBUG_NOMINATIM` y política de seguridad).
- Probar flujo real de geocodificación en staging antes de producción.

## Registro

| Paso                         | Estado desde CI | Pendiente operador |
|-----------------------------|-----------------|--------------------|
| Search Paraná               | Timeout         | ☐                  |
| Reverse -31.58 / -60.08     | Timeout         | ☐                  |
| Render apunta a nueva URL   | N/A             | Ver `RENDER_ENV_VARS.md` |

---

*Documentación generada para la migración Vultr → Oracle. Repo local: `Pedidos-Manteniemiento-Android` (carpeta Nexxo).*
