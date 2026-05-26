/**
 * UI detalle pedido: geocerca y chat interno (cooperativa).
 * Fotos del trabajo: bloque clásico en detalle (p.fotos), no galería antes/después aquí.
 * made by leavera77
 */

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** HTML placeholder en detalle (#dmc). Colapsado por defecto (mejor scroll en Android). */
export function htmlOperativaTop3Section() {
    return `<details class="gn-dm-section-collapsible gn-operativa-top3-wrap" id="gn-operativa-top3-wrap">
<summary class="gn-dm-section-collapsible-sum"><i class="fas fa-hard-hat"></i> Coordinación en campo</summary>
<div id="gn-operativa-top3-host" class="gn-operativa-top3-host ds" style="margin-top:.35rem"></div>
</details>`;
}

function hostEl() {
    return document.getElementById('gn-operativa-top3-host');
}

function wrapEl() {
    return document.getElementById('gn-operativa-top3-wrap');
}

/** Tras abrir detalle desde toast de chat (admin). */
export function enfocarSeccionChatInternoDetalle(pedidoId) {
    const pid = String(pedidoId || '').trim();
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active') || String(dm.dataset.detallePedidoId || '') !== pid) return;

    const wrap = wrapEl();
    if (wrap && !wrap.open) {
        wrap.open = true;
    }

    const p = (() => {
        try {
            return window.app?.p?.find((x) => String(x.id) === pid) || null;
        } catch (_) {
            return null;
        }
    })();

    if (p && wrap && wrap.open && hostEl()?.dataset?.gnOpReady !== '1') {
        try {
            const u = window.app?.u;
            const esAdm = typeof window.esAdmin === 'function' && window.esAdmin();
            const esTec =
                typeof window.esTecnicoOSupervisor === 'function' && window.esTecnicoOSupervisor();
            const ed =
                esAdm ||
                String(p.ui) === String(u?.id) ||
                (esTec && p.tai != null && String(p.tai) === String(u?.id));
            const toastFn = typeof window.toast === 'function' ? window.toast : () => {};
            mountPedidoOperativaTop3UINow(p, { ed, esAdmin: esAdm, toast: toastFn });
        } catch (_) {}
    }

    const target =
        document.getElementById('gn-op-chat-input') ||
        document.getElementById('gn-op-chat-msgs') ||
        hostEl();
    if (!target) return;

    try {
        if (typeof esAndroidShell === 'function' && esAndroidShell()) {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } catch (_) {}

    const inp = document.getElementById('gn-op-chat-input');
    if (inp && !inp.disabled) {
        try {
            inp.focus({ preventScroll: true });
        } catch (_) {
            try {
                inp.focus();
            } catch (_) {}
        }
    }
}

function esAndroidShell() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

async function obtenerUbicacionDispositivo() {
    return new Promise((resolve, reject) => {
        const cbName = `__gnGeoCb_${Date.now()}`;
        window[cbName] = (payload) => {
            try {
                delete window[cbName];
            } catch (_) {}
            if (payload && payload.ok && Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) {
                resolve({ lat: payload.lat, lng: payload.lng });
            } else {
                reject(new Error(payload?.error || 'No se pudo obtener ubicación'));
            }
        };
        try {
            if (window.AndroidDevice && typeof window.AndroidDevice.getCurrentLocationForGeocerca === 'function') {
                window.AndroidDevice.getCurrentLocationForGeocerca(`window.${cbName}`);
                setTimeout(() => {
                    if (window[cbName]) {
                        delete window[cbName];
                        reject(new Error('Tiempo de espera GPS'));
                    }
                }, 25000);
                return;
            }
        } catch (_) {}
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(err || new Error('GPS no disponible')),
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
            );
            return;
        }
        reject(new Error('GPS no disponible en este dispositivo'));
    });
}

