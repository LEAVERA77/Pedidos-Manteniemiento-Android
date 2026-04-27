-- Contador de pedidos por tenant y año (aislamiento #AÑO-NNNN).
-- Ejecutar en Neon cuando la API ya soporte la columna (deploy coordinado).
-- Idempotente: si ya existe tenant_id en pedido_contador, no hace nada destructivo.

BEGIN;

DO $$
DECLARE
  has_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedido_contador' AND column_name = 'tenant_id'
  ) INTO has_tenant;

  IF has_tenant THEN
    RETURN;
  END IF;

  CREATE TABLE pedido_contador_mg_new (
    tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    anio INTEGER NOT NULL,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, anio)
  );

  INSERT INTO pedido_contador_mg_new (tenant_id, anio, ultimo_numero)
  SELECT x.tenant_id, x.anio, MAX(x.seq)::int
  FROM (
    SELECT
      p.tenant_id,
      CASE
        WHEN p.numero_pedido::text ~ '^[0-9]{4}-' THEN split_part(p.numero_pedido::text, '-', 1)::int
        WHEN lower(p.numero_pedido::text) ~ '^pm-' THEN split_part(lower(p.numero_pedido::text), '-', 2)::int
        ELSE EXTRACT(YEAR FROM COALESCE(p.fecha_creacion, NOW()))::int
      END AS anio,
      CASE
        WHEN p.numero_pedido::text ~ '^[0-9]{4}-[0-9]+' THEN split_part(p.numero_pedido::text, '-', 2)::int
        WHEN lower(p.numero_pedido::text) ~ '^pm-[0-9]{4}-[0-9]+' THEN split_part(lower(p.numero_pedido::text), '-', 3)::int
        ELSE 0
      END AS seq
    FROM pedidos p
    WHERE p.tenant_id IS NOT NULL
      AND p.numero_pedido IS NOT NULL
      AND TRIM(p.numero_pedido::text) <> ''
  ) x
  WHERE x.anio BETWEEN 2000 AND 2100 AND x.seq > 0
  GROUP BY x.tenant_id, x.anio;

  DROP TABLE IF EXISTS pedido_contador;
  ALTER TABLE pedido_contador_mg_new RENAME TO pedido_contador;

  CREATE INDEX IF NOT EXISTS idx_pedido_contador_anio ON pedido_contador (anio);
END $$;

COMMIT;
