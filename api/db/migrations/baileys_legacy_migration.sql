-- Borrador experimental. Impide importar una sesión legada a dos tenants.
-- No impide que un proceso legado siga usando la cuenta: requiere parada supervisada.
CREATE TABLE IF NOT EXISTS baileys_legacy_imports (
 legacy_session_id TEXT PRIMARY KEY,
 tenant_id INTEGER NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE RESTRICT,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE baileys_legacy_imports FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE baileys_legacy_imports FROM authenticated;
 END IF;
END $$;
