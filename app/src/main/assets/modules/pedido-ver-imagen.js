/**
 * Sección «Imagen del reclamo» en el modal #dm (detalle de pedido).
 * Integración: se invoca desde `pedido-volver-pendiente.js` tras `detalle()` (sin tocar app.js).
 * made by leavera77
 */

/** @type {Map<string, string[]>} */
const _fotoSrcCache = new Map();

function esUrlHttp(u) {
    return /^https?:\/\//i.test(String(u || '').trim());
}

function esDataImagen(u) {
    return /^data:image\//i.test(String(u || '').trim());
}

/** Cloudinary / https / data URI / base64 crudo (foto_base64 en BD). */
export function normalizarSrcImagenReclamo(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (!t) return null;
    if (esUrlHttp(t) || esDataImagen(t)) return t;
    const b64clean = t.replace(/\s/g, '');
    if (/^[a-z0-9+/=]+$/i.test(b64clean) && b64clean.length >= 32) {
        return `data:image/jpeg;base64,${b64clean}`;
    }
    return null;
}

/**
 * Primera imagen desde `foto_urls` (Neon / API), sin pasar por `norm()`.
 * Texto con `||` o array de URLs.
 */
export function primeraUrlDesdeFotoUrlsCampo(raw) {
    if (raw == null) return null;
    let joined;
    if (Array.isArray(raw)) {
        joined = raw.map((x) => String(x).trim()).filter(Boolean).join('||');
    } else {
        joined = String(raw).trim();
    }
    if (!joined) return null;
    const parts = joined.split('||').map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
        const hit = normalizarSrcImagenReclamo(part);
        if (hit) return hit;
    }
    return null;
}

/** Varias fotos en un solo campo TEXT, separador `||` (como `foto_base64` en BD). */
export function primeraUrlDesdeFotoBase64Campo(raw) {
    if (raw == null) return null;
    const joined = Array.isArray(raw)
        ? raw.map((x) => String(x).trim()).filter(Boolean).join('||')
        : String(raw).trim();
    if (!joined) return null;
    const parts = joined.split('||').map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
        const hit = normalizarSrcImagenReclamo(part);
        if (hit) return hit;
    }
    return null;
}

/** Primera imagen: `foto_urls` → `foto_base64` → otros campos → `p.fotos` al final (suele venir vacío por norm()). */
export function primeraUrlImagenReclamoPedido(p) {
    if (!p || typeof p !== 'object') return null;
    const desdeUrls = primeraUrlDesdeFotoUrlsCampo(p.foto_urls);
    if (desdeUrls) return desdeUrls;
    const desdeB64 = primeraUrlDesdeFotoBase64Campo(p.foto_base64);
    if (desdeB64) return desdeB64;
    for (const k of ['imagen_url', 'foto_url', 'imagen', 'media_url', 'attachment_url']) {
        const hit = normalizarSrcImagenReclamo(p[k]);
        if (hit) return hit;
    }
    const arr = Array.isArray(p.fotos) ? p.fotos : [];
    for (const u of arr) {
        const hit = normalizarSrcImagenReclamo(u);
        if (hit) return hit;
    }
    return null;
}

/** API suele mandar `fotos` como array; Neon/sql puede traer string JSON. */
function coerceFotosArray(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
    const s = String(val).trim();
    if (!s) return [];
    if (s.startsWith('[')) {
        try {
            const j = JSON.parse(s);
            if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
        } catch (_) {}
    }
    return [];
}

function listaImagenesDesdeRowPedido(row) {
    const out = [];
    const pushNorm = (x) => {
        const n = normalizarSrcImagenReclamo(x);
        if (n) out.push(n);
    };
    /* 1) foto_urls (Neon / Cloudinary), 2) foto_base64, 3) legacy, 4) row.fotos (derivado de URLs en API) */
    String(row.foto_urls || '')
        .split('||')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => pushNorm(x));
    String(row.foto_base64 || '')
        .split('||')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => pushNorm(x));
    for (const k of ['foto_url', 'imagen_url', 'media_url', 'attachment_url']) {
        if (row[k] != null && String(row[k]).trim()) pushNorm(row[k]);
    }
    coerceFotosArray(row.fotos).forEach((x) => pushNorm(x));
    return out;
}

