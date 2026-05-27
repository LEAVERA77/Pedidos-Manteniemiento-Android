/**
 * Parche mínimo de confirm/alert con gnDice (extraído de app.js — oleada 1).
 * Debe cargarse antes de gn-trust-ui-bootstrap (toast sobre alert).
 * made by leavera77
 */
import { gnDice } from './utils.js';

export function installGnWindowDialogsPatch() {
    if (typeof window === 'undefined') return;

    if (!window.__gnConfirmWrapped) {
        const origConfirm = window.confirm.bind(window);
        window.confirm = function gnConfirmConDice(msg) {
            return origConfirm(gnDice(msg));
        };
        window.__gnConfirmWrapped = true;
    }

    if (!window.__gnAlertWrapped) {
        const origAlert = window.alert.bind(window);
        window.alert = function gnAlertConDice(msg) {
            origAlert(gnDice(msg));
        };
        window.__gnAlertWrapped = true;
    }
}

installGnWindowDialogsPatch();
