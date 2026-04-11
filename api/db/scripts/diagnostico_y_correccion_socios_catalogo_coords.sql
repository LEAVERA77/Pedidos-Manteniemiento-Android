-- =============================================================================
-- Diagnóstico y corrección de coords en socios_catalogo (ej. NIS/medidor mal pin)
-- Ejecutar en Neon/psql con permisos UPDATE sobre socios_catalogo.
--
-- IMPORTANTE: en este proyecto las coords del catálogo suelen estar en
-- `latitud` y `longitud` (ver migraciones add_coords_to_socios_catalogo).
-- Si tu tabla también tiene `lat`/`lng`, el código Node usa COALESCE en consultas;
-- conviene actualizar el par principal (latitud/longitud).
--
-- Caso ejemplo: NIS 700000050 / medidor 65762 — coords erróneas tipo "Diagonal Comercio"
-- Coordenadas corregidas sugeridas (verificar en mapa antes):
--   latitud  -31.582125157969656
--   longitud -60.07226686136167
--   (Sarmiento 202, Cerrito, Entre Ríos)
--
-- made by leavera77
-- =============================================================================

-- --- Tarea 1: Diagnóstico ---
SELECT id, nis, medidor, nis_medidor,
       calle, numero, localidad, provincia,
       latitud, longitud,
       ubicacion_manual, fecha_actualizacion_coords,
       activo, cliente_id, tenant_id
FROM socios_catalogo
WHERE nis = '700000050' OR medidor = '65762'
ORDER BY id;

SELECT COUNT(*) AS filas, nis, medidor
FROM socios_catalogo
WHERE nis = '700000050' OR medidor = '65762'
GROUP BY nis, medidor;

-- Pedidos: columnas típicas cliente_calle, cliente_numero_puerta, cliente_localidad
SELECT id, numero_pedido, nis, medidor, cliente_calle, cliente_numero_puerta, cliente_localidad,
       lat, lng, fecha_creacion
FROM pedidos
WHERE nis = '700000050' OR medidor = '65762'
ORDER BY fecha_creacion DESC
LIMIT 10;

-- --- Tarea 2: Corrección (revisar WHERE antes de ejecutar) ---
-- Ajustá tolerancia si las coords en BD tienen más decimales.
/*
UPDATE socios_catalogo
SET
  latitud = -31.582125157969656,
  longitud = -60.07226686136167,
  fecha_actualizacion_coords = NOW(),
  ubicacion_manual = TRUE
WHERE (nis = '700000050' OR medidor = '65762')
  AND ABS(latitud - (-31.581131)) < 0.0005
  AND ABS(longitud - (-60.077763)) < 0.0005;

SELECT nis, medidor, calle, numero, localidad, latitud, longitud, ubicacion_manual, fecha_actualizacion_coords
FROM socios_catalogo
WHERE nis = '700000050' OR medidor = '65762';
*/

-- Post-corrección: re-geocodificar pedido desde panel (Re-geocodificar) o endpoint de regeo del proyecto.