/**
 * Verifica geocerca antes de pasar a ejecución.
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function verificarGeocercaAntesIniciarPedido(pedidoId) {
    if (typeof window.gnOperativaGeocercaVerificar !== 'function') {
        return { ok: true };
    }
    try {
        const { lat, lng } = await obtenerUbicacionDispositivo();
        const r = await window.gnOperativaGeocercaVerificar(pedidoId, lat, lng);
        if (r && r.permitido === false) {
            const d = r.distancia_metros != null ? Math.round(r.distancia_metros) : '?';
            const m = r.max_metros != null ? r.max_metros : 100;
            return {
                ok: false,
                message: `Estás a ~${d} m del reclamo (máximo ${m} m). Acercate al lugar para iniciar.`,
            };
        }
        return { ok: true };
    } catch (e) {
        return {
            ok: false,
            message: (e && e.message) || 'No se pudo verificar la geocerca. Revisá GPS y permisos.',
        };
    }
}

async function cargarChat(pid) {
    const box = document.getElementById('gn-op-chat-msgs');
    if (!box || typeof window.gnOperativaChatListar !== 'function') return;
    try {
        const rows = await window.gnOperativaChatListar(pid);
        if (!rows?.length) {
            box.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin mensajes aún.</p>';
            return;
        }
        box.innerHTML = rows
            .map((m) => {
                const who = esc(m.autor_nombre || m.autor_rol || 'Usuario');
                const when = m.created_at
                    ? new Date(m.created_at).toLocaleString('es-AR', { hour12: false })
                    : '';
                return `<div class="gn-op-chat-line" style="margin:.35rem 0;font-size:.82rem"><strong>${who}</strong> <span style="color:var(--tl);font-size:.72rem">${esc(when)}</span><br>${esc(m.cuerpo || '')}</div>`;
            })
            .join('');
        box.scrollTop = box.scrollHeight;
    } catch (e) {
        box.innerHTML = `<p style="color:var(--re);font-size:.8rem">${esc(e.message || 'Error al cargar chat')}</p>`;
    }
}

async function cargarEventosGeocerca(pid, esAdmin) {
    const el = document.getElementById('gn-op-geocerca-log');
    if (!el || !esAdmin || typeof window.gnOperativaGeocercaEventos !== 'function') return;
    try {
        const rows = await window.gnOperativaGeocercaEventos(pid);
        if (!rows?.length) {
            el.innerHTML = '<p style="font-size:.75rem;color:var(--tl)">Sin intentos registrados.</p>';
            return;
        }
        el.innerHTML =
            '<table style="width:100%;font-size:.72rem;border-collapse:collapse">' +
            '<tr><th>Fecha</th><th>Usuario</th><th>m</th><th>OK</th></tr>' +
            rows
                .slice(0, 15)
                .map((e) => {
                    const ok = e.permitido ? '✓' : '✗';
                    const f = e.created_at ? new Date(e.created_at).toLocaleString('es-AR', { hour12: false }) : '';
                    return `<tr><td>${esc(f)}</td><td>${esc(e.usuario_nombre || e.usuario_id)}</td><td>${esc(e.distancia_metros)}</td><td>${ok}</td></tr>`;
                })
                .join('') +
            '</table>';
    } catch (e) {
        el.innerHTML = `<p style="font-size:.75rem;color:var(--re)">${esc(e.message || '')}</p>`;
    }
}

/**
 * @param {object} p pedido normalizado
 * @param {{ ed: boolean, esAdmin: boolean, toast?: Function }} ctx
 */
