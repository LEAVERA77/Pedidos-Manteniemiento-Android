/**
 * Admin → Empresa: derivación gas, telefonía y filas Internet / TV (activo, nombre, WA).
 * Expone window.agregarFilaDerivacionLista para onclick en index.html.
 * made by leavera77
 */

const ROW_SEL = '.gn-cfg-deriv-list-row';

function containerId(kind) {
    return kind === 'internet' ? 'cfg-deriv-internet-rows' : 'cfg-deriv-tv-rows';
}

function apiKeyFor(kind) {
    return kind === 'internet' ? 'empresa_internet' : 'empresa_tv_cable';
}

function labelList(kind) {
    return kind === 'internet' ? 'Proveedor de internet' : 'Empresa de TV';
}

function normWa(normalizarFn, raw) {
    return normalizarFn(String(raw || '').trim());
}

function pushSlotSimple(out, slot, apiKey, labelCorto, normalizarFn) {
    const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
    const n = (document.getElementById(`cfg-deriv-${slot}-nombre`)?.value || '').trim().slice(0, 120);
    const wRaw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
    const w = normWa(normalizarFn, wRaw);
    if (act) {
        if (!w || !/^\+\d{8,22}$/.test(w)) {
            throw new Error(
                `${labelCorto}: con «activo» marcado, cargá WhatsApp internacional válido (+ y 8–22 dígitos).`
            );
        }
        out[apiKey] = { whatsapp: w, ...(n ? { nombre: n } : {}) };
    } else if (n || wRaw) {
        if (wRaw && (!w || !/^\+\d{8,22}$/.test(w))) {
            throw new Error(`${labelCorto}: WhatsApp inválido (usá + y solo dígitos).`);
        }
        if (n || w) {
            out[apiKey] = { ...(n ? { nombre: n } : {}), ...(w ? { whatsapp: w } : {}) };
        }
    }
}

function readListFromDom(kind, normalizarFn) {
    const host = document.getElementById(containerId(kind));
    if (!host) return [];
    const label = labelList(kind);
    const out = [];
    host.querySelectorAll(ROW_SEL).forEach((row, idx) => {
        const act = !!row.querySelector('[data-deriv-field="activo"]')?.checked;
        const n = (row.querySelector('[data-deriv-field="nombre"]')?.value || '').trim().slice(0, 120);
        const wRaw = (row.querySelector('[data-deriv-field="whatsapp"]')?.value || '').trim();
        const w = normWa(normalizarFn, wRaw);
        if (act) {
            if (!w || !/^\+\d{8,22}$/.test(w)) {
                throw new Error(
                    `${label} (fila ${idx + 1}): con «activo» marcado, cargá WhatsApp internacional válido (+ y 8–22 dígitos).`
                );
            }
            out.push({ whatsapp: w, ...(n ? { nombre: n } : {}) });
        } else if (n || wRaw) {
            if (wRaw && (!w || !/^\+\d{8,22}$/.test(w))) {
                throw new Error(`${label} (fila ${idx + 1}): WhatsApp inválido (usá + y solo dígitos).`);
            }
            if (n || w) {
                out.push({ ...(n ? { nombre: n } : {}), ...(w ? { whatsapp: w } : {}) });
            }
        }
    });
    return out;
}

/**
 * Igual criterio que energía/agua: payload para PUT mi-configuracion.
 */
export function construirDerivacionReclamosDesdeFormularioDerivacionesCompleto(normalizarWhatsappInternacionalDesdeInput) {
    const out = {};
    pushSlotSimple(out, 'energia', 'empresa_energia', 'Empresa de energía', normalizarWhatsappInternacionalDesdeInput);
    pushSlotSimple(out, 'agua', 'cooperativa_agua', 'Cooperativa de agua', normalizarWhatsappInternacionalDesdeInput);
    pushSlotSimple(out, 'gas', 'empresa_gas_natural', 'Gas natural', normalizarWhatsappInternacionalDesdeInput);
    pushSlotSimple(out, 'tel', 'empresa_telefonia', 'Telefonía', normalizarWhatsappInternacionalDesdeInput);
    const internet = readListFromDom('internet', normalizarWhatsappInternacionalDesdeInput);
    const tv = readListFromDom('tv', normalizarWhatsappInternacionalDesdeInput);
    out.empresa_internet = internet;
    out.empresa_tv_cable = tv;
    return out;
}

