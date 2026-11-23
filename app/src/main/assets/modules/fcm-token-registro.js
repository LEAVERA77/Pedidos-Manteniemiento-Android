/**
 * Registra token FCM del dispositivo Android en la API tras login.
 * made by leavera77
 */

let ultimoEnvio = null;
let secuencia = 0;

export async function registrarFcmTokenSiDisponible({ apiUrl, getApiToken, fetchFn = fetch }) {
    const base = typeof apiUrl === 'function' ? apiUrl('/api/notificaciones/fcm-token') : '';
    if (!base || typeof getApiToken !== 'function') return;
    const tok = getApiToken();
    if (!tok) return;

    const enviar = async (fcmToken, plataforma = 'android') => {
        if (!fcmToken || String(fcmToken).length < 20 || getApiToken() !== tok) return;
        const key = `${tok}:${fcmToken}`;
        if (ultimoEnvio?.key === key && Date.now() - ultimoEnvio.at < 6 * 60 * 60 * 1000) return;
        try {
            const response = await fetchFn(base, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tok}`,
                },
                body: JSON.stringify({ fcm_token: String(fcmToken), plataforma }),
            });
            if (response.ok && getApiToken() === tok) ultimoEnvio = { key, at: Date.now() };
        } catch (e) {
            console.warn('[fcm-register]', e?.message || e);
        }
    };

    try {
        if (window.AndroidFcm && typeof window.AndroidFcm.getToken === 'function') {
            const cb = `__gnFcmCb_${Date.now()}_${++secuencia}`;
            setTimeout(() => { try { delete window[cb]; } catch (_) {} }, 60000);
            window[cb] = (payload) => {
                try {
                    delete window[cb];
                } catch (_) {}
                if (payload?.token) void enviar(payload.token, payload.plataforma || 'android');
            };
            window.AndroidFcm.getToken(`window.${cb}`);
            return;
        }
    } catch (_) {}

    const cached = localStorage.getItem('pmg_fcm_token');
    if (cached) await enviar(cached);
}
