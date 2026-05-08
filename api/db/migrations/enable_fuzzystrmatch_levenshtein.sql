-- Extensión fuzzystrmatch: función levenshtein() para búsqueda por nombre en socios_catalogo (bot WhatsApp).
-- Ejecutar en Neon/psql con permisos CREATE (rol con suficientes privilegios).
-- made by leavera77

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
