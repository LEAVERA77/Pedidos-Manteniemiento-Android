# Oleada 4 — Checklist setup y export auditoría

## Contraseña (ojo visible)

- Campos admin `pw-actual`, `pw-nueva`, `pw-confirmar` y **Mi cuenta** usan el mismo contenedor `.ig` que el login.
- `modules/password-visibility-toggle.js` refresca al abrir pestaña Contraseña o modal Mi cuenta.

## API

| Ruta | Descripción |
|------|-------------|
| `GET /api/admin/setup-checklist` | Ítems de configuración del tenant (% completado) |

## Front

| Módulo | Función |
|--------|---------|
| `gn-admin-setup-checklist-ui.js` | Tarjeta en Admin → Empresa |
| `gn-export-audit-csv.js` | Botón CSV en Estadísticas → auditoría |
| `gn-oleada4-bootstrap.js` | Arranque oleada 4 |

SW **v235** / **1.8.64**.

made by leavera77
