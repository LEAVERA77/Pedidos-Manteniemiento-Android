-- GestorNova / Nexxo — Tablas para Top 3 operativas (sin ALTER obligatorio a pedidos).
-- Ejecutar en Neon (SQL Editor) tras backup.
-- Orden sugerido de producto: 1) geocercas  2) chat interno  3) fotos clasificadas

-- ---------------------------------------------------------------------------
-- 1) Geocercas — configuración por tenant + log de intentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_geocerca_settings (
  tenant_id INTEGER PRIMARY KEY REFERENCES clientes (id) ON DELETE CASCADE,
  habilitada BOOLEAN NOT NULL DEFAULT TRUE,
  radio_metros INTEGER NOT NULL DEFAULT 100 CHECK (radio_metros >= 10 AND radio_metros <= 5000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_geocerca_evento (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pedido_id INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  lat_tecnico DOUBLE PRECISION NOT NULL,
  lng_tecnico DOUBLE PRECISION NOT NULL,
  lat_pedido DOUBLE PRECISION,
  lng_pedido DOUBLE PRECISION,
  distancia_metros DOUBLE PRECISION NOT NULL,
  permitido BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocerca_evt_pedido ON pedido_geocerca_evento (pedido_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geocerca_evt_tenant ON pedido_geocerca_evento (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Chat interno por reclamo (Neon única; no WhatsApp)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_chat_mensaje (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pedido_id INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  autor_usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cuerpo TEXT NOT NULL CHECK (length(trim(cuerpo)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_chat_pedido ON pedido_chat_mensaje (pedido_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pedido_chat_tenant ON pedido_chat_mensaje (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Fotos múltiples clasificadas (antes / después) — URLs Cloudinary
--    La app puede seguir usando pedidos.foto_urls con "||"; esta tabla da orden/tipo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_foto_clasificada (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pedido_id INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  tipo VARCHAR(16) NOT NULL CHECK (tipo IN ('antes', 'despues', 'otro')),
  orden SMALLINT NOT NULL DEFAULT 0 CHECK (orden >= 0 AND orden < 50),
  url_cloudinary TEXT NOT NULL CHECK (length(trim(url_cloudinary)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pedido_id, tipo, orden)
);

CREATE INDEX IF NOT EXISTS idx_pedido_foto_clas_pedido ON pedido_foto_clasificada (pedido_id, tipo, orden);

-- Config inicial (ejemplo; usá el id real de clientes / tenant):
-- INSERT INTO tenant_geocerca_settings (tenant_id, habilitada, radio_metros)
-- VALUES (1, TRUE, 100) ON CONFLICT (tenant_id) DO NOTHING;
