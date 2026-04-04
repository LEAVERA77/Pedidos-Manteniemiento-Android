-- Tabla genérica de configuración (clave → JSON). Usada p. ej. para ubicación central por tenant.
-- La API crea la tabla si no existe (ensureConfiguracionTable); este script es opcional para Neon manual.

CREATE TABLE IF NOT EXISTS configuracion (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE configuracion IS 'Pares key/value JSON; ubicación central: key ubicacion_central_tenant_<id>';
