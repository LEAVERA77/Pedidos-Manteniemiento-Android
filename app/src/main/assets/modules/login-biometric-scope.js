/**
 * Ámbito tenant/rubro para login biométrico Android (sin purgar credenciales en logout).
 * made by leavera77
 */

import { tenantIdDesdeAppConfig, TENANT_ID_MONOTENANT_FALLBACK } from './tenantResolver.js';

export function gnBioSesionActiva() {
    try {
        return !!document.body?.classList.contains('gn-sesion-activa');
    } catch (_) {
        return false;
    }
}

/** Tenant y rubro de la sesión o config actual (puede no coincidir con lo guardado en huella tras logout). */
export function gnBioScopeActualDesdeApp() {
    let tid = TENANT_ID_MONOTENANT_FALLBACK;
    try {
        if (typeof window.tenantIdActual === 'function') {
            const n = Number(window.tenantIdActual());
            if (Number.isFinite(n) && n > 0) tid = n;
        } else {
            const cfgT = tenantIdDesdeAppConfig(window.APP_CONFIG || {});
            if (Number.isFinite(cfgT) && cfgT > 0) tid = cfgT;
        }
    } catch (_) {}
    let bt = '';
    try {
        const cfg = window.EMPRESA_CFG || {};
        bt = String(cfg.active_business_type || cfg.tipo || '')
            .trim()
            .toLowerCase();
    } catch (_) {}
    return { tid, bt };
}

/**
 * Para «Entrar con huella» / guardar: con sesión usa app; sin sesión usa el ámbito
 * persistido en prefs nativas (evita falso mismatch tras cerrar sesión).
 */
export function gnBioScopeParaAccionBiometrica() {
    if (gnBioSesionActiva()) return gnBioScopeActualDesdeApp();
    const B = typeof window !== 'undefined' ? window.AndroidBiometric : null;
    if (B && typeof B.getSavedLoginScopeJson === 'function') {
        try {
            const o = JSON.parse(String(B.getSavedLoginScopeJson() || '{}'));
            const tid = Number(o.tenantId);
            if (Number.isFinite(tid) && tid > 0) {
                return {
                    tid,
                    bt: String(o.businessType || '')
                        .trim()
                        .toLowerCase(),
                };
            }
        } catch (_) {}
    }
    return gnBioScopeActualDesdeApp();
}

/** Solo con sesión activa (nunca en pantalla de login tras logout). */
export function gnSyncBiometricScopeSiSesionActiva() {
    if (!gnBioSesionActiva()) return;
    const B = window.AndroidBiometric;
    if (!B || typeof B.syncBiometricLoginScope !== 'function') return;
    const { tid, bt } = gnBioScopeActualDesdeApp();
    try {
        B.syncBiometricLoginScope(tid, bt);
    } catch (e) {
        console.warn('[bio-login] sync scope', e);
    }
}
