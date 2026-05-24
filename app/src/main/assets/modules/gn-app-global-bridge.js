/**
 * Puente del estado `app` (módulo app.js) a window.app para módulos y HTML inline.
 * made by leavera77
 */

/** @type {Record<string, unknown>|null} */
let _app = null;

/** @param {Record<string, unknown>} app */
export function registrarAppGlobal(app) {
    _app = app;
    if (typeof window !== 'undefined') {
        window.app = app;
    }
}

/** @returns {Record<string, unknown>|null} */
export function getApp() {
    return _app;
}
