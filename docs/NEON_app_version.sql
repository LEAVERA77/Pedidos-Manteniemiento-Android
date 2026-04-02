-- ============================================================
-- TABLA app_version - control de actualizaciones APK Android
-- Ejecutar en Neon SQL Editor.
-- La API Node.js lee de aquí para GET /api/app-version
-- ============================================================

CREATE TABLE IF NOT EXISTS app_version (
    id              SERIAL PRIMARY KEY,
    version_code    INTEGER NOT NULL UNIQUE,
    version_name    VARCHAR(20) NOT NULL,
    apk_url         TEXT NOT NULL,
    release_notes   TEXT,
    force_update    BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultar la última versión
CREATE INDEX IF NOT EXISTS idx_app_version_code ON app_version (version_code DESC);

-- Debe coincidir con versionCode/versionName del APK (app/build.gradle.kts).
-- Si en Neon quedó una fila con version_code mayor (p. ej. 9 de prueba), borrala o la app pedirá actualizar en bucle.
-- Subir el APK a Drive y reemplazar el id.
-- Carpeta compartida ejemplo: https://drive.google.com/drive/folders/1DJMfqTu1cJMH_y6SiuAh7qnw18hugrJe
-- APK en Drive: https://drive.google.com/file/d/1RQnCCxBBKgkbwfmICgyo9xTNMfATK1dn/view?usp=sharing
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    12,
    '1.0.12',
    'https://drive.google.com/uc?export=download&id=REEMPLAZAR_ID_APK_1_0_12_EN_DRIVE',
    'GestorNova 1.0.12: pestañas Filtros/Dash clicables (pointer-events); impresión/PDF estadísticas captura completa; dashboard KPI con listas; firma canvas willReadFrequently; limpieza fotos nuevo pedido; mapa admin addLayer null fix.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    13,
    '1.0.13',
    'https://drive.google.com/uc?export=download&id=REEMPLAZAR_ID_APK_1_0_13_EN_DRIVE',
    'GestorNova 1.0.13: estadísticas — números en barras (mes, tipos), porcentajes sin recorte; nuevo pedido — selector WGS84 / proyectadas y sincronía tras guardar config empresa; mapa — filtros por color de prioridad (checkboxes en leyenda).',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    14,
    '1.0.14',
    'https://drive.google.com/uc?export=download&id=REEMPLAZAR_ID_APK_1_0_14_EN_DRIVE',
    'GestorNova 1.0.14: cierre — checklist de seguridad opcional (el técnico marca lo aplicable); firma obligatoria solo si el pedido tiene cliente cargado; leyenda de colores en mapa más compacta.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    15,
    '1.0.15',
    'https://drive.google.com/uc?export=download&id=REEMPLAZAR_ID_APK_1_0_15_EN_DRIVE',
    'GestorNova 1.0.15: conexión Neon en Android (intento aunque falle el chequeo HTTP); nuevo pedido muestra WGS84 por defecto; panel Colores del mapa ocultable como Filtros/Dash; desasignar y reasignar técnico con notificación Android; detalle y mapa con acciones Reasignar/Desasignar.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

-- Si ya tenés otra fila como "última", podés forzar solo la más reciente por version_code mayor.
