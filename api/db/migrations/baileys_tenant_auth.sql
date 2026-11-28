-- Borrador: NO aplicar en producción hasta revisar privilegios y migración de la sesión global.
-- Cifrado de aplicación: la clave no se guarda en PostgreSQL. La llave primaria
-- evita compartir categorías/llaves entre tenants; el propietario aún puede borrar o alterar filas.
CREATE TABLE IF NOT EXISTS baileys_tenant_auth (
    tenant_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    category TEXT NOT NULL,
    key_id TEXT NOT NULL,
    nonce BYTEA NOT NULL CHECK (octet_length(nonce)=12),
    ciphertext BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag)=16),
    content_mac BYTEA NOT NULL CHECK (octet_length(content_mac)=32),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id,category,key_id)
);
REVOKE ALL ON TABLE baileys_tenant_auth FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE baileys_tenant_auth FROM authenticated;
  END IF;
END $$;
