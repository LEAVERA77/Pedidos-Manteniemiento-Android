-- Códigos de área telefónica por localidad (Argentina). Referencia para normalizar teléfonos al importar socios.
-- Ejecutar en Neon antes de seed_codigos_area_argentina.sql.

CREATE TABLE IF NOT EXISTS codigos_area_argentina (
    id SERIAL PRIMARY KEY,
    codigo_area VARCHAR(10) NOT NULL,
    localidad VARCHAR(200) NOT NULL,
    provincia VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_codigos_area_loc_prov_norm
    ON codigos_area_argentina (UPPER(TRIM(localidad)), UPPER(TRIM(provincia)));

COMMENT ON TABLE codigos_area_argentina IS 'Características telefónicas: código de área por localidad/provincia (Argentina). made by leavera77';
