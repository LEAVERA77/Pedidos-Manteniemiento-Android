-- ============================================================
-- ACTUALIZACIÓN app_version - PedidosMG 1.0.5 (version_code 6)
-- Ejecutar en Neon SQL Editor tras subir el APK a Drive/Render.
-- ============================================================

-- Reemplazar REEMPLAZAR_ID_APK_DRIVE por el ID real del APK en Google Drive
-- (abrir APK en Drive → Compartir → Cualquier persona con el enlace → copiar ID de la URL)

INSERT INTO app_version (version_code, version_name, apk_url, release_notes, force_update)
VALUES (
    6,
    '1.0.5',
    'https://drive.google.com/uc?export=download&id=1JWVowxjHIBLP3qNm3JwNfgNGPKrJCoqZ',
    'WhatsApp: reutilizar pestaña wa_send si ya está abierta. Enlace clickeable open.html. Detección automática de actualización al conectar a Neon.',
    true
)
ON CONFLICT (version_code) DO UPDATE SET
    version_name = EXCLUDED.version_name,
    apk_url = EXCLUDED.apk_url,
    release_notes = EXCLUDED.release_notes,
    force_update = EXCLUDED.force_update;
