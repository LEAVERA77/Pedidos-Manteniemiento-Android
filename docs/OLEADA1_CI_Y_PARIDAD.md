# Oleada 1 — CI, smoke E2E y paridad de repos

Implementación cuidadosa de mantenimiento y confiabilidad (sin cambiar arquitectura Pages + Render + Android).

## Qué incluye

| Pieza | Ubicación | Qué hace |
|-------|-----------|----------|
| **CI unificado** | `.github/workflows/ci-oleada1.yml` | En cada push/PR a `main`: tests API, sintaxis JS assets, E2E shell, paridad con Pedidos-MG |
| **API smoke** | `api/tests/smoke.test.js` | Vitest + Supertest (`/health`, `/health/db`) |
| **Sintaxis front** | `scripts/check-frontend-syntax.mjs` | `node --check` en todos los `.js` bajo `app/src/main/assets/` |
| **E2E mínimo** | `e2e/tests/smoke-shell.spec.mjs` | Playwright: login visible, `#dm` en DOM, `status.html`, sin 404 en JS/CSS |
| **Paridad repos** | `scripts/verify-paridad-pedidos-mg.ps1` | Compara SHA256 Nexxo assets ↔ Pedidos-MG |
| **Sync** | `scripts/sync-assets-to-pedidos-mg.ps1` | Copia assets a Pedidos-MG (manual o `-AutoFix` en verify) |
| **Refactor mínimo** | `modules/gn-window-dialogs-patch.js` | `alert`/`confirm` con `gnDice` fuera de `app.js` |
| **Estado servicio** | `status.html` | `/health` y `/health/db` vía `config.json` |

## Comandos locales

```powershell
# Desde la raíz de Nexxo
cd api
npm ci
npm test

cd ..
node scripts/check-frontend-syntax.mjs

cd e2e
npm ci
npx playwright install chromium
npm test

cd ..
.\scripts\verify-paridad-pedidos-mg.ps1
.\scripts\sync-assets-to-pedidos-mg.ps1   # si hay diferencias
```

## Flujo recomendado antes de publicar

1. Cambios en `app/src/main/assets/` o `api/` en **Nexxo**.
2. `node scripts/check-frontend-syntax.mjs` y `cd api && npm test`.
3. `.\scripts\sync-assets-to-pedidos-mg.ps1`
4. `.\scripts\verify-paridad-pedidos-mg.ps1` → debe salir **Paridad OK**.
5. Commit + push **Nexxo**, luego commit + push **Pedidos-MG**.

## CI en GitHub

- **Pedidos-Manteniemiento-Android:** workflow `CI Oleada 1` en push/PR.
- Job **paridad-pedidos-mg:** clona `LEAVERA77/Pedidos-MG` y falla si los hashes no coinciden (obliga a sincronizar tras cambiar assets en Nexxo).
- **Pedidos-MG:** conviene copiar el mismo workflow o al menos mantener `api-ci.yml` + deploy Pages; tras sync desde Nexxo, el job de paridad en Android repo valida coherencia.

## E2E y login real

Los tests E2E **no** hacen login contra Neon (no hay secretos en CI). Cubren:

- Carga del HTML/JS del panel.
- Presencia de `#ls`, formulario de login, contenedor `#dm` del detalle.
- Página `status.html`.

Pruebas con usuario real: manual en emulador o futuro job con secretos en GitHub Actions (oleada 2).

## Relación con otros docs

- Operación diaria: `docs/RUNBOOK_OPERACION.md`
- Nominatim / Oracle: `docs/NOMINATIM_ORACLE_CLOUD.md`
- Roadmap oleadas 2–3: ver conversación de mejoras / `docs/presentacion/GestorNova-Documentacion-Tecnica-Outlier.md`

*made by leavera77*
