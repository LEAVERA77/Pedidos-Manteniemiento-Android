-- Ejecutar una vez en Neon (SQL Editor) para avisos admin → técnico en la app.
-- La app Android consulta esta cola y muestra notificaciones del sistema.

CREATE TABLE IF NOT EXISTS notificaciones_movil (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id       INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    titulo          TEXT NOT NULL,
    cuerpo          TEXT NOT NULL,
    leida           BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_movil_usuario_leida
    ON notificaciones_movil (usuario_id, leida)
    WHERE leida = FALSE;

COMMENT ON TABLE notificaciones_movil IS 'Cola de avisos para la app móvil (técnicos); el admin inserta desde el mapa o el detalle del pedido.';
