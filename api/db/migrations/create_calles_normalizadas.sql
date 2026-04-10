-- Tabla de calles normalizadas para corregir errores de escritura del usuario
-- made by leavera77

CREATE TABLE IF NOT EXISTS calles_normalizadas (
  id SERIAL PRIMARY KEY,
  ciudad TEXT NOT NULL,
  nombre_oficial TEXT NOT NULL,
  variantes TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (ciudad, nombre_oficial)
);

CREATE INDEX IF NOT EXISTS idx_calles_normalizadas_ciudad ON calles_normalizadas (ciudad);
CREATE INDEX IF NOT EXISTS idx_calles_normalizadas_activo ON calles_normalizadas (activo);

-- Poblar con datos iniciales de Cerrito
INSERT INTO calles_normalizadas (ciudad, nombre_oficial, variantes) VALUES
('Cerrito', 'Boulevard Libertad', ARRAY['livertad', 'libertad', 'bvar libertad', 'bv libertad', 'bvd libertad', 'boulevar libertad', 'blvd libertad']),
('Cerrito', 'Avenida San Martín', ARRAY['san martin', 'sanmartin', 'av san martin', 'avda san martin', 'av. san martin']),
('Cerrito', 'Avenida Mitre', ARRAY['mitre', 'av mitre', 'avda mitre', 'av. mitre']),
('Cerrito', 'Avenida Paraná', ARRAY['parana', 'av parana', 'avda parana', 'av. parana']),
('Cerrito', 'Antártida Argentina', ARRAY['antartica', 'antartida', 'antartica argentina', 'antartida arg']),
('Cerrito', 'Almafuerte', ARRAY['almafuerte', 'alma fuerte']),
('Cerrito', '25 de Mayo', ARRAY['25 mayo', 'veinticinco de mayo', '25demayo', 'veinte y cinco de mayo']),
('Cerrito', '9 de Julio', ARRAY['9 julio', 'nueve de julio', '9dejulio', 'nueve julio']),
('Cerrito', 'Sarmiento', ARRAY['sarmiento', 'sarmiento dom', 'domingo sarmiento']),
('Cerrito', 'Belgrano', ARRAY['belgrano', 'manuel belgrano']),
('Cerrito', 'Urquiza', ARRAY['urquiza', 'justo jose urquiza', 'justo jose de urquiza']),
('Cerrito', 'Rivadavia', ARRAY['rivadavia', 'bernardino rivadavia']),
('Cerrito', 'Moreno', ARRAY['moreno', 'mariano moreno'])
ON CONFLICT (ciudad, nombre_oficial) DO NOTHING;

-- Datos iniciales de María Grande (agregar según necesidad)
INSERT INTO calles_normalizadas (ciudad, nombre_oficial, variantes) VALUES
('María Grande', 'Avenida San Martín', ARRAY['san martin', 'sanmartin', 'av san martin', 'avda san martin', 'av. san martin']),
('María Grande', 'Avenida Mitre', ARRAY['mitre', 'av mitre', 'avda mitre', 'av. mitre']),
('María Grande', '25 de Mayo', ARRAY['25 mayo', 'veinticinco de mayo', '25demayo']),
('María Grande', '9 de Julio', ARRAY['9 julio', 'nueve de julio', '9dejulio'])
ON CONFLICT (ciudad, nombre_oficial) DO NOTHING;

COMMENT ON TABLE calles_normalizadas IS 'Diccionario de calles oficiales y variantes para normalización inteligente de direcciones ingresadas por usuarios con errores ortográficos';
COMMENT ON COLUMN calles_normalizadas.nombre_oficial IS 'Nombre oficial de la calle tal como aparece en OpenStreetMap';
COMMENT ON COLUMN calles_normalizadas.variantes IS 'Array de variantes comunes escritas incorrectamente por usuarios (sin tildes, abreviadas, con typos)';
