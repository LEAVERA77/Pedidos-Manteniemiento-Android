-- ============================================================
-- GestorNova Android 1.0.28 (versionCode 28) — referencia admin/PWA
-- La APK Android prioriza app/version.json en GitHub para OTA.
-- Mantener app_version en Neon para panel web / informes si aplica.
-- ============================================================

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    28,
    '1.0.28',
    'https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android/releases/latest/download/app-release.apk',
    'GestorNova 1.0.28 — OTA desde GitHub Releases (APK firmada).',
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
