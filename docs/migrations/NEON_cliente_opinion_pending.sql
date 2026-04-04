-- Ventana post-cierre: el vecino puede responder con texto libre por WhatsApp.
-- Antes vivía solo en memoria del proceso Node (se perdía al reiniciar Render).
-- Ejecutar una vez en Neon (SQL Editor o psql) si la API no tiene permiso CREATE.

CREATE TABLE IF NOT EXISTS cliente_opinion_pending (
    tenant_id         INTEGER NOT NULL,
    phone_canonical   VARCHAR(40) NOT NULL,
    pedido_id         INTEGER NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, phone_canonical)
);

CREATE INDEX IF NOT EXISTS idx_cliente_opinion_pending_expires
    ON cliente_opinion_pending (expires_at);

-- Limpieza opcional (cron o manual):
-- DELETE FROM cliente_opinion_pending WHERE expires_at < NOW() - INTERVAL '1 day';
