/**
 * Sincronía cfgi-nombre ↔ cfgi-tech-tenant-sel ↔ cfgi-tipo y validación antes de avanzar / Finalizar.
 * made by leavera77
 */

import {
    normalizarTipoNeonASelectValue,
    aplicarTipoInferidoEnSelectCfgiTipo,
} from './cfgi-wizard-tenant-select.js';

/** @type {Array<{ id?: unknown, nombre?: unknown, tipo?: unknown }>} */
let _cache = [];
let _syncing = false;
/** @type {(msg: string, type?: string) => void} */
let _toast = () => {};

export function setCfgiTenantSelectorsCache(clientes) {
    _cache = Array.isArray(clientes) ? clientes : [];
}

function byId(tid) {
    const n = Number(tid);
    return _cache.find((c) => Number(c?.id) === n);
}

/** Tras «Listar tenants» o carga automática: cache + alinear los dos selects de id. */
export function alinearSelectoresCfgiTrasCargarLista(clientes) {
    setCfgiTenantSelectorsCache(clientes);
    const tech = document.getElementById('cfgi-tech-tenant-sel');
    const nom = document.getElementById('cfgi-nombre');
    const tidTech = tech ? Number(tech.value) : NaN;
    const tidNom = nom && nom.tagName === 'SELECT' ? Number(nom.value) : NaN;
    if (Number.isFinite(tidTech) && tidTech > 0) {
        syncCfgiSelectorsFromTechTenantSel();
    } else if (Number.isFinite(tidNom) && tidNom > 0) {
        syncCfgiSelectorsFromNombreSel();
    }
}

export function syncCfgiSelectorsFromTechTenantSel() {
    if (_syncing) return;
    const tech = document.getElementById('cfgi-tech-tenant-sel');
    const nom = document.getElementById('cfgi-nombre');
    const tipo = document.getElementById('cfgi-tipo');
    if (!tech || !nom || nom.tagName !== 'SELECT' || !tipo) return;
    const tid = Number(tech.value);
    if (!Number.isFinite(tid) || tid < 1) return;
    _syncing = true;
    try {
        let found = false;
        for (let i = 0; i < nom.options.length; i++) {
            if (Number(nom.options[i].value) === tid) {
                nom.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found && nom.options.length > 1) {
            nom.selectedIndex = 0;
        }
        if (found) {
            aplicarTipoInferidoEnSelectCfgiTipo(nom, tipo);
        } else {
            const row = byId(tid);
            const te = row ? normalizarTipoNeonASelectValue(String(row.tipo || '')) : '';
            if (te) tipo.value = te;
        }
    } finally {
        _syncing = false;
    }
}

export function syncCfgiSelectorsFromNombreSel() {
    if (_syncing) return;
    const tech = document.getElementById('cfgi-tech-tenant-sel');
    const nom = document.getElementById('cfgi-nombre');
    const tipo = document.getElementById('cfgi-tipo');
    if (!tech || !nom || nom.tagName !== 'SELECT' || !tipo) return;
    const tid = Number(nom.value);
    if (!Number.isFinite(tid) || tid < 1) return;
    _syncing = true;
    try {
        let found = false;
        for (let i = 0; i < tech.options.length; i++) {
            if (Number(tech.options[i].value) === tid) {
                tech.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (found) {
            tech.value = String(tid);
        }
        aplicarTipoInferidoEnSelectCfgiTipo(nom, tipo);
    } finally {
        _syncing = false;
    }
}

/**
 * @returns {{ ok: boolean, mensaje?: string }}
 */
export function validarConsistenciaSelectoresTenantWizard() {
    const nom = document.getElementById('cfgi-nombre');
    const tech = document.getElementById('cfgi-tech-tenant-sel');
    const tipo = document.getElementById('cfgi-tipo');
    if (!nom || nom.tagName !== 'SELECT' || !tech || !tipo) return { ok: true };
    const idN = Number(nom.value);
    const idT = Number(tech.value);
    const tipoVal = String(tipo.value || '').trim();
    if (!Number.isFinite(idN) || idN < 1) {
        return { ok: false, mensaje: 'Elegí un tenant en «Tenant (nombre)».' };
    }
    if (!Number.isFinite(idT) || idT < 1) {
        return {
            ok: false,
            mensaje: 'Elegí el mismo tenant en «Tenant (clientes.id)» o tocá «Listar tenants».',
        };
    }
    if (idN !== idT) {
        return {
            ok: false,
            mensaje: 'Los selectores de tenant no coinciden: elegí el mismo id en ambos listados.',
        };
    }
    const row = byId(idN);
    if (!row) {
        return { ok: false, mensaje: 'No hay datos del tenant en memoria. Volvé a pulsar «Listar tenants».' };
    }
    const tipoEsperado = normalizarTipoNeonASelectValue(String(row.tipo || ''));
    if (tipoEsperado) {
        if (!tipoVal || tipoEsperado !== tipoVal) {
            return {
                ok: false,
                mensaje: `El tipo no coincide con el del tenant en Neon (${String(row.tipo || '').trim() || '—'}).`,
            };
        }
    } else if (!tipoVal) {
        return { ok: false, mensaje: 'Elegí el tipo de organismo.' };
    }
    return { ok: true };
}

export function initCfgiTenantSelectorsSync(opts) {
    if (opts?.toast) _toast = opts.toast;
    const tech = document.getElementById('cfgi-tech-tenant-sel');
    const nom = document.getElementById('cfgi-nombre');
    const tipo = document.getElementById('cfgi-tipo');
    if (!tech || !nom || nom.tagName !== 'SELECT') return;
    if (tech.dataset.gnCfgiSyncBound === '1') return;
    tech.dataset.gnCfgiSyncBound = '1';
    nom.dataset.gnCfgiSyncBound = '1';

    tech.addEventListener('change', () => {
        try {
            syncCfgiSelectorsFromTechTenantSel();
        } catch (e) {
            console.warn('[cfgi-sync]', e?.message || e);
        }
    });
    nom.addEventListener('change', () => {
        if (_syncing) return;
        try {
            syncCfgiSelectorsFromNombreSel();
        } catch (e) {
            console.warn('[cfgi-sync]', e?.message || e);
        }
    });
    if (tipo) {
        tipo.addEventListener('change', () => {
            const v = validarConsistenciaSelectoresTenantWizard();
            if (!v.ok && v.mensaje) _toast(v.mensaje, 'warning');
        });
    }
}
