-- ============================================================
-- Publicar actualización Android GestorNova 1.0.21 (versionCode 21)
-- Ejecutar en Neon SQL Editor (misma DB que usa la API en Render).
--
-- Requisitos:
-- 1) En app/build.gradle.kts debe coincidir: versionCode 21, versionName 1.0.21
-- 2) Generá la APK firmada (release), subila a Drive y usá el ID correcto en apk_url
--    (si reemplazás el archivo, el ID puede cambiar).
-- 3) La app instalada solo muestra el diálogo si remoto > local (ej. tenés 20 y Neon 21).
--
-- Enlace de referencia (APK compartido):
-- https://drive.google.com/file/d/1IPcgLY51c4v-9Gfz4rFLgAw66yzSorpr/view
-- Descarga directa:
-- https://drive.google.com/uc?export=download&id=1IPcgLY51c4v-9Gfz4rFLgAw66yzSorpr
-- ============================================================

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    21,
    '1.0.21',
    'https://drive.google.com/uc?export=download&id=1IPcgLY51c4v-9Gfz4rFLgAw66yzSorpr',
    'GestorNova 1.0.21: actualización recomendada. Si force_update = true, el diálogo no permite posponer.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

-- Verificación
-- SELECT version_code, version_name, apk_url, force_update FROM app_version ORDER BY version_code DESC LIMIT 3;