function normalizarRotacionGrados(n) {
    const x = Math.round(Number(n) || 0);
    return ((x % 360) + 360) % 360;
}

function crearBotonToolbar(texto, titulo, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.title = titulo || texto;
    b.style.cssText =
        'font-size:.72rem;padding:.35rem .55rem;border:1px solid var(--bo);border-radius:6px;background:var(--bg);cursor:pointer;color:inherit;line-height:1.2';
    b.addEventListener('click', onClick);
    return b;
}

function actualizarEstadoBotonGuardarRotacion(btn, rotationDeg, savedRotation, puedePersistir) {
    if (!btn) return;
    const iguales = normalizarRotacionGrados(rotationDeg) === normalizarRotacionGrados(savedRotation);
    btn.disabled = !puedePersistir || iguales;
    btn.style.opacity = btn.disabled ? '0.45' : '1';
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
}

function descargarOAbrirImagenReclamo(src, pedidoId) {
    const base = pedidoId ? `reclamo-pedido-${pedidoId}` : 'reclamo';
    try {
        if (esUrlHttp(src)) {
            window.open(src, '_blank', 'noopener,noreferrer');
            return;
        }
        const a = document.createElement('a');
        a.href = src;
        a.download = `${base}.jpg`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (_) {
        if (typeof window.toast === 'function') window.toast('No se pudo descargar la imagen.', 'error');
    }
}

async function persistirRotacionReclamoApi(pedidoId, grados) {
    const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
    const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
    if (!tok || !apiUrlFn) throw new Error('Sin sesión API');
    const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(pedidoId)}/reclamo-imagen-rotacion`), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${tok}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reclamo_imagen_rotacion: normalizarRotacionGrados(grados) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        const msg = j.error || j.detail || `Error ${r.status}`;
        throw new Error(msg);
    }
    return j;
}

function sincronizarRotacionEnListaPedidosApp(pedidoId, grados) {
    try {
        const list = window.app?.p;
        if (!Array.isArray(list) || pedidoId == null) return;
        const hit = list.find((x) => x && String(x.id) === String(pedidoId));
        if (hit) hit.reclamo_imagen_rotacion = normalizarRotacionGrados(grados);
    } catch (_) {}
}

function encontrarSeccionUbicacion(scroll) {
    if (!scroll) return null;
    const bloques = scroll.querySelectorAll(':scope > .ds');
    for (const ds of bloques) {
        const h4 = ds.querySelector(':scope > h4');
        const t = String(h4?.textContent || '');
        if (/Ubicación/i.test(t) || /📍/.test(t)) return ds;
    }
    return null;
}

/** Contenedor de scroll del detalle: hijo de `#dmc` que rellena `detalle()`. */
function obtenerContenedorScrollDetallePedido() {
    const dmc = document.getElementById('dmc');
    if (!dmc) return null;
    return dmc.querySelector('.gn-dm-detail-scroll') || dmc;
}

/**
 * Inserta el bloque de imagen en el modal (`#dmc` / `.gn-dm-detail-scroll`).
 * @param {string} src
 * @param {{ pedidoId?: string|number, reclamo_imagen_rotacion?: number }} [meta]
 */
function insertarImagenReclamoEnDOM(src, meta = {}) {
    if (!src) return;
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();

    const scroll = obtenerContenedorScrollDetallePedido();
    if (!scroll) return;

    const pedidoId = meta.pedidoId != null ? String(meta.pedidoId).trim() : '';
    const puedePersistir = Boolean(pedidoId && !pedidoId.startsWith('off_'));

    let savedRotation = normalizarRotacionGrados(meta.reclamo_imagen_rotacion);
    let rotationDeg = savedRotation;
    let scale = 1;

    const wrap = document.createElement('div');
    wrap.id = 'gn-pedido-imagen-reclamo';
    wrap.className = 'ds';

    const h = document.createElement('h4');
    h.textContent = '📸 Imagen del reclamo';

    const inner = document.createElement('div');
    inner.style.marginTop = '0.5rem';

    const imgHost = document.createElement('div');
    imgHost.style.cssText =
        'margin-top:0.35rem;overflow:auto;max-height:440px;display:flex;justify-content:center;align-items:center;padding:6px;border-radius:10px;border:1px solid var(--bo);background:var(--bg);';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Foto del reclamo';
    img.draggable = false;
    img.style.cssText =
        'max-width:100%;max-height:400px;border-radius:8px;cursor:pointer;display:block;transform-origin:center center;transition:transform 0.12s ease-out';

    const aplicarTransform = () => {
        img.style.transform = `rotate(${rotationDeg}deg) scale(${scale})`;
    };
    aplicarTransform();

    img.addEventListener('click', () => {
        try {
            if (esUrlHttp(src)) window.open(src, '_blank', 'noopener,noreferrer');
        } catch (_) {}
    });

    img.addEventListener('error', () => {
        imgHost.innerHTML =
            '<p style="font-size:.8rem;color:var(--tl);padding:.5rem">No se pudo cargar la imagen.</p>';
    });

    imgHost.appendChild(img);

    const bar = document.createElement('div');
    bar.className = 'gn-pedido-img-toolbar';
    bar.style.cssText =
        'display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.55rem;align-items:center';

    const btnZoomIn = crearBotonToolbar('🔍 Zoom in (+)', 'Acercar (máx. 200%)', () => {
        scale = Math.min(2, Math.round(scale * 1.15 * 100) / 100);
        aplicarTransform();
    });
    const btnZoomOut = crearBotonToolbar('🔍 Zoom out (−)', 'Alejar (mín. 50%)', () => {
        scale = Math.max(0.5, Math.round((scale / 1.15) * 100) / 100);
        aplicarTransform();
    });
    const btnReset = crearBotonToolbar('📐 Reset', 'Volver al tamaño original (zoom 100%)', () => {
        scale = 1;
        aplicarTransform();
    });
    const btnRot = crearBotonToolbar('↻ Rotar 90°', 'Rotar 90° horario (acumulable)', () => {
        rotationDeg += 90;
        aplicarTransform();
        actualizarEstadoBotonGuardarRotacion(btnSaveRot, rotationDeg, savedRotation, puedePersistir);
    });
    const btnDl = crearBotonToolbar('💾 Guardar (descargar)', 'Abrir URL en pestaña nueva o descargar imagen', () =>
        descargarOAbrirImagenReclamo(src, pedidoId)
    );
    const btnSaveRot = crearBotonToolbar(
        '💾 Guardar rotación en BD',
        'Persistir el ángulo de rotación en el servidor',
        async () => {
            if (!puedePersistir) return;
            btnSaveRot.disabled = true;
            try {
                await persistirRotacionReclamoApi(pedidoId, rotationDeg);
                savedRotation = normalizarRotacionGrados(rotationDeg);
                sincronizarRotacionEnListaPedidosApp(pedidoId, savedRotation);
                actualizarEstadoBotonGuardarRotacion(btnSaveRot, rotationDeg, savedRotation, puedePersistir);
                if (typeof window.toast === 'function') window.toast('Rotación guardada.', 'success', 2800);
            } catch (e) {
                const msg = e && e.message ? String(e.message) : 'Error al guardar';
                if (typeof window.toast === 'function') window.toast(msg, 'error', 5000);
                actualizarEstadoBotonGuardarRotacion(btnSaveRot, rotationDeg, savedRotation, puedePersistir);
            }
        }
    );
    actualizarEstadoBotonGuardarRotacion(btnSaveRot, rotationDeg, savedRotation, puedePersistir);

    bar.appendChild(btnZoomIn);
    bar.appendChild(btnZoomOut);
    bar.appendChild(btnReset);
    bar.appendChild(btnRot);
    bar.appendChild(btnDl);
    bar.appendChild(btnSaveRot);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:.72rem;color:var(--tm);margin-top:.4rem';
    hint.textContent =
        'Zoom 50–200 %. Clic en la imagen: vista completa (URL). «Guardar rotación en BD» solo si cambiaste el ángulo.';

    inner.appendChild(imgHost);
    inner.appendChild(bar);
    inner.appendChild(hint);
    wrap.appendChild(h);
    wrap.appendChild(inner);

    const ubic = encontrarSeccionUbicacion(scroll);
    if (ubic) {
        scroll.insertBefore(wrap, ubic);
    } else {
        scroll.appendChild(wrap);
    }
}

/**
 * GET `/api/pedidos/:id` o caché: **no modifica `p`**; renderiza con `row` / caché vía `insertarImagenReclamoEnDOM`.
 */
async function enriquecerFotosHttpDesdeApiSiFalta(p) {
    const id = p?.id != null ? String(p.id) : '';
    if (!id || id.startsWith('off_')) return;

    if (_fotoSrcCache.has(id)) {
        const list = _fotoSrcCache.get(id);
        const src = list?.[0];
        if (src)
            insertarImagenReclamoEnDOM(src, {
                pedidoId: id,
                reclamo_imagen_rotacion: p?.reclamo_imagen_rotacion,
            });
        return;
    }

    try {
        const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
        const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
        if (!tok || !apiUrlFn) return;
        const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(id)}`), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) return;
        const row = await r.json();
        const merged = listaImagenesDesdeRowPedido(row);
        if (merged.length) _fotoSrcCache.set(id, merged);
        const src =
            merged[0] ||
            primeraUrlDesdeFotoUrlsCampo(row.foto_urls) ||
            primeraUrlDesdeFotoBase64Campo(row.foto_base64);
        if (src)
            insertarImagenReclamoEnDOM(src, {
                pedidoId: id,
                reclamo_imagen_rotacion: row.reclamo_imagen_rotacion ?? p?.reclamo_imagen_rotacion,
            });
    } catch (_) {}
}

export async function injectPedidoVerImagenReclamo(p) {
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();

    const srcLocal = primeraUrlImagenReclamoPedido(p);
    if (srcLocal) {
        insertarImagenReclamoEnDOM(srcLocal, {
            pedidoId: p?.id,
            reclamo_imagen_rotacion: p?.reclamo_imagen_rotacion,
        });
        return;
    }
    await enriquecerFotosHttpDesdeApiSiFalta(p);
}

/**
 * Reservado por si en el futuro se instala desde app.js.
 * El hook real es `installPedidoVerImagenDetalleObserver` (detalle() no usa el `detalle` envuelto de pedido-volver-pendiente).
 */
export function installPedidoVerImagen() {
    /* noop — ver injectPedidoVerImagenReclamo */
}

/** Pedido abierto: `#dm.dataset.detallePedidoId` + `window.app.p`, o `{ id }` mínimo para el GET. */
function obtenerPedidoParaImagenDetalle() {
    const dm = document.getElementById('dm');
    const pid = dm?.dataset?.detallePedidoId;
    if (!pid) return null;
    try {
        const list = window.app?.p;
        if (Array.isArray(list)) {
            const hit = list.find((x) => x && String(x.id) === String(pid));
            if (hit) return hit;
        }
    } catch (_) {}
    return { id: pid };
}

let _moDetallePedidoImg = null;
let _rafDetallePedidoImg = null;

/**
 * Tras `detalle()`, `app.js` asigna `dmc.innerHTML` (reemplaza hijos directos de `#dmc`).
 * `installPedidoVolverPendiente` envuelve `detalle` en `_deps` pero la app sigue llamando al `detalle` original,
 * por eso aquí observamos `#dmc` y ejecutamos el inject en el siguiente frame.
 */
export function installPedidoVerImagenDetalleObserver() {
    if (typeof document === 'undefined' || _moDetallePedidoImg) return;
    const boot = () => {
        const dmc = document.getElementById('dmc');
        if (!dmc) return;
        _moDetallePedidoImg = new MutationObserver(() => {
            if (_rafDetallePedidoImg != null) cancelAnimationFrame(_rafDetallePedidoImg);
            _rafDetallePedidoImg = requestAnimationFrame(() => {
                _rafDetallePedidoImg = null;
                const ped = obtenerPedidoParaImagenDetalle();
                if (!ped?.id || String(ped.id).startsWith('off_')) return;
                void injectPedidoVerImagenReclamo(ped);
            });
        });
        _moDetallePedidoImg.observe(dmc, { childList: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}

if (typeof window !== 'undefined') {
    window.injectPedidoVerImagenReclamo = injectPedidoVerImagenReclamo;
    const bootPvImg = () => {
        try {
            installPedidoVerImagenDetalleObserver();
        } catch (_) {}
    };
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootPvImg);
        else bootPvImg();
    }
}
