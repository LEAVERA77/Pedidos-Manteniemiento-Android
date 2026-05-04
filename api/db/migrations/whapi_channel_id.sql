-- Asociar canal Whapi (channel_id del webhook) al tenant en clientes.
-- made by leavera77

ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS whapi_channel_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_clientes_whapi_channel_id
ON clientes(whapi_channel_id);
