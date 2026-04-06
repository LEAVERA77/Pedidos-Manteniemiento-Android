-- =============================================================
-- KPI snapshots por tenant (GestorNova / Pedidos-MG)
-- Ejecutar en Neon SQL Editor.
--
-- Alineado con:
--   - pedidos.tenant_id / usuarios.tenant_id (INTEGER NOT NULL, típico default 1)
--   - Futuro: FK lógica a clientes(id) cuando unifiquen catálogo de tenants
--
-- Uso: guardar métricas de piloto comercial, dashboards históricos o ETL.
-- El front/API puede calcular y hacer INSERT; valor_json permite desglose.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               INTEGER NOT NULL,
    metrica                 VARCHAR(100) NOT NULL,
    periodo_inicio          DATE NOT NULL,
    periodo_fin             DATE NOT NULL,
    valor_numero            DOUBLE PRECISION,
    valor_json              JSONB NOT NULL DEFAULT '{}'::jsonb,
    unidad                  VARCHAR(32),
    fuente                  VARCHAR(40) NOT NULL DEFAULT 'manual',
    notas                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_usuario_id   INTEGER,
    CONSTRAINT chk_kpi_snapshots_periodo CHECK (periodo_fin >= periodo_inicio),
    CONSTRAINT chk_kpi_snapshots_fuente CHECK (
        fuente IN ('manual', 'computed_batch', 'sql_report', 'import', 'api')
    )
);

-- FK opcional a usuarios (omitir si en algún entorno no existe la tabla aún)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'usuarios'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'kpi_snapshots_created_by_usuario_id_fkey'
        ) THEN
            ALTER TABLE kpi_snapshots
                ADD CONSTRAINT kpi_snapshots_created_by_usuario_id_fkey
                FOREIGN KEY (created_by_usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Un snapshot por métrica y ventana de fechas por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_snapshots_tenant_metrica_periodo
    ON kpi_snapshots (tenant_id, metrica, periodo_inicio, periodo_fin);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_tenant_periodo
    ON kpi_snapshots (tenant_id, periodo_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_metrica
    ON kpi_snapshots (metrica, tenant_id);

COMMENT ON TABLE kpi_snapshots IS 'Métricas agregadas por tenant (piloto comercial, SLA, ROI). tenant_id coherente con pedidos/usuarios.';
COMMENT ON COLUMN kpi_snapshots.tenant_id IS 'Mismo criterio que pedidos.tenant_id y usuarios.tenant_id.';
COMMENT ON COLUMN kpi_snapshots.metrica IS 'Clave estable, ej: tiempo_resolucion_critico_h_medio, pct_cierre_primera_visita, reclamos_duplicados_evitados.';
COMMENT ON COLUMN kpi_snapshots.periodo_inicio IS 'Inicio inclusive del intervalo agregado.';
COMMENT ON COLUMN kpi_snapshots.periodo_fin IS 'Fin inclusive del intervalo agregado.';
COMMENT ON COLUMN kpi_snapshots.valor_numero IS 'Valor principal cuando aplica un escalar (horas, porcentaje 0-100, conteo).';
COMMENT ON COLUMN kpi_snapshots.valor_json IS 'Detalle opcional: { "muestra_n": 42, "por_estado": {...} }. Para satisfaccion_pct: p. ej. n_respuestas, promedio_estrellas (WhatsApp 1–5).';

COMMIT;

-- Ejemplo (piloto 30 días, tenant 1):
-- INSERT INTO kpi_snapshots (
--   tenant_id, metrica, periodo_inicio, periodo_fin,
--   valor_numero, unidad, fuente, valor_json, notas
-- ) VALUES (
--   1,
--   'pct_cierres_con_foto',
--   DATE '2026-04-01',
--   DATE '2026-04-30',
--   72.5,
--   'percent',
--   'computed_batch',
--   '{"cerrados_con_foto": 29, "cerrados_total": 40}'::jsonb,
--   'Piloto abril — cooperativa X'
-- );
