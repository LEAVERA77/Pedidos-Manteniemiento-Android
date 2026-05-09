-- ============================================================
-- GestorNova Android 1.0.34 (versionCode 34)
-- Ejecutar en Neon SQL Editor (misma DB que la app / API).
-- OTA: la app lee esta fila y descarga desde apk_url (Google Drive).
-- ============================================================

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    34,
    '1.0.34',
    'https://drive.google.com/uc?export=download&id=1yFsxwgB3e8yGOmw-69Il084oxrz4w3Ol',
    'GestorNova 1.0.34',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;

-- Verificación
SELECT version_code, version_name, apk_url, force_update, created_at
FROM app_version
ORDER BY version_code DESC
LIMIT 5;
