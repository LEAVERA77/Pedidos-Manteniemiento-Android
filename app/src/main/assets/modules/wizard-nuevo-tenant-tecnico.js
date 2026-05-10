/**
 * Paso 1 wizard cfgi: crear fila nueva en clientes (solo técnico con clave).
 * POST /api/clientes/nuevo + refresco de selectores; mismo flujo logo/map/Finalizar.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import {
    poblarCfgiNombreSelect,
    aplicarTipoInferidoEnSelectCfgiTipo,
    normalizarTipoNeonASelectValue,
} from './cfgi-wizard-tenant-select.js';
import { alinearSelectoresCfgiTrasCargarLista } from './cfgi-wizard-tenant-selectors-sync.js';
import { getGnStoredTechnicianKey, persistGnTechnicianKeyForSession } from './gn-tenant-acceso-tecnico-unificado.js';
import { mostrarModalCredencialesAdminNuevoTenant } from './tenant-nuevo-admin-creds-ui.js';

function apiUrl(path) {
    return typeof window !== 'undefined' && typeof window.apiUrl === 'function' ? window.apiUrl(path) : String(path || '');
}

function techKeyActual() {
    return String(getGnStoredTechnicianKey() || document.getElementById('cfgi-tech-key')?.value || '').trim();
}

export function syncWizardNuevoTenantBlockVisibility(tecOk) {
    const w = document.getElementById('cfgi-nuevo-tenant-wrap');
    if (!w) return;
    w.style.display = tecOk ? '' : 'none';
    if (!tecOk) {
        const p = document.getElementById('cfgi-nuevo-tenant-panel');
        if (p) p.style.display = 'none';
    }
}

async function fetchListaTenants(k) {
    const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
    const headers = { 'X-GestorNova-Technician-Key': k };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(apiUrl('/api/setup/technician/tenants'), { headers, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error([j.error, j.detail].filter(Boolean).join(' — ') || `HTTP ${r.status}`);
    }
    return j.clientes || [];
}

async function crearNuevoTenantDesdePanel() {
    if (!window.__GN_CONFIG_TENANT_SOLO_TECNICO_OK) {
        toast('Solo personal técnico validado puede crear tenants.', 'error');
        return;
    }
    const k = techKeyActual();
    if (!k) {
        toast('Ingresá la clave de técnico en «Herramienta interna» o validala antes.', 'error');
        return;
    }
    const nombre = String(document.getElementById('cfgi-nuevo-tenant-nombre')?.value || '').trim();
    const tipo = String(document.getElementById('cfgi-nuevo-tenant-tipo')?.value || '').trim();
    if (nombre.length < 2) {
        toast('Nombre del tenant: mínimo 2 caracteres.', 'error');
        return;
    }
    if (!tipo) {
        toast('Elegí el tipo de negocio.', 'error');
        return;
    }
    const crearBtn = document.getElementById('cfgi-nuevo-tenant-crear');
    if (crearBtn) crearBtn.disabled = true;
    try {
        const r = await fetch(apiUrl('/api/clientes/nuevo'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GestorNova-Technician-Key': k,
            },
            body: JSON.stringify({ nombre, tipo }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw new Error([j.error, j.detail].filter(Boolean).join(' — ') || `HTTP ${r.status}`);
        }
        const cli = j.cliente;
        const newId = Number(cli?.id);
        if (!Number.isFinite(newId) || newId < 1) {
            throw new Error('Respuesta inválida del servidor');
        }
        const admin = j.admin_creado;
        const continuarTrasCrear = async () => {
            toast(`Tenant creado: ${String(cli.nombre || '').trim()} (#${newId})`, 'success');
            persistGnTechnicianKeyForSession(k);
            const list = await fetchListaTenants(k);
            const selNom = document.getElementById('cfgi-nombre');
            const selTech = document.getElementById('cfgi-tech-tenant-sel');
            const tipoEl = document.getElementById('cfgi-tipo');
            if (selTech) {
                selTech.innerHTML = '';
                (list || []).forEach((c) => {
                    const o = document.createElement('option');
                    o.value = String(c.id);
                    const nom = String(c.nombre || '').trim() || '—';
                    const tip = String(c.tipo || '').trim() || '—';
                    o.textContent = `${c.id} — ${nom} (${tip})`;
                    selTech.appendChild(o);
                });
                selTech.value = String(newId);
            }
            if (selNom?.tagName === 'SELECT' && tipoEl) {
                poblarCfgiNombreSelect(selNom, list, {
                    nombreActual: String(cli.nombre || '').trim(),
                    idActual: newId,
                });
                aplicarTipoInferidoEnSelectCfgiTipo(selNom, tipoEl);
                const tn = normalizarTipoNeonASelectValue(cli.tipo);
                if (tn && tipoEl) tipoEl.value = tn;
                alinearSelectoresCfgiTrasCargarLista(list);
            } else if (tipoEl && cli.tipo) {
                const tn = normalizarTipoNeonASelectValue(cli.tipo);
                if (tn) tipoEl.value = tn;
            }
            const tEl = document.getElementById('cfgi-tenant');
            if (tEl) tEl.textContent = 'tenant_id: ' + newId;
            const panel = document.getElementById('cfgi-nuevo-tenant-panel');
            if (panel) panel.style.display = 'none';
            const nmIn = document.getElementById('cfgi-nuevo-tenant-nombre');
            if (nmIn) nmIn.value = '';
            try {
                window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), nombre: String(cli.nombre || '').trim(), tipo: String(cli.tipo || '').trim() };
            } catch (_) {}
        };
        if (admin && admin.usuario && admin.password) {
            await mostrarModalCredencialesAdminNuevoTenant({
                usuario: admin.usuario,
                password: admin.password,
                nombre: admin.nombre,
                onContinue: continuarTrasCrear,
            });
        } else {
            await continuarTrasCrear();
        }
    } catch (e) {
        toast(String(e?.message || e) || 'No se pudo crear el tenant.', 'error');
    } finally {
        if (crearBtn) crearBtn.disabled = false;
    }
}

let _wired = false;

export function initWizardNuevoTenantTecnico() {
    if (_wired) return;
    _wired = true;
    const btn = document.getElementById('cfgi-nuevo-tenant');
    const panel = document.getElementById('cfgi-nuevo-tenant-panel');
    const cancel = document.getElementById('cfgi-nuevo-tenant-cancelar');
    const crear = document.getElementById('cfgi-nuevo-tenant-crear');
    if (btn && panel) {
        btn.addEventListener('click', () => {
            if (!window.__GN_CONFIG_TENANT_SOLO_TECNICO_OK) {
                toast('Solo el flujo técnico validado puede crear un tenant.', 'error');
                return;
            }
            const hidden = panel.style.display !== 'block';
            panel.style.display = hidden ? 'block' : 'none';
        });
    }
    if (cancel && panel) {
        cancel.addEventListener('click', () => {
            panel.style.display = 'none';
            const n = document.getElementById('cfgi-nuevo-tenant-nombre');
            if (n) n.value = '';
        });
    }
    if (crear) {
        crear.addEventListener('click', () => void crearNuevoTenantDesdePanel());
    }
}
