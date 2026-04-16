-- =============================================================================
-- Limpieza / auditoría: referencias al Nominatim en Vultr (45.76.3.146)
-- Ejecutar en Neon (SQL Editor) con permisos de lectura/escritura según el paso.
-- NO ejecutar DELETE sin backup y revisión humana.
-- =============================================================================

-- 1) Geometrías que guardan URL apuntando al host antiguo
SELECT id, geometria_url, creado_en
FROM calles_geometrias
WHERE geometria_url IS NOT NULL
  AND geometria_url LIKE '%45.76.3.146%';

-- 2) Comentarios de correcciones que mencionan Vultr o la IP vieja
SELECT id, comentario, creado_en
FROM correcciones_direcciones
WHERE comentario IS NOT NULL
  AND (
    comentario ILIKE '%Vultr%'
    OR comentario LIKE '%45.76.3.146%'
  );

-- 3) (Opcional) Otras tablas con texto libre — ajustar si existen columnas similares
-- SELECT ... FROM empresa_config WHERE valor LIKE '%45.76.3.146%';

-- =============================================================================
-- ACCIÓN DESTRUCTIVA — SOLO TRAS BACKUP Y CONFIRMACIÓN EXPLÍCITA
-- Descomentar y ejecutar solo si se decide invalidar caché ligada al VPS viejo:
-- =============================================================================
-- BEGIN;
-- DELETE FROM calles_geometrias
-- WHERE geometria_url LIKE '%45.76.3.146%';
-- -- Revisar filas afectadas antes de COMMIT;
-- COMMIT;

-- Nota: las filas en `correcciones_direcciones` suelen ser histórico operativo;
-- borrar comentarios por texto no suele ser necesario; preferir dejar auditoría.