export function agregarFilaDerivacionLista(kind, deps) {
    if (kind !== 'internet' && kind !== 'tv') return;
    const host = document.getElementById(containerId(kind));
    if (!host) return;
    const row = document.createElement('div');
    row.className = 'gn-cfg-deriv-list-row';
    row.dataset.derivKind = kind;
    row.style.cssText =
        'margin-top:.45rem;padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.45rem;background:var(--bg)';
    const uid = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ph = kind === 'internet' ? 'Ej. Fibertel' : 'Ej. Cablevisión';
    row.innerHTML = `
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap">
      <input type="checkbox" id="cfg-deriv-${kind}-activo-${uid}" data-deriv-field="activo" aria-label="Activo">
      <label for="cfg-deriv-${kind}-activo-${uid}" style="margin:0;font-weight:600">Activo</label>
    </div>
    <div><label for="cfg-deriv-${kind}-nombre-${uid}">Nombre visible</label>
      <input id="cfg-deriv-${kind}-nombre-${uid}" data-deriv-field="nombre" type="text" maxlength="120" placeholder="${ph}"></div>
    <div style="margin-top:.35rem"><label for="cfg-deriv-${kind}-whatsapp-${uid}">WhatsApp internacional</label>
      <input id="cfg-deriv-${kind}-whatsapp-${uid}" data-deriv-field="whatsapp" type="tel" inputmode="tel" placeholder="543434540250" autocomplete="tel"></div>
    <div style="display:flex;gap:.35rem;margin-top:.45rem;flex-wrap:wrap">
      <button type="button" class="btn-sm primary" data-deriv-open-wa="1">Abrir WhatsApp</button>
      <button type="button" class="btn-sm" style="background:var(--bg);border:1px solid var(--bo)" data-deriv-remove="1">Quitar</button>
    </div>`;
    row.querySelector('[data-deriv-remove]')?.addEventListener('click', () => {
        row.remove();
        try {
            deps?.onChange?.();
        } catch (_) {}
    });
    row.querySelector('[data-deriv-open-wa]')?.addEventListener('click', () => {
        const ac = !!row.querySelector('[data-deriv-field="activo"]')?.checked;
        const wR = row.querySelector('[data-deriv-field="whatsapp"]')?.value || '';
        const w = normWa(deps.normalizarWhatsappInternacionalDesdeInput, wR);
        if (!ac) {
            deps.toast?.('Activá la fila para usar WhatsApp.', 'info');
            return;
        }
        if (!w || !/^\+\d{8,22}$/.test(w)) {
            deps.toast?.('WhatsApp no válido: usá formato internacional con + (8 a 22 dígitos).', 'error');
            return;
        }
        window.open(`https://wa.me/${w.slice(1)}`, '_blank', 'noopener,noreferrer');
    });
    ['activo', 'nombre', 'whatsapp'].forEach((f) => {
        const el = row.querySelector(`[data-deriv-field="${f}"]`);
        if (!el) return;
        const fire = () => {
            try {
                deps.setDerivacionesInlineError?.('');
            } catch (_) {}
            deps.onChange?.();
        };
        el.addEventListener('input', fire);
        el.addEventListener('change', fire);
    });
    host.appendChild(row);
    deps.onChange?.();
}

export function poblarDerivacionesListasDesdeCfg(dr, deps) {
    ['internet', 'tv'].forEach((kind) => {
        const host = document.getElementById(containerId(kind));
        if (!host) return;
        host.innerHTML = '';
        const key = apiKeyFor(kind);
        const arr = Array.isArray(dr?.[key]) ? dr[key] : [];
        arr.forEach((slot) => {
            agregarFilaDerivacionLista(kind, deps);
            const row = host.lastElementChild;
            if (!row || !slot) return;
            const act = !!(slot.whatsapp || slot.nombre);
            const cb = row.querySelector('[data-deriv-field="activo"]');
            if (cb) cb.checked = act;
            const nm = row.querySelector('[data-deriv-field="nombre"]');
            const wa = row.querySelector('[data-deriv-field="whatsapp"]');
            if (nm) nm.value = String(slot.nombre != null ? slot.nombre : '').trim();
            if (wa) wa.value = String(slot.whatsapp != null ? slot.whatsapp : '').trim();
        });
    });
    deps.onChange?.();
}

/** Habilita botón Abrir WhatsApp solo si activo + WA válido. */
export function refreshDerivacionListaWaButtons(normalizarWhatsappInternacionalDesdeInput) {
    ['internet', 'tv'].forEach((kind) => {
        const host = document.getElementById(containerId(kind));
        if (!host) return;
        host.querySelectorAll(ROW_SEL).forEach((row) => {
            const btn = row.querySelector('[data-deriv-open-wa]');
            if (!btn) return;
            const act = !!row.querySelector('[data-deriv-field="activo"]')?.checked;
            const wR = row.querySelector('[data-deriv-field="whatsapp"]')?.value || '';
            const w = normWa(normalizarWhatsappInternacionalDesdeInput, wR);
            const ok = /^\+\d{8,22}$/.test(w);
            btn.disabled = !(act && ok);
        });
    });
}

let _bindingsInstalled = false;

/**
 * @param {object} deps — normalizarWhatsappInternacionalDesdeInput, toast, setDerivacionesInlineError, onUiRefresh (p.ej. actualizarBotonesWhatsappDerivacionesUi)
 */
export function initDerivacionesReclamosAdminBindings(deps) {
    if (typeof window === 'undefined' || !deps?.normalizarWhatsappInternacionalDesdeInput) return;
    const wrap = () => {
        try {
            deps.onUiRefresh?.();
        } catch (_) {}
    };
    window.agregarFilaDerivacionLista = (k) => {
        agregarFilaDerivacionLista(k, {
            ...deps,
            onChange: wrap,
        });
    };
    if (_bindingsInstalled) return;
    _bindingsInstalled = true;
}
