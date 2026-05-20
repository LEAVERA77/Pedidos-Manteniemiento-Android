/**
 * Técnico en Android: hasta 2 fotos comprimidas al poner en ejecución, cargar avance o (opcional) evidencia de trabajo.
 * No usa galería clasificada antes/después (Top3); va a pedidos.foto_base64 (||).
 * made by leavera77
 */

const MAX_FOTOS_CAMPO = 2;

let _deps = null;
let _fotosTemp = [];
let _resolverModal = null;

function esShellAndroid() {
    try {
        if (typeof _deps?.esAndroidShell === 'function') return !!_deps.esAndroidShell();
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

function toastFn(msg, tipo) {
    try {
        if (typeof _deps?.toast === 'function') _deps.toast(msg, tipo);
    } catch (_) {}
}

function abrirCamara(inputId) {
    if (typeof _deps?.abrirCamara === 'function') {
        _deps.abrirCamara(inputId);
        return;
    }
    const input = document.getElementById(inputId);
    if (!input) return;
    try {
        input.value = '';
    } catch (_) {}
    input.setAttribute('capture', 'environment');
    input.click();
}

function pintarPreview(host) {
    if (!host) return;
    host.innerHTML = '';
    _fotosTemp.forEach((foto, index) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block';
        const img = document.createElement('img');
        img.src = foto;
        img.className = 'foto-miniatura';
        img.style.maxHeight = '100px';
        if (typeof window.verFotoAmpliada === 'function') {
            img.onclick = () => window.verFotoAmpliada(foto, { tipo: 'temporal', idx: index });
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.innerHTML = '✕';
        del.title = 'Quitar foto';
        del.style.cssText =
            'position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer';
        del.onclick = (e) => {
            e.stopPropagation();
            _fotosTemp.splice(index, 1);
            pintarPreview(host);
            const btnCam = document.getElementById('gn-fotos-campo-camara');
            if (btnCam) btnCam.disabled = _fotosTemp.length >= MAX_FOTOS_CAMPO;
        };
        wrap.appendChild(img);
        wrap.appendChild(del);
        host.appendChild(wrap);
    });
    if (_fotosTemp.length > 0) {
        const cnt = document.createElement('div');
        cnt.style.cssText = 'width:100%;font-size:.75rem;color:#475569;margin-top:.35rem';
        cnt.textContent = `${_fotosTemp.length} foto(s) lista(s) (máx. ${MAX_FOTOS_CAMPO})`;
        host.appendChild(cnt);
    }
}

async function procesarArchivo(file) {
    if (!file || !_deps?.comprimirImagen) return;
    if (_fotosTemp.length >= MAX_FOTOS_CAMPO) {
        toastFn(`Máximo ${MAX_FOTOS_CAMPO} fotos`, 'warning');
        return;
    }
    try {
        const dataUrl = await _deps.comprimirImagen(file, { usarExifRotacion: true });
        _fotosTemp.push(dataUrl);
        const host = document.getElementById('gn-fotos-campo-preview');
        pintarPreview(host);
        const btnCam = document.getElementById('gn-fotos-campo-camara');
        if (btnCam) btnCam.disabled = _fotosTemp.length >= MAX_FOTOS_CAMPO;
        const kb = Math.round(dataUrl.length * 0.75 / 1024);
        toastFn(`Foto lista (≈${kb} KB)`, 'success');
    } catch (e) {
        console.warn('[gn-fotos-campo]', e);
        toastFn('No se pudo procesar la imagen', 'error');
    }
}

function cerrarModalFotosCampo(resultado) {
    const modal = document.getElementById('gn-modal-fotos-campo');
    modal?.classList.remove('active');
    const res = _resolverModal;
    _resolverModal = null;
    if (typeof res === 'function') res(resultado);
}

/**
 * Modal opcional (0–2 fotos). En web devuelve [] sin mostrar UI.
 * @param {string|number} _pedidoId
 * @param {string} [titulo]
 * @returns {Promise<string[]>}
 */
export function solicitarFotosCampoOpcional(_pedidoId, titulo) {
    if (!esShellAndroid()) return Promise.resolve([]);
    const modal = document.getElementById('gn-modal-fotos-campo');
    if (!modal) return Promise.resolve([]);

    return new Promise((resolve) => {
        _fotosTemp = [];
        _resolverModal = resolve;
        const h = document.getElementById('gn-fotos-campo-titulo');
        if (h) h.textContent = titulo || 'Fotos del trabajo (opcional)';
        pintarPreview(document.getElementById('gn-fotos-campo-preview'));
        const btnCam = document.getElementById('gn-fotos-campo-camara');
        if (btnCam) btnCam.disabled = false;
        modal.classList.add('active');
        try {
            if (typeof window.gnForceModalZFront === 'function') {
                window.gnForceModalZFront(modal);
            }
        } catch (_) {}
    });
}

/** Fotos elegidas en el modal de avance (se consumen al guardar). */
export function tomarFotosAvanceTemp() {
    const f = _fotosAvanceSesion.slice();
    _fotosAvanceSesion = [];
    return f;
}

let _fotosAvanceSesion = [];

function asegurarBloqueFotosEnAvanceModal() {
    if (!esShellAndroid()) return;
    const content = document.querySelector('#avance-modal .avance-content');
    if (!content || document.getElementById('gn-avance-fotos-block')) return;
    const block = document.createElement('div');
    block.id = 'gn-avance-fotos-block';
    block.style.cssText = 'margin:.75rem 0;text-align:left';
    block.innerHTML = `
      <p style="font-size:.82rem;color:var(--tm);margin:0 0 .45rem">Fotos del trabajo (opcional, máx. ${MAX_FOTOS_CAMPO})</p>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.35rem">
        <button type="button" class="btn-foto" id="gn-avance-foto-camara"><i class="fas fa-camera"></i> Tomar foto</button>
      </div>
      <input type="file" id="gn-avance-foto-input" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0">
      <div id="gn-avance-foto-preview" class="fotos-container"></div>`;
    const buttons = content.querySelector('.avance-buttons');
    if (buttons) content.insertBefore(block, buttons);
    else content.appendChild(block);

    document.getElementById('gn-avance-foto-camara')?.addEventListener('click', () => {
        abrirCamara('gn-avance-foto-input');
    });
    document.getElementById('gn-avance-foto-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (_fotosAvanceSesion.length >= MAX_FOTOS_CAMPO) {
            toastFn(`Máximo ${MAX_FOTOS_CAMPO} fotos`, 'warning');
            return;
        }
        try {
            const dataUrl = await _deps.comprimirImagen(file, { usarExifRotacion: true });
            _fotosAvanceSesion.push(dataUrl);
            pintarPreviewAvance();
            toastFn('Foto agregada', 'success');
        } catch (_) {
            toastFn('Error al procesar la imagen', 'error');
        }
    });
}

