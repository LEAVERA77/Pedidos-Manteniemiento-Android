/**
 * Registra token FCM del dispositivo Android en la API tras login.
 * made by leavera77
 */

export async function registrarFcmTokenSiDisponible({ apiUrl, getApiToken, fetchFn = fetch }) {
    const base = typeof apiUrl === 'function' ? apiUrl('/api/notificaciones/fcm-token') : '';
    if (!base || typeof getApiToken !== 'function') return;
    const tok = getApiToken();
    if (!tok) return;

    const enviar = async (fcmToken, plataforma = 'android') => {
        if (!fcmToken || String(fcmToken).length < 20) return;
        try {
            await fetchFn(base, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tok}`,
                },
                body: JSON.stringify({ fcm_token: String(fcmToken), plataforma }),
            });
        } catch (e) {
            console.warn('[fcm-register]', e?.message || e);
        }
    };

    try {
        if (window.AndroidFcm && typeof window.AndroidFcm.getToken === 'function') {
            const cb = `__gnFcmCb_${Date.now()}`;
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
