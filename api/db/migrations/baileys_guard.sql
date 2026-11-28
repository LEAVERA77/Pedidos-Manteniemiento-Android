-- Borrador no desplegado. HMAC de identificadores; no guarda texto ni teléfonos en claro.
CREATE TABLE IF NOT EXISTS baileys_guard_contacts (
 tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
 contact_hmac BYTEA NOT NULL, last_message_at TIMESTAMPTZ NOT NULL,
 repeat_hmac BYTEA, repeat_started_at TIMESTAMPTZ, repeat_count INTEGER NOT NULL DEFAULT 0,
 muted_until TIMESTAMPTZ, PRIMARY KEY (tenant_id,contact_hmac)
);
CREATE INDEX IF NOT EXISTS baileys_guard_contacts_recent ON baileys_guard_contacts(tenant_id,last_message_at);
CREATE TABLE IF NOT EXISTS baileys_guard_inbound_ids (
 tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
 message_hmac BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,message_hmac)
);
CREATE INDEX IF NOT EXISTS baileys_guard_inbound_age ON baileys_guard_inbound_ids(created_at);
CREATE TABLE IF NOT EXISTS baileys_guard_limits (
 tenant_id INTEGER PRIMARY KEY REFERENCES clientes(id) ON DELETE RESTRICT,
 next_attempt_at TIMESTAMPTZ
);
-- Si la tabla se creó en un ensayo anterior, conservar datos y agregar el campo.
ALTER TABLE baileys_guard_limits ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS baileys_guard_attempts (
 tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
 attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baileys_guard_attempts_recent ON baileys_guard_attempts(tenant_id,attempted_at);
REVOKE ALL ON baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts FROM authenticated;
 END IF;
END $$;
