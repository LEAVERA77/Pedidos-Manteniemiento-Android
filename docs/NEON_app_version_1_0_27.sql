-- ============================================================
-- GestorNova Android 1.0.27 (versionCode 27)
-- Ejecutar en Neon SQL Editor (misma DB que la app / API).
-- Subí el APK 1.0.27 a Drive y actualizá apk_url si cambia el id.
-- ============================================================

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    27,
    '1.0.27',
    'https://drive.google.com/uc?export=download&id=1yFsxwgB3e8yGOmw-69Il084oxrz4w3Ol',
    'GestorNova 1.0.27 — biométrica tras login, sin asistente en APK, correcciones.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

SELECT version_code, version_name, apk_url, force_update, created_at
FROM app_version
ORDER BY version_code DESC
LIMIT 5;
