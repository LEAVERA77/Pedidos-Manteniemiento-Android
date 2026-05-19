/**
 * Panel admin operaciones geocodificación WhatsApp.
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setGnWaGeoOpsPanelDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function esAdmin() {
    return typeof _deps?.esAdmin === 'function' && _deps.esAdmin();
}

function modoOffline() {
    return !!_deps?.modoOffline?.();
}

function getApiToken() {
    return _deps?.getApiToken?.();
}

function apiUrl(p) {
    return _deps?.apiUrl?.(p);
}


/** Polling lista operaciones geocod WA (panel admin abierto). */
let _gnWaGeoOpsPollTimer = null;
/** Usuario pausó explícitamente el auto-refresh. */
let _gnWaGeoOpsUserPaused = false;

function _gnWaGeoOpsListHasOpenDetails(listEl) {
    if (!listEl) return false;
    try {
        return !!listEl.querySelector('details.gn-wa-geo-op[open]');
    } catch (_) {
        return false;
    }
}

function _gnWaGeoOpsShouldSkipAutoRefresh(listEl) {
    return _gnWaGeoOpsUserPaused || _gnWaGeoOpsListHasOpenDetails(listEl);
}

export function _gnWaGeoOpsSyncPauseButtonUi() {
    const btn = document.getElementById('gn-wa-geo-ops-pause');
    if (!btn) return;
    const paused = _gnWaGeoOpsUserPaused;
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.textContent = paused ? 'Reanudar auto' : 'Pausar auto';
    btn.title = paused ? 'Reanudar actualización automática cada ~2,5 s' : 'Pausar el refresco automático (podés seguir leyendo o copiando)';
}

function _gnEscWaHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Admin: GET /api/admin/geocod-wa-operaciones (últimas N filas del tenant).
 * @param {boolean} [force] — si true, ignora pausa y `<details open>` (p. ej. "Actualizar ahora").
 */
export function gnWaGeoOpsRefresh(force) {
    const wrap = document.getElementById('gn-wa-geo-ops-list');
    if (!wrap) return;
    if (typeof esAdmin !== 'function' || !esAdmin()) {
        wrap.innerHTML = '';
        return;
    }
    if (modoOffline) {
        wrap.innerHTML = '<p class="gn-wa-geo-ops-msg">No disponible en modo offline.</p>';
        return;
    }
    const tok = getApiToken();
    if (!tok) {
        wrap.innerHTML = '<p class="gn-wa-geo-ops-msg">Iniciá sesión para ver operaciones del servidor.</p>';
        return;
    }
    if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) {
        return;
    }
    (async () => {
        try {
            const r = await fetch(apiUrl('/api/admin/geocod-wa-operaciones?limit=15'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (!r.ok) {
                if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
                wrap.innerHTML = `<p class="gn-wa-geo-ops-msg">${_gnEscWaHtml(`No se pudo cargar (${r.status}).`)}</p>`;
                return;
            }
            const j = await r.json();
            const items = j.items || [];
            if (!items.length) {
                if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
                wrap.innerHTML =
                    '<p class="gn-wa-geo-ops-msg">Sin operaciones recientes (o migración <code>geocod_wa_operaciones</code> pendiente en la API).</p>';
                return;
            }
            if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
            wrap.innerHTML = items
                .map((row) => {
                    const st = String(row.estado || '');
                    const cid = String(row.correlation_id || '');
                    const pasos = Array.isArray(row.pasos) ? row.pasos : [];
                    const last = pasos.length ? pasos[pasos.length - 1] : null;
                    const lastSlug = last && last.slug ? last.slug : '—';
                    const phone = row.telefono_masked || '—';
                    const t0 = row.started_at ? new Date(row.started_at).toLocaleString('es-AR') : '';
                    let badge = 'En curso';
                    let badgeClass = 'gn-wa-badge-run';
                    if (st === 'ok') {
                        badge = 'OK';
                        badgeClass = 'gn-wa-badge-ok';
                    } else if (st === 'error') {
                        badge = 'Error';
                        badgeClass = 'gn-wa-badge-err';
                    }
                    const fuente = row.fuente_final ? _gnEscWaHtml(String(row.fuente_final)) : '';
                    const errBlock = row.mensaje_error
                        ? `<p class="gn-wa-geo-op-err">${_gnEscWaHtml(String(row.mensaje_error).slice(0, 2000))}</p>`
                        : '';
                    const preLines = pasos
                        .slice(-40)
                        .map((p) => _gnEscWaHtml(JSON.stringify(p)))
                        .join('\n');
                    const ms = last && last.ms != null ? ` · ${last.ms} ms` : '';
                    const pedidoLine =
                        row.numero_pedido || row.pedido_id
                            ? `<p class="gn-wa-geo-op-last">Pedido: ${_gnEscWaHtml(String(row.numero_pedido || row.pedido_id || ''))}</p>`
                            : '';
                    return `<details class="gn-wa-geo-op"><summary><span class="${badgeClass}">${_gnEscWaHtml(badge)}</span> · ${_gnEscWaHtml(phone)} · <code>${_gnEscWaHtml(cid)}</code> · ${_gnEscWaHtml(t0)}${fuente ? ` · ${fuente}` : ''}</summary><div class="gn-wa-geo-op-body"><p class="gn-wa-geo-op-last">Último paso: <code>${_gnEscWaHtml(String(lastSlug))}</code>${_gnEscWaHtml(ms)}</p>${pedidoLine}<pre class="gn-wa-geo-op-pre">${preLines}</pre>${errBlock}</div></details>`;
                })
                .join('');
        } catch (e) {
            if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
            wrap.innerHTML = `<p class="gn-wa-geo-ops-msg">${_gnEscWaHtml(String(e && e.message ? e.message : e))}</p>`;
        }
    })();
}

export function gnWaGeoOpsStartPoll() {
    gnWaGeoOpsStopPoll();
    gnWaGeoOpsRefresh(true);
    _gnWaGeoOpsPollTimer = setInterval(() => gnWaGeoOpsRefresh(false), 2500);
}

export function gnWaGeoOpsStopPoll() {
    if (_gnWaGeoOpsPollTimer) {
        clearInterval(_gnWaGeoOpsPollTimer);
        _gnWaGeoOpsPollTimer = null;
    }
}

let _gnWaGeoOpsDockBound = false;

export function gnWaGeoOpsBindControlsOnce() {
    if (_gnWaGeoOpsDockBound) return;
    _gnWaGeoOpsDockBound = true;
    document.getElementById('gn-wa-geo-ops-refresh')?.addEventListener('click', () => gnWaGeoOpsRefresh(true));
    document.getElementById('gn-wa-geo-ops-pause')?.addEventListener('click', () => {
        _gnWaGeoOpsUserPaused = !_gnWaGeoOpsUserPaused;
        _gnWaGeoOpsSyncPauseButtonUi();
        if (!_gnWaGeoOpsUserPaused) gnWaGeoOpsRefresh(false);
    });
    _gnWaGeoOpsSyncPauseButtonUi();
}
