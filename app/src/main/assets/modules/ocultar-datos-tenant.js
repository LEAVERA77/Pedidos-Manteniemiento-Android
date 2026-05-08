/**
 * Tras vincular tenant (técnico): no volver a mostrar wizard web (#gw) ni la varita.
 * Tras cambio de tenant en sesión: enmascarar campos Empresa del admin hasta que cargue mi-configuración (solo UI).
 */

const K_PMG_ONBOARDING_WEB = 'pmg_onboarding_web_done';
const K_GN_ONBOARDING = 'gestornova_onboarding_done';

/** IDs de inputs de «Datos de la Empresa» (solo pantalla; no toca Neon). */
const IDS_EMPRESA_ADMIN_TEXTO = [
    'cfg-nombre',
    'cfg-tipo',
    'cfg-email',
    'cfg-telefono',
    'cfg-calle',
    'cfg-numero',
    'cfg-provincia-nominatim',
];

/**
 * Marca onboarding web como hecho para que #gw y el botón varita no reaparezcan de fondo tras reload.
 */
export function registrarOnboardingCompletadoTrasVinculoTenantMtt() {
    try {
        localStorage.setItem(K_PMG_ONBOARDING_WEB, '1');
        localStorage.setItem(K_GN_ONBOARDING, '1');
    } catch (_) {}
    try {
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        gw?.classList.remove('active');
        ls?.classList.add('active');
    } catch (_) {}
}

/**
 * Muestra guión en campos de empresa del admin hasta que `cargarFormEmpresa` u otro flujo rellene el tenant actual.
 */
export function aplicarMascaraEmpresaAdminTrasCambioTenant() {
    try {
        for (const id of IDS_EMPRESA_ADMIN_TEXTO) {
            const el = document.getElementById(id);
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                el.value = '—';
            }
        }
    } catch (_) {}
}
