# Cooperativa eléctrica: `distribuidores` vs Red Eléctrica

## Resumen operativo

| Uso en pantalla | Tabla Neon | ¿Sigue activo en coop. eléctrica? |
|-----------------|------------|----------------------------------|
| **Red Eléctrica** (import Excel, trafos, KVA, clientes) | `distribuidores_red` | **Sí — fuente principal** |
| Select **Dist.** en pedido nuevo (`#di2`) | `distribuidores_red` (fallback `distribuidores` si vacío) | Red primero |
| **SAIDI / SAIFI** (estadísticas) | `distribuidores_red` vía `GET /api/estadisticas/datos-red` | **Sí** |
| Pestaña admin **Distribuidores** | `distribuidores` | **Oculta** (misma política que `ocultar_modulos_redes`) |
| Pestaña **Métricas SAIDI/SAIFI** (Excel legacy) | escribe en `distribuidores` | **Oculta** con la pestaña Distribuidores |
| **Clientes afectados** / cierre por trafo | `infra_transformadores` → FK `distribuidores.id` | Tabla `distribuidores` aún referenciada |
| Padrón → código distribuidor por trafo | JOIN `infra_transformadores` + `distribuidores` | Legacy; no usa `distribuidores_red` |

Módulo de visibilidad: `app/src/main/assets/modules/admin-tab-distribuidores-policy.js`.

## ¿Conviene eliminar la tabla `distribuidores` del esquema?

**No a nivel global**, por ahora:

1. **Cooperativa de agua** y flujos sin Red Eléctrica siguen usando `distribuidores` (ramales).
2. **FK** de `infra_transformadores.distribuidor_id` y rutas `api/routes/infraAfectados.js` / `padron-distribuidor-resolver.js`.
3. **Fallback** del select `#di2` si `distribuidores_red` está vacío.

### Qué sí se puede hacer por tenant coop. eléctrica

- Dejar de cargar datos nuevos en `distribuidores` (solo Red Eléctrica).
- Ocultar pestañas admin que escriben ahí (ya aplicado en front).
- Opcional en Neon: `DELETE FROM distribuidores WHERE tenant_id = <id>` si migraste todo a `distribuidores_red` y no usás clientes afectados por trafo.

### Datos por tenant

- **`distribuidores_red`**: operación diaria (pedidos, métricas).
- **`distribuidores`**: legado + infra/padrón; no hace falta mantenerla al día si no usás esos módulos.

## Archivos clave

| Área | Ruta |
|------|------|
| Select pedido | `modules/pedido-di2-distribuidores.js` |
| Red Eléctrica API | `api/routes/redElectricaInfra.js`, `api/services/distribuidoresRedElectricaExcelMerge.js` |
| Catálogo legacy API | `api/routes/distribuidores.js` |
| SAIDI stats | `api/routes/estadisticas.js` → `distribuidores_red` |
| Infra / afectados | `api/routes/infraAfectados.js`, `app.js` (`llenarCatalogosCierreAfectados`) |

made by leavera77
