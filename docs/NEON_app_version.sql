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
-- Archivo en Drive: https://drive.google.com/file/d/1zCxXk5KPBG9k8p0WPJTxeCl7SjqNvXeh/view?usp=sharing
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    8,
    '1.0.7',
    'https://drive.google.com/uc?export=download&id=1zCxXk5KPBG9k8p0WPJTxeCl7SjqNvXeh',
    'GestorNova (com.gestornova.gestion): actualización desde Neon al conectar, import socios por encabezados en cualquier orden, auto ejecución a 30 m, Excel flexible, usuario recordado en el dispositivo.',
    true
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

-- Si ya tenés otra fila como "última", podés forzar solo la más reciente por version_code mayor.