function pintarPreviewAvance() {
    const host = document.getElementById('gn-avance-foto-preview');
    if (!host) return;
    const prev = _fotosTemp;
    _fotosTemp = _fotosAvanceSesion.slice();
    pintarPreview(host);
    _fotosTemp = prev;
}

export function resetFotosAvanceSesion() {
    _fotosAvanceSesion = [];
    pintarPreviewAvance();
}

/**
 * @param {{ comprimirImagen: Function, toast?: Function, abrirCamara?: Function, esAndroidShell?: Function, mergeFotosBase64EnPedido: Function }} deps
 */
export function initPedidoFotosCampoAndroid(deps) {
    _deps = deps || null;
    asegurarBloqueFotosEnAvanceModal();

    const modal = document.getElementById('gn-modal-fotos-campo');
    if (!modal || modal.dataset.gnFotosCampoBound === '1') return;
    modal.dataset.gnFotosCampoBound = '1';

    document.getElementById('gn-fotos-campo-camara')?.addEventListener('click', () => {
        abrirCamara('gn-fotos-campo-input');
    });
    document.getElementById('gn-fotos-campo-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) await procesarArchivo(file);
    });
    document.getElementById('gn-fotos-campo-saltar')?.addEventListener('click', () => {
        cerrarModalFotosCampo([]);
    });
    document.getElementById('gn-fotos-campo-confirmar')?.addEventListener('click', () => {
        cerrarModalFotosCampo(_fotosTemp.slice());
    });
    modal.querySelector('.gn-fotos-campo-cerrar')?.addEventListener('click', () => {
        cerrarModalFotosCampo([]);
    });
}
