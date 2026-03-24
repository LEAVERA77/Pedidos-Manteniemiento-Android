BEGIN;

-- =========================================
-- TABLAS NUEVAS PARA API MULTITENANT
-- =========================================

CREATE TABLE IF NOT EXISTS clientes (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(200) NOT NULL,
    tipo                VARCHAR(50) NOT NULL CHECK (tipo IN ('municipio','cooperativa_electrica','cooperativa_agua')),
    plan                VARCHAR(50) NOT NULL DEFAULT 'basico',
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    configuracion       JSONB NOT NULL DEFAULT '{}'::jsonb,
    fecha_registro      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias_trabajo (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nombre          VARCHAR(120) NOT NULL,
    descripcion     TEXT,
    icono           VARCHAR(80),
    orden           INTEGER NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cliente_id, nombre)
);

CREATE TABLE IF NOT EXISTS clientes_finales (
    id                  SERIAL PRIMARY KEY,
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo                VARCHAR(50) NOT NULL DEFAULT 'socio',
    numero_cliente      VARCHAR(80),
    nombre              VARCHAR(120),
    apellido            VARCHAR(120),
    telefono            VARCHAR(30),
    email               VARCHAR(150),
    calle               VARCHAR(150),
    numero_puerta       VARCHAR(20),
    barrio              VARCHAR(120),
    localidad           VARCHAR(120),
    latitud             NUMERIC(10,7),
    longitud            NUMERIC(10,7),
    nis                 VARCHAR(80),
    medidor             VARCHAR(80),
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cliente_id, numero_cliente)
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id       INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    titulo          VARCHAR(200) NOT NULL,
    mensaje         TEXT NOT NULL,
    leida           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sincronizacion_pendiente (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    operacion       VARCHAR(30) NOT NULL,
    tabla           VARCHAR(80) NOT NULL,
    datos           JSONB NOT NULL,
    reintentos      INTEGER NOT NULL DEFAULT 0,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_notificaciones (
    id                  BIGSERIAL PRIMARY KEY,
    destinatario_id     INTEGER,
    destinatario_tipo   VARCHAR(30) NOT NULL,
    telefono            VARCHAR(30),
    mensaje             TEXT NOT NULL,
    pedido_id           INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    estado              VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    error               TEXT,
    fecha_envio         TIMESTAMPTZ,
    fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- ALTERS TABLAS EXISTENTES
-- =========================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
    ADD COLUMN IF NOT EXISTS whatsapp_notificaciones BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(200),
    ADD COLUMN IF NOT EXISTS cliente_direccion TEXT,
    ADD COLUMN IF NOT EXISTS cliente_numero_puerta VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cliente_referencia TEXT,
    ADD COLUMN IF NOT EXISTS foto_urls TEXT,
    ADD COLUMN IF NOT EXISTS nis VARCHAR(50),
    ADD COLUMN IF NOT EXISTS medidor VARCHAR(50),
    ADD COLUMN IF NOT EXISTS tecnico_asignado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS asignado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS firma_cliente TEXT,
    ADD COLUMN IF NOT EXISTS firma_fecha TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS firma_nombre VARCHAR(200);

-- =========================================
-- ÍNDICES
-- =========================================

CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes(tipo);
CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);
CREATE INDEX IF NOT EXISTS idx_categorias_cliente ON categorias_trabajo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_finales_cliente ON clientes_finales(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_finales_nis ON clientes_finales(nis);
CREATE INDEX IF NOT EXISTS idx_clientes_finales_medidor ON clientes_finales(medidor);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida ON notificaciones(usuario_id, leida, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_sync_usuario_fecha ON sincronizacion_pendiente(usuario_id, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pedido_fecha ON whatsapp_notificaciones(pedido_id, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_nis ON pedidos(nis);
CREATE INDEX IF NOT EXISTS idx_pedidos_medidor ON pedidos(medidor);
CREATE INDEX IF NOT EXISTS idx_pedidos_tecnico_asignado ON pedidos(tecnico_asignado_id);

COMMIT;

