-- =============================================================
-- ESQUEMA MULTITENANT - Pedidos MG
-- Tablas NUEVAS para municipios y cooperativas (agua, eléctrica).
-- NO modifica tablas existentes: usuarios, pedidos, distribuidores, etc.
-- Ejecutar en Neon SQL Editor.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. CLIENTES (cada municipio o cooperativa)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    tipo            VARCHAR(50) NOT NULL,   -- 'municipio', 'cooperativa_agua', 'cooperativa_electrica'
    plan            VARCHAR(50) DEFAULT 'basico',  -- 'basico', 'pro', 'premium'
    configuracion   JSONB DEFAULT '{}',
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes (activo);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes (tipo);

-- -------------------------------------------------------------
-- 2. USUARIOS_TENANT (técnicos y admins de cada cliente)
-- Nombre distinto para no tocar la tabla usuarios existente.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_tenant (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    email           VARCHAR(150) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nombre          VARCHAR(100),
    rol             VARCHAR(50) NOT NULL,   -- 'admin', 'tecnico', 'supervisor'
    activo          BOOLEAN DEFAULT true,
    reset_token     TEXT,
    reset_expiry    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, email)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_cliente ON usuarios_tenant (cliente_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_activo ON usuarios_tenant (activo);

-- -------------------------------------------------------------
-- 3. CATEGORÍAS DE TRABAJOS (según el tipo de cliente)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_trabajo (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nombre          VARCHAR(100) NOT NULL,
    icono           VARCHAR(50),
    orden           INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_categorias_cliente ON categorias_trabajo (cliente_id);

-- -------------------------------------------------------------
-- 4. PEDIDOS_TENANT (pedidos multitenant)
-- Nombre distinto para no tocar la tabla pedidos existente.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_tenant (
    id                  SERIAL PRIMARY KEY,
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    usuario_id          INTEGER REFERENCES usuarios_tenant(id) ON DELETE SET NULL,
    categoria_id        INTEGER REFERENCES categorias_trabajo(id) ON DELETE SET NULL,

    titulo              VARCHAR(200),
    descripcion         TEXT,
    estado              VARCHAR(50) DEFAULT 'pendiente',
    prioridad           VARCHAR(20) DEFAULT 'media',

    direccion           TEXT,
    latitud             DECIMAL(10,8),
    longitud            DECIMAL(11,8),
    referencia          TEXT,

    fotos               TEXT[] DEFAULT '{}',

    fecha_creacion      TIMESTAMPTZ DEFAULT NOW(),
    fecha_asignacion    TIMESTAMPTZ,
    fecha_finalizacion  TIMESTAMPTZ,

    metadata            JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_cliente ON pedidos_tenant (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_usuario ON pedidos_tenant (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_estado ON pedidos_tenant (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_fecha ON pedidos_tenant (fecha_creacion DESC);

-- -------------------------------------------------------------
-- 5. COMENTARIOS (sobre pedidos_tenant)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios_tenant (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos_tenant(id) ON DELETE CASCADE,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios_tenant(id) ON DELETE CASCADE,
    comentario      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tenant_pedido ON comentarios_tenant (pedido_id);

-- -------------------------------------------------------------
-- 6. NOTIFICACIONES_TENANT (distintas de notificaciones_movil)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones_tenant (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios_tenant(id) ON DELETE CASCADE,
    pedido_id       INTEGER REFERENCES pedidos_tenant(id) ON DELETE SET NULL,
    titulo          VARCHAR(100),
    mensaje         TEXT,
    leida           BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_tenant_usuario ON notificaciones_tenant (usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_leida ON notificaciones_tenant (usuario_id, leida) WHERE leida = false;

-- -------------------------------------------------------------
-- 7. SINCRONIZACIÓN OFFLINE (cola para app multitenant)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sincronizacion_pendiente (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios_tenant(id) ON DELETE CASCADE,
    operacion       VARCHAR(20) NOT NULL,
    tabla_destino   VARCHAR(50),
    datos           JSONB NOT NULL,
    reintentos      INTEGER DEFAULT 0,
    error_ultimo    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sincro_usuario ON sincronizacion_pendiente (usuario_id);

-- -------------------------------------------------------------
-- 8. DATOS INICIALES (opcional - ejecutar una sola vez)
-- -------------------------------------------------------------
-- INSERT INTO clientes (nombre, tipo, plan) VALUES
--     ('Ejemplo Municipio', 'municipio', 'basico'),
--     ('Cooperativa Agua Ejemplo', 'cooperativa_agua', 'basico'),
--     ('Cooperativa Eléctrica Ejemplo', 'cooperativa_electrica', 'pro');

-- INSERT INTO categorias_trabajo (cliente_id, nombre, icono, orden) VALUES
--     (1, 'Alumbrado público', 'fa-lightbulb', 1),
--     (1, 'Obras viales', 'fa-road', 2),
--     (2, 'Medidores y lecturas', 'fa-tint', 1),
--     (3, 'Postes y líneas', 'fa-bolt', 1);

COMMIT;
