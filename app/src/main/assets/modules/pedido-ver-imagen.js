/**
 * Sección «Imagen del reclamo» en el modal #dm (detalle de pedido).
 * Integración: se invoca desde `pedido-volver-pendiente.js` tras `detalle()` (sin tocar app.js).
 * made by leavera77
 */

/** @type {Map<string, string[]>} */
const _fotoHttpCache = new Map();

function esUrlHttp(u) {
    return /^https?:\/\//i.test(String(u || '').trim());
}

/** Primera URL http(s) útil (Cloudinary, etc.). */
export function primeraUrlImagenReclamoPedido(p) {
    if (!p || typeof p !== 'object') return null;
    for (const k of ['imagen_url', 'foto_url', 'imagen', 'media_url', 'attachment_url']) {
        const v = p[k];
        if (v != null && esUrlHttp(v)) return String(v).trim();
    }
    const joined = p.foto_urls != null ? String(p.foto_urls) : '';
    if (joined) {
        const hit = joined
            .split('||')
            .map((x) => x.trim())
            .find((x) => esUrlHttp(x));
        if (hit) return hit;
    }
    const arr = Array.isArray(p.fotos) ? p.fotos : [];
    for (const u of arr) {
        const s = String(u || '').trim();
        if (esUrlHttp(s)) return s;
    }
    return null;
}

async function enriquecerFotosHttpDesdeApiSiFalta(p) {
    const id = p?.id != null ? String(p.id) : '';
    if (!id || id.startsWith('off_')) return;
    if (primeraUrlImagenReclamoPedido(p)) return;

    if (_fotoHttpCache.has(id)) {
        const list = _fotoHttpCache.get(id);
        if (list?.length && (!Array.isArray(p.fotos) || !p.fotos.some((x) => esUrlHttp(x)))) {
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
        const urls = Array.isArray(row.fotos)
            ? row.fotos.map(String)
            : String(row.foto_urls || '')
                  .split('||')
                  .map((s) => s.trim())
                  .filter(Boolean);
        const http = urls.map((s) => String(s).trim()).filter((s) => esUrlHttp(s));
        _fotoHttpCache.set(id, http);
        if (http.length && (!Array.isArray(p.fotos) || !p.fotos.some((x) => esUrlHttp(x)))) {
            p.fotos = [...http];
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

    const url = primeraUrlImagenReclamoPedido(p);
    if (!url) return;

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
    img.src = url;
    img.alt = 'Foto del reclamo';
    img.style.cssText =
        'max-width:100%;max-height:400px;border-radius:8px;cursor:pointer;border:1px solid var(--bo)';
    img.addEventListener('click', () => {
        try {
            window.open(url, '_blank', 'noopener,noreferrer');
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
