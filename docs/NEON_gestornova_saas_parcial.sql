-- =============================================================
-- GestorNova — extensión SaaS / WhatsApp / Excel (fase parcial)
-- Ejecutar en Neon cuando quieras preparar bot + import sin
-- migrar aún todo el front a multitenant.
-- Compatible con mono-tenant: pedidos.tenant_id DEFAULT 1.
-- =============================================================

BEGIN;

-- Perfiles de importación Excel (mapeo definido desde la web)
CREATE TABLE IF NOT EXISTS import_excel_profiles (
    id              SERIAL PRIMARY KEY,
    nombre          TEXT NOT NULL DEFAULT 'default',
    -- socios_catalogo | usuarios | distribuidores (ampliar según necesidad)
    tipo_mapeo      VARCHAR(40) NOT NULL CHECK (tipo_mapeo IN ('socios','usuarios','distribuidores')),
    -- JSON: { "columnaExcelOIndice": "campo_destino", ... }
    columnas        JSONB NOT NULL DEFAULT '{}'::jsonb,
    opciones        JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_excel_profiles_tipo ON import_excel_profiles (tipo_mapeo, activo);

-- Cola saliente hacia Evolution / Z-API (procesada por worker Node o cron)
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id              BIGSERIAL PRIMARY KEY,
    telefono_e164   VARCHAR(24) NOT NULL,
    cuerpo          TEXT NOT NULL,
    pedido_id       INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    motivo          VARCHAR(50),
    estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_estado ON whatsapp_outbox (estado, created_at);

-- Sesión conversacional del bot (menú / pasos)
CREATE TABLE IF NOT EXISTS whatsapp_bot_sessions (
    telefono_e164   VARCHAR(24) PRIMARY KEY,
    estado_maquina  VARCHAR(40) NOT NULL DEFAULT 'menu',
    contexto        JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mono-tenant → multitenant gradual (todas las filas existentes = 1)
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

-- Origen del reclamo (web, whatsapp, etc.)
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS origen_reclamo VARCHAR(30) NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON pedidos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios (tenant_id);

COMMENT ON COLUMN pedidos.tenant_id IS 'Futuro FK a clientes(id); por ahora 1 = instalación única.';
COMMENT ON COLUMN pedidos.origen_reclamo IS 'web | whatsapp | api | ...';
COMMENT ON TABLE import_excel_profiles IS 'Mapeo columnas Excel → campos internos, editable desde admin web.';

COMMIT;
