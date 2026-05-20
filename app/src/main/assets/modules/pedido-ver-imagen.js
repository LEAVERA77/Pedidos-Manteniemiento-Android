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

/** Entrega on-the-fly más liviana (menos datos en WebView / navegador). No modifica URLs guardadas en BD. */
export function optimizarUrlCloudinary(url) {
    const u = String(url || '').trim();
    if (!u || !/res\.cloudinary\.com/i.test(u) || !/\/upload\//i.test(u)) return u;
    if (/\bupload\/[^?]*\bq_auto\b/i.test(u) && /\bf_auto\b/i.test(u)) return u;
    return u.replace(/\/upload\//i, '/upload/q_auto,f_auto/');
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
    const seen = new Set();
    const deduped = [];
    for (const u of out) {
        const k = String(u || '').trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        deduped.push(u);
    }
    return deduped;
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
    b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick(ev);
    });
    return b;
}

function esAdminPanelGestorNova() {
    try {
        const r = String(window.app?.u?.rol || '').toLowerCase();
        return r === 'admin' || r === 'administrador';
    } catch (_) {
        return false;
    }
}

function estadoPermiteAccionesValidacionFoto(estadoRaw) {
    const s = String(estadoRaw || '').trim();
    return !['Cerrado', 'Desestimado', 'Derivado externo'].includes(s);
}

async function putPedidoCamposValidacion(pedidoId, body) {
    const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
    const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
    if (!tok || !apiUrlFn) throw new Error('Sin sesión API');
    const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(pedidoId)}`), {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${tok}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        const msg = j.error || j.detail || `Error ${r.status}`;
        throw new Error(msg);
    }
    return j;
}

/** Modal mínimo (sin inflar app.js). */
function abrirModalSeleccion(titulo, opciones, onConfirm) {
    const ov = document.createElement('div');
    ov.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:12000;display:flex;align-items:center;justify-content:center;padding:1rem';
    const box = document.createElement('div');
    box.style.cssText =
        'background:var(--bg);color:inherit;border-radius:10px;max-width:380px;width:100%;padding:1rem;border:1px solid var(--bo);box-shadow:0 8px 32px rgba(0,0,0,.2)';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:600;margin-bottom:.65rem;font-size:.9rem';
    h.textContent = titulo;
    box.appendChild(h);
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:.4rem;border-radius:6px;border:1px solid var(--bo);margin-bottom:.65rem;font-size:.85rem';
    for (const op of opciones) {
        const o = document.createElement('option');
        o.value = op.value;
        o.textContent = op.label;
        sel.appendChild(o);
    }
    box.appendChild(sel);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem';
    const cerrar = () => {
        try {
            ov.remove();
        } catch (_) {}
    };
    const btnOk = crearBotonToolbar('Confirmar', '', () => {
        const v = String(sel.value || '').trim();
        cerrar();
        void Promise.resolve(onConfirm(v)).catch(() => {});
    });
    const btnX = crearBotonToolbar('Cancelar', '', cerrar);
    row.appendChild(btnX);
    row.appendChild(btnOk);
    box.appendChild(row);
    ov.appendChild(box);
    ov.addEventListener('click', (ev) => {
        if (ev.target === ov) cerrar();
    });
    document.body.appendChild(ov);
}

async function descargarOAbrirImagenReclamo(src, pedidoId) {
    const base = pedidoId ? `reclamo-pedido-${pedidoId}` : 'reclamo';
    try {
        if (esUrlHttp(src)) {
            try {
                const r = await fetch(src, { mode: 'cors', credentials: 'omit' });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${base}.jpg`;
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    return;
                }
            } catch (_) {}
            const a = document.createElement('a');
            a.href = src;
            a.download = `${base}.jpg`;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
        }
        const a2 = document.createElement('a');
        a2.href = src;
        a2.download = `${base}.jpg`;
        a2.rel = 'noopener';
        document.body.appendChild(a2);
        a2.click();
        a2.remove();
    } catch (_) {
        if (typeof window.toast === 'function') window.toast('No se pudo descargar la imagen.', 'error');
    }
}

/** Cierra solo el modal de detalle (#dm) para dejar visible el visor de foto (z-index). */
function cerrarModalDetallePedidoSiAbierto() {
    try {
        const dm = document.getElementById('dm');
        if (!dm || !dm.classList.contains('active')) return;
        const btn = dm.querySelector('.mh button.cm');
        if (btn) btn.click();
    } catch (_) {}
}

