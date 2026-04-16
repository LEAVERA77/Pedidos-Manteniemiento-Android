-- Chatbot opción 11 + recordatorios + avisos comunitarios.
-- made by leavera77

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS identificador VARCHAR(100);

CREATE TABLE IF NOT EXISTS recordatorios_reclamos (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  business_type VARCHAR(50),
  telefono_usuario VARCHAR(20),
  identificador VARCHAR(100),
  fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
  enviado BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pedidos_busqueda_reclamo
  ON pedidos (tenant_id, business_type, identificador, estado);

CREATE TABLE IF NOT EXISTS avisos_comunitarios (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  business_type VARCHAR(50),
  tipo_aviso VARCHAR(50),
  fenomeno VARCHAR(100),
  ciudad VARCHAR(100),
  provincia VARCHAR(100),
  calles TEXT[],
  zonas TEXT[],
  texto_libre TEXT,
  areas TEXT[],
  telefonos TEXT[],
  corte_programado JSONB,
  enviado_por INTEGER REFERENCES usuarios(id),
  fecha_envio TIMESTAMPTZ DEFAULT NOW(),
  destinatarios_count INTEGER
);
