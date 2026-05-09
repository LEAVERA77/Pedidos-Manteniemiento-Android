-- ============================================================
-- GestorNova Android 1.0.26 (versionCode 26)
-- Ejecutar en Neon SQL Editor (misma DB que la app / API).
--
-- APK en Drive (referencia):
-- https://drive.google.com/file/d/1yFsxwgB3e8yGOmw-69Il084oxrz4w3Ol/view?usp=sharing
-- Descarga directa:
-- ============================================================

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    26,
    '1.0.26',
    'https://drive.google.com/uc?export=download&id=1yFsxwgB3e8yGOmw-69Il084oxrz4w3Ol',
    'GestorNova 1.0.26. Ajustá este texto si querés notas de release.',
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
