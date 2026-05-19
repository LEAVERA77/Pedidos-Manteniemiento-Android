/**
 * UI detalle pedido: geocerca, chat interno, fotos antes/después (Top 3 cooperativa).
 * made by leavera77
 */

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** HTML placeholder en detalle (#dmc). */
export function htmlOperativaTop3Section() {
    return `<details class="gn-dm-section-collapsible gn-operativa-top3-wrap" id="gn-operativa-top3-wrap" open>
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

async function cargarFotos(pid) {
    const grid = document.getElementById('gn-op-fotos-grid');
    if (!grid || typeof window.gnOperativaFotosListar !== 'function') return;
    try {
        const rows = await window.gnOperativaFotosListar(pid);
        if (!rows?.length) {
            grid.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin fotos clasificadas.</p>';
            return;
        }
        grid.innerHTML = rows
            .map(
                (f) =>
                    `<a href="${esc(f.url_cloudinary)}" target="_blank" rel="noopener" style="display:block"><img src="${esc(f.url_cloudinary)}" alt="${esc(f.tipo)}" loading="lazy" decoding="async" style="width:100%;max-height:120px;object-fit:cover;border-radius:.35rem;border:1px solid var(--bo)"/><span style="font-size:.7rem;color:var(--tl)">${esc(f.tipo)} #${(f.orden ?? 0) + 1}</span></a>`
            )
            .join('');
    } catch (e) {
        grid.innerHTML = `<p style="color:var(--re);font-size:.8rem">${esc(e.message || 'Error')}</p>`;
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

function leerArchivosComoBase64(fileList, max = 6) {
    const files = Array.from(fileList || []).slice(0, max);
    return Promise.all(
        files.map(
            (file) =>
                new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result || ''));
                    r.onerror = () => reject(new Error('No se pudo leer imagen'));
                    r.readAsDataURL(file);
                })
        )
    );
}

/**
 * @param {object} p pedido normalizado
 * @param {{ ed: boolean, esAdmin: boolean, toast?: Function }} ctx
 */
export function mountPedidoOperativaTop3UI(p, ctx = {}) {
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
          ? `<div style="display:flex;gap:.35rem;margin-top:.4rem">
    <input type="text" id="gn-op-chat-input" maxlength="4000" placeholder="Mensaje para el equipo…" style="flex:1;padding:.4rem;border:1px solid var(--bo);border-radius:.4rem">
    <button type="button" class="btn-sm primary" id="gn-op-chat-send">Enviar</button>
  </div>`
          : ''
  }
</div>
<div class="gn-op-block" style="margin-top:.75rem">
  <h4 style="margin:0 0 .4rem;font-size:.9rem"><i class="fas fa-images"></i> Fotos antes / después</h4>
  <div id="gn-op-fotos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:.4rem"></div>
  ${
      ed && p.es === 'En ejecución'
          ? `<div style="margin-top:.45rem;display:flex;flex-wrap:wrap;gap:.35rem;align-items:center">
    <select id="gn-op-foto-tipo" style="padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
      <option value="antes">Antes</option>
      <option value="despues">Después</option>
      <option value="otro">Otro</option>
    </select>
    <input type="file" id="gn-op-foto-files" accept="image/*" multiple style="max-width:12rem;font-size:.75rem">
    <button type="button" class="btn-sm primary" id="gn-op-foto-subir">Subir</button>
  </div>`
          : ''
  }
</div>`;

    void cargarChat(pid);
    void cargarFotos(pid);
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

    document.getElementById('gn-op-foto-subir')?.addEventListener('click', async () => {
        const tipo = document.getElementById('gn-op-foto-tipo')?.value || 'otro';
        const files = document.getElementById('gn-op-foto-files')?.files;
        if (!files?.length) {
            toastFn('Elegí al menos una imagen', 'warning');
            return;
        }
        try {
            const b64 = await leerArchivosComoBase64(files);
            await window.gnOperativaFotosSubir(pid, tipo, b64);
            toastFn('Fotos subidas', 'success');
            document.getElementById('gn-op-foto-files').value = '';
            await cargarFotos(pid);
        } catch (e) {
            toastFn(e.message || 'Error al subir', 'error');
        }
    });
}