export function mountPedidoOperativaTop3UI(p, ctx = {}) {
    const wrap = wrapEl();
    if (!wrap || !p?.id) return;
    const pidKey = String(p.id);
    if (!Number.isFinite(parseInt(p.id, 10)) || pidKey.startsWith('off_')) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';

    if (esAndroidShell()) {
        if (wrap.dataset.gnOpMountedPid === pidKey && hostEl()?.dataset?.gnOpReady === '1') {
            return;
        }
        if (wrap._gnOpToggleHandler) {
            try {
                wrap.removeEventListener('toggle', wrap._gnOpToggleHandler);
            } catch (_) {}
        }
        wrap.dataset.gnOpMountedPid = pidKey;
        wrap._gnOpToggleHandler = () => {
            if (!wrap.open) return;
            mountPedidoOperativaTop3UINow(p, ctx);
        };
        wrap.addEventListener('toggle', wrap._gnOpToggleHandler);
        if (wrap.open) {
            mountPedidoOperativaTop3UINow(p, ctx);
        }
        return;
    }
    mountPedidoOperativaTop3UINow(p, ctx);
}

function mountPedidoOperativaTop3UINow(p, ctx = {}) {
    const host = hostEl();
    const wrap = wrapEl();
    if (!host || !p?.id) return;
    const pid = parseInt(p.id, 10);
    if (!Number.isFinite(pid) || pid < 1 || String(p.id).startsWith('off_')) {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    if (wrap) wrap.style.display = '';
    const ed = !!ctx.ed;
    const esAdmin = !!ctx.esAdmin;
    const toastFn = typeof ctx.toast === 'function' ? ctx.toast : () => {};

    host.dataset.gnOpReady = '1';
    host.innerHTML = `
<div class="gn-op-block">
  <h4 style="margin:0 0 .4rem;font-size:.9rem"><i class="fas fa-map-pin"></i> Geocerca</h4>
  <p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Al poner en ejecución se valida que estés cerca del reclamo (si está habilitada en Empresa).</p>
  ${esAdmin ? '<div id="gn-op-geocerca-log" style="margin-top:.35rem"></div>' : ''}
</div>
<div class="gn-op-block" style="margin-top:.75rem">
  <h4 style="margin:0 0 .4rem;font-size:.9rem"><i class="fas fa-comments"></i> Chat interno</h4>
  <div id="gn-op-chat-msgs" class="gn-op-chat-msgs" style="max-height:160px;overflow:auto;border:1px solid var(--bo);border-radius:.4rem;padding:.45rem;background:var(--bg)"></div>
  ${
      ed
          ? `<div style="display:flex;gap:.35rem;margin-top:.4rem;flex-wrap:wrap;align-items:center">
    <input type="text" id="gn-op-chat-input" maxlength="4000" placeholder="Mensaje para admin o técnico…" style="flex:1;min-width:8rem;padding:.4rem;border:1px solid var(--bo);border-radius:.4rem">
    <button type="button" class="btn-sm primary" id="gn-op-chat-send">Enviar</button>
    ${esAndroidShell() ? '<button type="button" class="btn-sm" id="gn-op-chat-float-open" title="Abrir chat flotante en el mapa"><i class="fas fa-external-link-alt"></i> Panel</button>' : ''}
  </div>`
          : esAndroidShell()
            ? `<p style="font-size:.78rem;color:var(--tm);margin:.35rem 0 0"><button type="button" class="btn-sm" id="gn-op-chat-float-open"><i class="fas fa-comments"></i> Abrir chat con el equipo</button></p>`
            : ''
  }
</div>`;

    void cargarChat(pid);
    void cargarEventosGeocerca(pid, esAdmin);

    document.getElementById('gn-op-chat-send')?.addEventListener('click', async () => {
        const inp = document.getElementById('gn-op-chat-input');
        const txt = String(inp?.value || '').trim();
        if (!txt) return;
        try {
            await window.gnOperativaChatEnviar(pid, txt);
            if (inp) inp.value = '';
            toastFn('Mensaje enviado', 'success');
            await cargarChat(pid);
        } catch (e) {
            toastFn(e.message || 'No se pudo enviar', 'error');
        }
    });

    document.getElementById('gn-op-chat-float-open')?.addEventListener('click', () => {
        try {
            if (typeof window.gnAbrirPedidoChatInternoFloat === 'function') {
                window.gnAbrirPedidoChatInternoFloat(pid);
            }
        } catch (_) {}
    });
}
