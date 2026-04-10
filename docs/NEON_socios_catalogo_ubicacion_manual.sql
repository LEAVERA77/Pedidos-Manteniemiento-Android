-- ══════════════════════════════════════════════════════════════════════════════
-- GestorNova — Blindaje de coordenadas en socios_catalogo
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Añade columna `ubicacion_manual` para proteger coordenadas corregidas manualmente
-- o enriquecidas automáticamente desde pedidos.
--
-- Propósito:
-- - Marcar coordenadas que NO deben sobrescribirse al importar nuevos Excel
-- - Preservar correcciones manuales del administrador desde el mapa
-- - Proteger enriquecimientos automáticos desde reclamos con GPS confiable
--
-- made by leavera77
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Añadir columna para marcar ubicación manual/protegida
ALTER TABLE socios_catalogo
ADD COLUMN IF NOT EXISTS ubicacion_manual BOOLEAN DEFAULT FALSE;

-- 2. Crear índice para optimizar consultas de importación
CREATE INDEX IF NOT EXISTS idx_socios_catalogo_ubicacion_manual
ON socios_catalogo (ubicacion_manual)
WHERE ubicacion_manual = TRUE;

-- 3. Comentario descriptivo
COMMENT ON COLUMN socios_catalogo.ubicacion_manual IS 
'TRUE: coordenadas fijadas manualmente o por enriquecimiento automático; no sobrescribir al importar Excel';

-- ══════════════════════════════════════════════════════════════════════════════
-- Uso:
-- ══════════════════════════════════════════════════════════════════════════════
--
-- La columna se marca automáticamente como TRUE cuando:
-- 1. Admin corrige posición de un pedido en el mapa (sync desde API)
-- 2. Sistema enriquece desde reclamo WhatsApp con GPS confiable
--
-- Al importar Excel de socios:
-- - Si `ubicacion_manual = TRUE`, mantiene coords actuales (no sobrescribe)
-- - Si `ubicacion_manual = FALSE` o NULL, puede actualizar si vienen del Excel
--
-- Al vaciar catálogo ("Reemplazar"):
-- - Preserva filas con `ubicacion_manual = TRUE` o con coords válidas
--
-- ══════════════════════════════════════════════════════════════════════════════
