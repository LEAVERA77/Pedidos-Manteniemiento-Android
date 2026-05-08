-- Extensión unaccent: normalizar tildes en nombres del padrón (socios_catalogo) para Levenshtein en el bot WhatsApp.
-- Complementa fuzzystrmatch (levenshtein). Ejecutar en Neon/psql con permisos CREATE.
-- made by leavera77

CREATE EXTENSION IF NOT EXISTS unaccent;
