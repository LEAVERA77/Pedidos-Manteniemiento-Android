-- Solo tokens FCM; sin cambiar otras tablas de reportes.
CREATE TABLE IF NOT EXISTS usuario_fcm_token (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id INT,
  fcm_token TEXT NOT NULL,
  plataforma TEXT DEFAULT 'android',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (usuario_id, fcm_token)
);
CREATE INDEX IF NOT EXISTS idx_usuario_fcm_token_usuario ON usuario_fcm_token(usuario_id);
