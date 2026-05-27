/**
 * Monta bloques admin (geocerca, reportes email, ranking/SLA) una sola vez.
 * made by leavera77
 */

import { htmlGeocercaSettingsAdminBlock, initAdminGeocercaSettingsUI } from './admin-geocerca-settings-ui.js';
import { htmlReportesEmailAdminBlock, initAdminReportesEmailUI } from './admin-reportes-email-ui.js';
import { htmlRankingSlaAdminBlocks, cargarRankingTecnicosEnEstadisticas, cargarAlertasSlaEnEstadisticas } from './estadisticas-ranking-sla-ui.js';
import {
    htmlOperacionAuditAdminBlock,
    cargarSlaResumenEnEstadisticas,
    cargarOperacionAuditEnEstadisticas,
} from './gn-admin-operacion-audit-ui.js';
import { htmlZonaServicioAdminBlock, cargarZonaServicioAdmin } from './gn-zona-servicio-ui.js';
import { refrescarIndicadorReportesEmail } from './gn-reportes-email-indicator.js';
import { htmlSetupChecklistAdminBlock, cargarSetupChecklistAdmin } from './gn-admin-setup-checklist-ui.js';
import { htmlGeoCalidadAdminBlock, cargarGeoCalidadEnEstadisticas } from './gn-geo-calidad-admin-ui.js';
import { htmlSistemaSaludAdminBlock, cargarSistemaSaludAdmin } from './gn-admin-sistema-salud-ui.js';

let _mounted = false;

export function initGnFeaturesAdminMounts(ctx) {
    if (_mounted) return;
    _mounted = true;
    const geoMount = document.getElementById('gn-admin-geocerca-mount');
    if (geoMount && !geoMount.innerHTML.trim()) {
        geoMount.innerHTML =
            htmlSetupChecklistAdminBlock() +
            htmlSistemaSaludAdminBlock() +
            htmlGeocercaSettingsAdminBlock() +
            htmlZonaServicioAdminBlock();
    }
    const repMount = document.getElementById('gn-reportes-email-mount');
    if (repMount && !repMount.innerHTML.trim()) {
        repMount.innerHTML = htmlReportesEmailAdminBlock();
    }
    const estMount = document.getElementById('gn-est-ranking-sla-mount');
    if (estMount && !estMount.innerHTML.trim()) {
        estMount.innerHTML =
            htmlRankingSlaAdminBlocks() + htmlGeoCalidadAdminBlock() + htmlOperacionAuditAdminBlock();
    }
    if (ctx?.esAdmin?.()) {
        void initAdminGeocercaSettingsUI({ toast: ctx.toast, esAdmin: true });
        void cargarSetupChecklistAdmin({
            apiUrl: ctx.apiUrl,
            getApiToken: ctx.getApiToken,
        });
        void cargarSistemaSaludAdmin({
            apiUrl: ctx.apiUrl,
            getApiToken: ctx.getApiToken,
        });
        void cargarZonaServicioAdmin({
            apiUrl: ctx.apiUrl,
            getApiToken: ctx.getApiToken,
        });
        initAdminReportesEmailUI({
            apiUrl: ctx.apiUrl,
            getApiToken: ctx.getApiToken,
            toast: ctx.toast,
            esAdmin: true,
        });
        void refrescarIndicadorReportesEmail({
            apiUrl: ctx.apiUrl,
            getApiToken: ctx.getApiToken,
            esAdmin: ctx.esAdmin,
        });
    }
}

export async function refrescarRankingSlaEstadisticas(ctx) {
    if (!ctx?.esAdmin?.()) return;
    const periodo = document.getElementById('est-periodo')?.value || '30d';
    await cargarRankingTecnicosEnEstadisticas({
        apiUrl: ctx.apiUrl,
        getApiToken: ctx.getApiToken,
        periodo,
    });
    await cargarAlertasSlaEnEstadisticas({
        apiUrl: ctx.apiUrl,
        getApiToken: ctx.getApiToken,
    });
    await cargarSlaResumenEnEstadisticas({
        apiUrl: ctx.apiUrl,
        getApiToken: ctx.getApiToken,
    });
    await cargarOperacionAuditEnEstadisticas({
        apiUrl: ctx.apiUrl,
        getApiToken: ctx.getApiToken,
    });
    await cargarGeoCalidadEnEstadisticas({
        apiUrl: ctx.apiUrl,
        getApiToken: ctx.getApiToken,
    });
}
