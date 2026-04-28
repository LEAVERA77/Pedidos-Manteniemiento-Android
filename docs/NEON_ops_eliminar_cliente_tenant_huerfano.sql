-- =============================================================================
-- Operación Neon: eliminar un registro huérfano en `clientes` (tenant vacío)
--
-- Caso típico: el wizard de setup creó un `clientes.id` nuevo (p. ej. 19) y luego
-- la API reutilizó el tenant correcto (p. ej. 1) por nombre + tipo de negocio.
-- El id 19 puede quedar sin usuarios ni pedidos.
--
-- Antes de borrar: comprobá que no queden filas importantes con ese tenant_id.
--
-- made by leavera77
-- =============================================================================

-- Sustituí 19 en todas las consultas por el id huérfano a borrar.

-- Diagnóstico
SELECT 'usuarios' AS tabla, COUNT(*)::bigint AS filas FROM usuarios WHERE tenant_id = 19;
SELECT 'pedidos' AS tabla, COUNT(*)::bigint AS filas FROM pedidos WHERE tenant_id = 19;
SELECT 'socios_catalogo' AS tabla, COUNT(*)::bigint AS filas FROM socios_catalogo WHERE tenant_id = 19;
SELECT 'kpi_snapshots' AS tabla, COUNT(*)::bigint AS filas FROM kpi_snapshots WHERE tenant_id = 19;

-- Si todos los conteos son 0 (o aceptás perder esos datos), en una transacción:
BEGIN;
DELETE FROM clientes WHERE id = 19;
COMMIT;
-- Si falla por FK, revisá el error: puede haber tablas con tenant_id no listadas arriba.
