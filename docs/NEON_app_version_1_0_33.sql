-- Referencia admin/PWA. APK: OTA vía app/version.json en GitHub.
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    33,
    '1.0.33',
    'https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android/releases/latest/download/app-release.apk',
    '1.0.33 — OTA GitHub: descarga pública, omitir versión, re-chequeo en login.',
    false
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;
