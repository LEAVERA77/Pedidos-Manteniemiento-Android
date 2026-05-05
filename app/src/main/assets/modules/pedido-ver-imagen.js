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

/** Primera imagen útil (reclamo / WhatsApp / técnico con URL o base64). */
export function primeraUrlImagenReclamoPedido(p) {
    if (!p || typeof p !== 'object') return null;
    for (const k of ['imagen_url', 'foto_url', 'imagen', 'media_url', 'attachment_url']) {
        const hit = normalizarSrcImagenReclamo(p[k]);
        if (hit) return hit;
    }
    const joined = p.foto_urls != null ? String(p.foto_urls) : '';
    if (joined) {
        const hit = joined
            .split('||')
            .map((x) => x.trim())
            .map((x) => normalizarSrcImagenReclamo(x))
            .find(Boolean);
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
    coerceFotosArray(row.fotos).forEach((x) => pushNorm(x));
    String(row.foto_urls || '')
        .split('||')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => pushNorm(x));
    /* Posibles nombres legacy / WhatsApp en fila cruda */
    for (const k of ['foto_url', 'imagen_url', 'media_url', 'attachment_url']) {
        if (row[k] != null && String(row[k]).trim()) pushNorm(row[k]);
    }
    String(row.foto_base64 || '')
        .split('||')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => pushNorm(x));
    return out;
}

function pedidoTieneSrcImagenMostrable(p) {
    return !!primeraUrlImagenReclamoPedido(p);
}

async function enriquecerFotosHttpDesdeApiSiFalta(p) {
    const id = p?.id != null ? String(p.id) : '';
    if (!id || id.startsWith('off_')) return;
    if (pedidoTieneSrcImagenMostrable(p)) return;

    if (_fotoSrcCache.has(id)) {
        const list = _fotoSrcCache.get(id);
        if (
            list?.length &&
            (!Array.isArray(p.fotos) || !p.fotos.some((x) => normalizarSrcImagenReclamo(x)))
        ) {
            p.fotos = [...list];
        }
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
        _fotoSrcCache.set(id, merged);
        if (
            merged.length &&
            (!Array.isArray(p.fotos) || !p.fotos.some((x) => normalizarSrcImagenReclamo(x)))
        ) {
            p.fotos = [...merged];
        }
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

/**
 * Inserta bloque con la primera foto por URL (p. ej. WhatsApp → Cloudinary), antes de «Ubicación».
 */
export async function injectPedidoVerImagenReclamo(p) {
    const dm = document.getElementById('dm');
    if (!dm) return;
    dm.querySelector('#gn-pedido-imagen-reclamo')?.remove();

    await enriquecerFotosHttpDesdeApiSiFalta(p);

    const src = primeraUrlImagenReclamoPedido(p);
    if (!src) return;

    const scroll = dm.querySelector('.gn-dm-detail-scroll');
    if (!scroll) return;

    const wrap = document.createElement('div');
    wrap.id = 'gn-pedido-imagen-reclamo';
    wrap.className = 'ds';

    const h = document.createElement('h4');
    h.textContent = '📸 Imagen del reclamo';

    const inner = document.createElement('div');
    inner.style.marginTop = '0.5rem';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Foto del reclamo';
    img.style.cssText =
        'max-width:100%;max-height:400px;border-radius:8px;cursor:pointer;border:1px solid var(--bo)';
    img.addEventListener('click', () => {
        try {
            if (esUrlHttp(src)) window.open(src, '_blank', 'noopener,noreferrer');
        } catch (_) {}
    });
    img.addEventListener('error', () => {
        inner.innerHTML =
            '<p style="font-size:.8rem;color:var(--tl)">No se pudo cargar la imagen.</p>';
    });

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:.72rem;color:var(--tm);margin-top:.35rem';
    hint.textContent = 'Hacé clic en la imagen para verla en tamaño completo.';

    inner.appendChild(img);
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
 * Reservado por si en el futuro se instala desde app.js; hoy el hook es vía `pedido-volver-pendiente`.
 */
export function installPedidoVerImagen() {
    /* noop — ver injectPedidoVerImagenReclamo */
}
