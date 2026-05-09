/**
 * Android WebView: tras conectar a Neon, lee app_version y delega en el bridge nativo
 * (prioridad sobre manifest HTTP en assets).
 */
export async function runNeonAppVersionCheckAndroid(deps) {
    const sqlSimple = deps?.sqlSimple;
    const isNeonReady = deps?.isNeonReady;
    const isGestorNovaApp = deps?.isGestorNovaApp;
    if (typeof sqlSimple !== 'function' || typeof isNeonReady !== 'function' || typeof isGestorNovaApp !== 'function') {
        return;
    }
    if (!isGestorNovaApp()) return;
    if (!isNeonReady()) return;
    const ac = typeof window !== 'undefined' ? window.AndroidConfig : null;
    if (!ac || typeof ac.applyUpdateCheckFromNeon !== 'function') {
        if (typeof ac?.requestUpdateCheck === 'function') {
            try {
                ac.requestUpdateCheck();
            } catch (_) {}
        }
        return;
    }
    try {
        const r = await sqlSimple(
            `SELECT version_code, version_name, apk_url, COALESCE(release_notes,'') AS release_notes, COALESCE(force_update, false) AS force_update FROM app_version ORDER BY version_code DESC LIMIT 1`
        );
        const row = r.rows && r.rows[0];
        if (row && row.apk_url) {
            const fu =
                row.force_update === true ||
                row.force_update === 't' ||
                row.force_update === 1 ||
                String(row.force_update).toLowerCase() === 'true';
            const vc = parseInt(row.version_code, 10) || 0;
            const payload = JSON.stringify({
                versionCode: vc,
                versionName: String(row.version_name || ''),
                apkUrl: String(row.apk_url || ''),
                releaseNotes: String(row.release_notes || ''),
                forceUpdate: fu,
            });
            /* Evita martillar al bridge nativo en cada reconexión Neon (mismo versionCode). */
            const TS_KEY = 'pmg_neon_update_bridge_ts';
            const VC_KEY = 'pmg_neon_update_bridge_vc';
            try {
                const now = Date.now();
                const prevVc = parseInt(sessionStorage.getItem(VC_KEY) || '0', 10) || 0;
                const prevTs = parseInt(sessionStorage.getItem(TS_KEY) || '0', 10) || 0;
                if (vc === prevVc && now - prevTs < 120000) {
                    return;
                }
                sessionStorage.setItem(VC_KEY, String(vc));
                sessionStorage.setItem(TS_KEY, String(now));
            } catch (_) {}
            try {
                ac.applyUpdateCheckFromNeon(payload);
            } catch (_) {}
            return;
        }
    } catch (e) {
        console.warn('[update] app_version Neon:', e?.message || e);
    }
    if (typeof ac.requestUpdateCheck === 'function') {
        try {
            ac.requestUpdateCheck();
        } catch (_) {}
    }
}
