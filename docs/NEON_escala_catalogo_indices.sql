-- Índices para catálogos grandes (50k+ filas): búsqueda por NIS/medidor y aislamiento por tenant.
-- Ejecutar en Neon una vez (idempotente).

-- socios_catalogo: búsqueda por identificador (ya existe UNIQUE(nis_medidor) en instalaciones típicas).
CREATE INDEX IF NOT EXISTS idx_socios_nis_medidor_upper
  ON socios_catalogo (UPPER(TRIM(nis_medidor)));

CREATE INDEX IF NOT EXISTS idx_socios_medidor_like
  ON socios_catalogo (nis_medidor)
  WHERE nis_medidor IS NOT NULL AND TRIM(nis_medidor) <> '';

-- Si la tabla tiene tenant_id (multitenant):
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'tenant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_socios_tenant_id ON socios_catalogo (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_socios_tenant_nis ON socios_catalogo (tenant_id, nis_medidor);
  END IF;
END $$;

-- clientes_finales: filtro por tenant y cruce NIS / medidor
CREATE INDEX IF NOT EXISTS idx_cf_cliente_id ON clientes_finales (cliente_id);

CREATE INDEX IF NOT EXISTS idx_cf_nis ON clientes_finales (cliente_id, nis)
  WHERE nis IS NOT NULL AND TRIM(nis::text) <> '';

CREATE INDEX IF NOT EXISTS idx_cf_medidor ON clientes_finales (cliente_id, medidor)
  WHERE medidor IS NOT NULL AND TRIM(medidor::text) <> '';

COMMENT ON INDEX idx_socios_nis_medidor_upper IS 'Escala: acelera match por NIS/medidor en import y WhatsApp.';
