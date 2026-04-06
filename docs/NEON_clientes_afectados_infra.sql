-- Clientes afectados (SAIDI/SAIFI): catálogos + registro por reclamo.
-- Ejecutar en Neon (SQL Editor). Multitenant: tenant_id alineado con pedidos/usuarios (INTEGER, típico default 1).

CREATE TABLE IF NOT EXISTS infra_transformadores (
    id                      SERIAL PRIMARY KEY,
    tenant_id               INTEGER NOT NULL DEFAULT 1,
    codigo                  VARCHAR(50) NOT NULL,
    nombre                  VARCHAR(200),
    capacidad_kva           INTEGER,
    clientes_conectados     INTEGER NOT NULL DEFAULT 0,
    barrio_texto            VARCHAR(200),
    latitud                 DOUBLE PRECISION,
    longitud                DOUBLE PRECISION,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_infra_trafo_tenant ON infra_transformadores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_infra_trafo_activo ON infra_transformadores (tenant_id, activo);

CREATE TABLE IF NOT EXISTS infra_zonas_clientes (
    id                      SERIAL PRIMARY KEY,
    tenant_id               INTEGER NOT NULL DEFAULT 1,
    nombre                  VARCHAR(200) NOT NULL,
    clientes_estimados      INTEGER NOT NULL DEFAULT 0,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_infra_zona_tenant ON infra_zonas_clientes (tenant_id);

CREATE TABLE IF NOT EXISTS clientes_afectados_log (
    id                      SERIAL PRIMARY KEY,
    pedido_id               INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
    tenant_id               INTEGER NOT NULL DEFAULT 1,
    metodo                  VARCHAR(20) NOT NULL,
    transformador_id        INTEGER REFERENCES infra_transformadores (id),
    zona_id                 INTEGER REFERENCES infra_zonas_clientes (id),
    medidor_desde           VARCHAR(50),
    medidor_hasta           VARCHAR(50),
    cantidad_clientes       INTEGER NOT NULL,
    es_estimado             BOOLEAN NOT NULL DEFAULT FALSE,
    usuario_id              INTEGER REFERENCES usuarios (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_metodo_afect CHECK (metodo IN ('transformador', 'zona', 'rango', 'manual')),
    CONSTRAINT chk_cantidad_pos CHECK (cantidad_clientes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_caf_log_pedido ON clientes_afectados_log (pedido_id);
CREATE INDEX IF NOT EXISTS idx_caf_log_tenant ON clientes_afectados_log (tenant_id, created_at DESC);

COMMENT ON TABLE infra_transformadores IS 'Catálogo de transformadores; clientes_conectados para registrar afectación en un toque.';
COMMENT ON TABLE infra_zonas_clientes IS 'Zonas/barrios con clientes estimados para afectación masiva.';
COMMENT ON TABLE clientes_afectados_log IS 'Registro de cuántos clientes quedaron sin servicio por reclamo (base SAIDI/SAIFI).';