/**
 * Mismo modal que `verFotoAmpliada` (operarios): zoom, arrastre, rueda, rotar, descargar, guardar rotación en BD.
 * Varias fotos: barra Anterior / Siguiente (sin tocar app.js).
 * @param {{ pedidoId?: string, reclamo_imagen_rotacion?: number }} [metaVisor]
 */
function abrirVisorReclamoUnificado(urls, indiceInicial, metaVisor = {}) {
    const list = (Array.isArray(urls) ? urls : [urls]).map((x) => String(x || '').trim()).filter(Boolean);
    if (!list.length) return;
    const ver = typeof window.verFotoAmpliada === 'function' ? window.verFotoAmpliada : null;
    const modal = document.getElementById('modal-foto-ampliada');
    if (!ver || !modal) return;

    const cleanupNav = () => {
        try {
            document.getElementById('gn-reclamo-foto-nav')?.remove();
        } catch (_) {}
    };
    cleanupNav();

    let idx = Math.max(0, Math.min(Number(indiceInicial) || 0, list.length - 1));

    const pid = metaVisor.pedidoId != null ? String(metaVisor.pedidoId).trim() : '';
    const ctxBase =
        pid && !pid.startsWith('off_')
            ? {
                  tipo: 'reclamo_imagen',
                  id: pid,
                  urls: list,
                  reclamo_imagen_rotacion: normalizarRotacionGrados(metaVisor.reclamo_imagen_rotacion),
              }
            : null;
    const mkCtx = () => (ctxBase ? { ...ctxBase, idx } : null);
    ver(list[idx], mkCtx());
    const btnDl = document.getElementById('foto-guardar');
    if (btnDl) btnDl.style.display = 'flex';

    if (list.length <= 1) return;

    const nav = document.createElement('div');
    nav.id = 'gn-reclamo-foto-nav';
    nav.style.cssText =
        'display:flex;justify-content:center;align-items:center;gap:.75rem;padding:.4rem .6rem;background:rgba(15,23,42,.88);border-bottom:1px solid rgba(255,255,255,.12)';
    const lab = document.createElement('span');
    lab.style.cssText = 'color:#e2e8f0;font-size:.78rem;min-width:5ch;text-align:center;font-variant-numeric:tabular-nums';
    const mkBtn = (txt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.style.cssText =
            'font-size:.78rem;padding:.35rem .65rem;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#f8fafc;cursor:pointer';
        return b;
    };
    const prev = mkBtn('◀ Anterior');
    const next = mkBtn('Siguiente ▶');
    const syncLab = () => {
        lab.textContent = `${idx + 1} / ${list.length}`;
    };
    syncLab();
    const abrirIdx = (i) => {
        idx = ((i % list.length) + list.length) % list.length;
        ver(list[idx], mkCtx());
        if (btnDl) btnDl.style.display = 'flex';
        syncLab();
    };
    prev.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirIdx(idx - 1);
    });
    next.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirIdx(idx + 1);
    });
    nav.appendChild(prev);
    nav.appendChild(lab);
    nav.appendChild(next);
    const imgc = modal.querySelector('#img-container');
    if (imgc) modal.insertBefore(nav, imgc);
    else modal.appendChild(nav);

    const mo = new MutationObserver(() => {
        if (!modal.classList.contains('active')) {
            cleanupNav();
            mo.disconnect();
        }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

/** Llamado desde `app.js` al guardar rotación en el modal `verFotoAmpliada` (ctx `reclamo_imagen`). */
export async function guardarRotacionReclamoDesdeFotoAmpliada(pedidoId, rotationDeg) {
    await persistirRotacionReclamoApi(pedidoId, rotationDeg);
    sincronizarRotacionEnListaPedidosApp(pedidoId, rotationDeg);
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
 * @param {string|string[]} srcOrSources — una URL o varias (galería).
 * @param {{ pedidoId?: string|number, reclamo_imagen_rotacion?: number, estado?: string }} [meta]
 */
function insertarImagenReclamoEnDOM(srcOrSources, meta = {}) {
    const rawList = Array.isArray(srcOrSources)
        ? srcOrSources.map((s) => String(s || '').trim()).filter(Boolean)
        : srcOrSources
          ? [String(srcOrSources).trim()].filter(Boolean)
          : [];
    const seenSrc = new Set();
    const sources = [];
    for (const u of rawList) {
        const k = String(u || '').trim();
        if (!k || seenSrc.has(k)) continue;
        seenSrc.add(k);
        sources.push(u);
    }
    if (!sources.length) return;
    const sourcesUi = sources.map((u) => optimizarUrlCloudinary(u));
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();

    const scroll = obtenerContenedorScrollDetallePedido();
    if (!scroll) return;

    const pedidoId = meta.pedidoId != null ? String(meta.pedidoId).trim() : '';
    const puedePersistir = Boolean(pedidoId && !pedidoId.startsWith('off_'));
    const rotPreview = normalizarRotacionGrados(meta.reclamo_imagen_rotacion);
    let activeIndex = 0;
    const srcActivo = () => sourcesUi[activeIndex] || sourcesUi[0];

    const abrirVisorDesdePreview = (idx) => {
        abrirVisorReclamoUnificado(sourcesUi, idx, {
            pedidoId,
            reclamo_imagen_rotacion: meta.reclamo_imagen_rotacion,
        });
    };

    const wrap = document.createElement('div');
    wrap.id = 'gn-pedido-imagen-reclamo';
    wrap.className = 'ds';
    /** Bubble (no capture): en capture el contenedor bloqueaba el clic antes de llegar a botones/imágenes. */
    wrap.addEventListener('click', (e) => e.stopPropagation());

    const h = document.createElement('h4');
    h.textContent = sources.length > 1 ? '📸 Imágenes del reclamo' : '📸 Imagen del reclamo';

    const inner = document.createElement('div');
    inner.style.marginTop = '0.5rem';
    inner.addEventListener('click', (e) => e.stopPropagation());

    let thumbRow = null;
    if (sources.length > 1) {
        thumbRow = document.createElement('div');
        thumbRow.style.cssText =
            'display:flex;flex-wrap:wrap;gap:6px;margin-top:.25rem;align-items:center;max-height:72px;overflow:auto';
        sourcesUi.forEach((u, idx) => {
            const t = document.createElement('img');
            t.src = u;
            t.alt = `Miniatura ${idx + 1}`;
            t.style.cssText =
                `height:52px;width:auto;max-width:72px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${idx === 0 ? 'var(--p2,#0a84ff)' : 'transparent'};opacity:${idx === 0 ? 1 : 0.85}`;
            t.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                activeIndex = idx;
                img.src = srcActivo();
                thumbRow.querySelectorAll('img').forEach((im, j) => {
                    im.style.borderColor = j === idx ? 'var(--p2,#0a84ff)' : 'transparent';
                    im.style.opacity = j === idx ? '1' : '0.85';
                });
            });
            t.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                abrirVisorDesdePreview(idx);
            });
            thumbRow.appendChild(t);
        });
    }

    const imgHost = document.createElement('div');
    imgHost.style.cssText =
        'margin-top:0.35rem;overflow:auto;max-height:min(42vh,420px);display:flex;justify-content:center;align-items:center;padding:6px;border-radius:10px;border:1px solid var(--bo);background:var(--bg);-webkit-overflow-scrolling:touch';

    const img = document.createElement('img');
    img.src = srcActivo();
    img.alt = 'Foto del reclamo';
    img.draggable = false;
    img.style.cssText = `max-width:min(100%,96vw);width:auto;height:auto;max-height:min(38vh,380px);object-fit:contain;border-radius:8px;cursor:zoom-in;display:block;transform-origin:center center;transform:rotate(${rotPreview}deg)`;

    img.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        abrirVisorDesdePreview(activeIndex);
    });

    img.addEventListener('error', () => {
        imgHost.innerHTML =
            '<p style="font-size:.8rem;color:var(--tl);padding:.5rem">No se pudo cargar la imagen.</p>';
    });

    imgHost.appendChild(img);

    const bar = document.createElement('div');
    bar.className = 'gn-pedido-img-toolbar';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.55rem;align-items:center';

    const btnVisor = crearBotonToolbar(
        '🖼 Abrir en visor',
        'Mismo visor que fotos del pedido (zoom, rotar, descargar, guardar rotación). Cierra este detalle.',
        () => abrirVisorDesdePreview(activeIndex)
    );
    btnVisor.style.cssText =
        (btnVisor.style.cssText || '') +
        ';font-weight:600;background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;border-color:#1d4ed8';

    const btnDl = crearBotonToolbar(
        '💾 Descargar vista previa',
        'Descargar la miniatura actual sin abrir el visor',
        () => void descargarOAbrirImagenReclamo(srcActivo(), pedidoId)
    );

    bar.appendChild(btnVisor);
    bar.appendChild(btnDl);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:.72rem;color:var(--tm);margin-top:.4rem;line-height:1.35';
    hint.textContent =
        'Clic en la imagen o «Abrir en visor»: mismo visor de foto ampliada (zoom, rotar, descargar). Guardar rotación en servidor según permisos del rol. Doble clic en una miniatura: abre esa foto.';

    if (thumbRow) inner.appendChild(thumbRow);
    inner.appendChild(imgHost);
    inner.appendChild(bar);
    inner.appendChild(hint);

    if (esAdminPanelGestorNova() && puedePersistir && estadoPermiteAccionesValidacionFoto(meta.estado)) {
        const adm = document.createElement('div');
        adm.style.cssText =
            'margin-top:.75rem;padding:.55rem;border:1px solid var(--bo);border-radius:8px;background:rgba(127,127,127,.06)';
        const lab = document.createElement('div');
        lab.style.cssText = 'font-size:.72rem;color:var(--tm);margin-bottom:.4rem;font-weight:600';
        lab.textContent = 'Validación de fotos (admin)';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem;align-items:center';

        const mk = (txt, bg, title, fn) => {
            const b = crearBotonToolbar(txt, title, fn);
            b.style.background = bg;
            b.style.color = '#fff';
            b.style.borderColor = 'rgba(0,0,0,.12)';
            return b;
        };

        const toastOk = (m) => {
            if (typeof window.toast === 'function') window.toast(m, 'success', 3200);
        };
        const toastErr = (m) => {
            if (typeof window.toast === 'function') window.toast(m, 'error', 5200);
        };

        const refrescarBloqueImagen = async () => {
            _fotoSrcCache.delete(pedidoId);
            try {
                const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
                const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
                if (!tok || !apiUrlFn) return;
                const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(pedidoId)}`), {
                    headers: { Authorization: `Bearer ${tok}` },
                });
                if (!r.ok) return;
                const row = await r.json();
                const merged = listaImagenesDesdeRowPedido(row);
                if (merged.length) {
                    insertarImagenReclamoEnDOM(merged, {
                        pedidoId,
                        reclamo_imagen_rotacion: row.reclamo_imagen_rotacion ?? meta.reclamo_imagen_rotacion,
                        estado: row.estado ?? meta.estado,
                    });
                } else {
                    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();
                }
                try {
                    const list = window.app?.p;
                    if (Array.isArray(list)) {
                        const hit = list.find((x) => x && String(x.id) === String(pedidoId));
                        if (hit) {
                            hit.estado = row.estado;
                            hit.foto_urls = row.foto_urls;
                            hit.foto_base64 = row.foto_base64;
                            hit.motivo_rechazo_foto = row.motivo_rechazo_foto;
                            hit.motivo_desestimacion = row.motivo_desestimacion;
                            hit.foto_evidencia_validada = row.foto_evidencia_validada;
                        }
                    }
                } catch (_) {}
            } catch (_) {}
        };

        row.appendChild(
            mk(
                '✅ Foto válida',
                '#2e7d32',
                'Confirmar que la foto sirve como evidencia',
                async () => {
                    try {
                        await putPedidoCamposValidacion(pedidoId, { foto_evidencia_validada: true });
                        toastOk('Foto marcada como válida.');
                        await refrescarBloqueImagen();
                    } catch (e) {
                        toastErr(e?.message || 'Error');
                    }
                }
            )
        );
        row.appendChild(
            mk(
                '📸 Foto borrosa/no clara',
                '#f9a825',
                'Rechazar por calidad y pedir otra foto por WhatsApp',
                () => {
                    abrirModalSeleccion(
                        'Motivo (foto borrosa / no clara)',
                        [
                            { value: 'Foto borrosa', label: 'Foto borrosa' },
                            { value: 'No muestra el reclamo', label: 'No muestra el reclamo' },
                            { value: 'Mala iluminación', label: 'Mala iluminación' },
                        ],
                        async (motivo) => {
                            try {
                                await putPedidoCamposValidacion(pedidoId, {
                                    estado: 'Evidencia insuficiente',
                                    motivo_rechazo_foto: motivo,
                                });
                                toastOk('Estado actualizado. Se notificó al reclamante por WhatsApp si aplica.');
                                await refrescarBloqueImagen();
                            } catch (e) {
                                toastErr(e?.message || 'Error');
                            }
                        }
                    );
                }
            )
        );
        adm.appendChild(lab);
        adm.appendChild(row);
        inner.appendChild(adm);
    }

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
        if (list?.length)
            insertarImagenReclamoEnDOM(list, {
                pedidoId: id,
                reclamo_imagen_rotacion: p?.reclamo_imagen_rotacion,
                estado: p?.estado,
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
        if (merged.length)
            insertarImagenReclamoEnDOM(merged, {
                pedidoId: id,
                reclamo_imagen_rotacion: row.reclamo_imagen_rotacion ?? p?.reclamo_imagen_rotacion,
                estado: row.estado ?? p?.estado,
            });
    } catch (_) {}
}

export async function injectPedidoVerImagenReclamo(p) {
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();

    const listLocal = listaImagenesDesdeRowPedido(p);
    if (listLocal.length) {
        insertarImagenReclamoEnDOM(listLocal, {
            pedidoId: p?.id,
            reclamo_imagen_rotacion: p?.reclamo_imagen_rotacion,
            estado: p?.estado,
        });
        return;
    }
    const srcLocal = primeraUrlImagenReclamoPedido(p);
    if (srcLocal) {
        insertarImagenReclamoEnDOM(srcLocal, {
            pedidoId: p?.id,
            reclamo_imagen_rotacion: p?.reclamo_imagen_rotacion,
            estado: p?.estado,
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

function dmDetalleEstaDesplazandose() {
    try {
        if (typeof window.gnDmDetalleEstaDesplazandose === 'function') {
            return window.gnDmDetalleEstaDesplazandose();
        }
    } catch (_) {}
    const dm = document.getElementById('dm');
    return !!(dm && dm.classList.contains('gn-dm-is-scrolling'));
}

function esShellAndroidDoc() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

function programarInjectDetalleImagen(fn) {
    const run = () => {
        if (dmDetalleEstaDesplazandose()) {
            _rafDetallePedidoImg = requestAnimationFrame(run);
            return;
        }
        fn();
    };
    if (esShellAndroidDoc() && typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => run(), { timeout: 380 });
        return;
    }
    if (esShellAndroidDoc()) {
        setTimeout(run, 100);
        return;
    }
    _rafDetallePedidoImg = requestAnimationFrame(run);
}

/** Libera observer y rAF pendiente (p. ej. al cerrar #dm). */
export function disconnectPedidoVerImagenDetalleObserver() {
    if (_rafDetallePedidoImg != null) {
        try {
            cancelAnimationFrame(_rafDetallePedidoImg);
        } catch (_) {}
        _rafDetallePedidoImg = null;
    }
    if (_moDetallePedidoImg) {
        try {
            _moDetallePedidoImg.disconnect();
        } catch (_) {}
        _moDetallePedidoImg = null;
    }
}

/**
 * Tras `detalle()`, `app.js` asigna `dmc.innerHTML` (reemplaza hijos directos de `#dmc`).
 * `installPedidoVolverPendiente` envuelve `detalle` en `_deps` pero la app sigue llamando al `detalle` original,
 * por eso aquí observamos `#dmc` y ejecutamos el inject en el siguiente frame.
 * Se puede llamar de nuevo tras `disconnectPedidoVerImagenDetalleObserver()` (reabrir detalle).
 */
export function installPedidoVerImagenDetalleObserver() {
    if (typeof document === 'undefined') return;
    disconnectPedidoVerImagenDetalleObserver();
    const dmc = document.getElementById('dmc');
    if (!dmc) return;
    _moDetallePedidoImg = new MutationObserver(() => {
        if (_rafDetallePedidoImg != null) {
            try {
                cancelAnimationFrame(_rafDetallePedidoImg);
            } catch (_) {}
            _rafDetallePedidoImg = null;
        }
        programarInjectDetalleImagen(() => {
            _rafDetallePedidoImg = null;
            const ped = obtenerPedidoParaImagenDetalle();
            if (!ped?.id || String(ped.id).startsWith('off_')) return;
            void injectPedidoVerImagenReclamo(ped);
        });
    });
    _moDetallePedidoImg.observe(dmc, { childList: true });
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
