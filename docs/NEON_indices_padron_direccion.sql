-- Índices para acelerar búsquedas por calle + localidad en padrón (Neon).
-- Ejecutar una vez; ignora si faltan columnas (revisar nombre de tablas en tu esquema).
-- made by leavera77

CREATE INDEX IF NOT EXISTS idx_socios_catalogo_calle_loc_upper
  ON socios_catalogo (
    UPPER(TRIM(COALESCE(calle, ''))),
    UPPER(TRIM(COALESCE(localidad, '')))
  )
  WHERE COALESCE(activo, TRUE);

CREATE INDEX IF NOT EXISTS idx_clientes_finales_calle_loc_upper
  ON clientes_finales (
    UPPER(TRIM(COALESCE(calle, ''))),
    UPPER(TRIM(COALESCE(localidad, '')))
  )
  WHERE COALESCE(activo, TRUE);
