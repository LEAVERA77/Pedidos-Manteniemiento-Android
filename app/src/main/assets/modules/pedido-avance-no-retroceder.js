/**
 * Avance de pedido: no permitir porcentaje menor al ya registrado (web + Android WebView).
 * made by leavera77
 */

let _pedidoIdAvance = null;

function clampAvanceRango(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 0;
    return Math.min(100, Math.max(0, v));
}

/** @param {object|number|null} pedidoOrAv fila normalizada (`av`) o número */
export function avanceEnteroPedido(pedidoOrAv) {
    if (pedidoOrAv == null) return 0;
    if (typeof pedidoOrAv === 'number') return clampAvanceRango(pedidoOrAv);
    return clampAvanceRango(parseInt(pedidoOrAv.av ?? pedidoOrAv.avance, 10) || 0);
}

export function clampAvanceNoRetrocede(nuevo, actual) {
    const min = avanceEnteroPedido(actual);
    return Math.max(min, clampAvanceRango(nuevo));
}

/**
 * @returns {{ ok: boolean, valor: number, minimo: number, mensaje: string }}
 */
export function validarAvanceNoRetrocede(nuevo, actual) {
    const minimo = avanceEnteroPedido(actual);
    const valor = clampAvanceRango(nuevo);
    if (valor < minimo) {
        return {
            ok: false,
            valor: minimo,
            minimo,
            mensaje: `El avance no puede ser menor a ${minimo}% (ya cargado). Solo podés subir o mantener.`,
        };
    }
    return { ok: true, valor, minimo, mensaje: '' };
}

/** Ajusta `campos.avance` in-place si viene en el payload. */
export function aplicarMinimoAvanceEnCamposPedido(campos, avanceActual) {
    if (!campos || campos.avance === undefined || campos.avance === null) return null;
    const v = validarAvanceNoRetrocede(campos.avance, avanceActual);
    campos.avance = v.valor;
    return v;
}

function hintAvanceNoRetrocedeEl() {
    let el = document.getElementById('avance-no-retrocede-hint');
    if (el) return el;
    const content = document.querySelector('#avance-modal .avance-content');
    if (!content) return null;
    el = document.createElement('p');
    el.id = 'avance-no-retrocede-hint';
    el.style.cssText = 'font-size:.8rem;color:var(--tm);margin:.35rem 0 0;line-height:1.4';
    const ref = content.querySelector('p');
    if (ref && ref.nextSibling) content.insertBefore(el, ref.nextSibling);
    else content.insertBefore(el, content.firstChild?.nextSibling || null);
    return el;
}

function aplicarMinUiAvanceModal(min) {
    const slider = document.getElementById('avance-slider');
    const input = document.getElementById('avance-input');
    if (!slider || !input) return;
    slider.min = String(min);
    input.min = String(min);
    slider.max = '100';
    input.max = '100';
    let v = parseInt(input.value, 10);
    if (!Number.isFinite(v) || v < min) v = min;
    if (v > 100) v = 100;
    slider.value = String(v);
    input.value = String(v);
    const hint = hintAvanceNoRetrocedeEl();
    if (hint) {
        if (min > 0) {
            hint.textContent = `Mínimo ${min}% (avance ya registrado). No podés bajar el porcentaje.`;
            hint.hidden = false;
        } else {
            hint.textContent = '';
            hint.hidden = true;
        }
    }
}

/**
 * @param {string|number} pedidoId
 * @param {(id: string|number) => object|undefined} findPedidoFn
 */
export function abrirModalAvancePedido(pedidoId, findPedidoFn) {
    const pedido = typeof findPedidoFn === 'function' ? findPedidoFn(pedidoId) : null;
    if (!pedido) return;
    _pedidoIdAvance = pedidoId;
    const min = avanceEnteroPedido(pedido);
    aplicarMinUiAvanceModal(min);
    document.getElementById('avance-modal')?.classList.add('active');
}

/**
 * @param {{ findPedido: (id: string|number) => object|undefined, onGuardar: (id: string|number, avance: number) => Promise<void>, toast?: (msg: string, type?: string) => void }} ctx
 */
export function initPedidoAvanceModalUI(ctx) {
    const slider = document.getElementById('avance-slider');
    const input = document.getElementById('avance-input');
    const guardar = document.getElementById('guardar-avance');
    const cancelar = document.getElementById('cancelar-avance');
    const findPedido = ctx?.findPedido;
    const onGuardar = ctx?.onGuardar;
    const toastFn = typeof ctx?.toast === 'function' ? ctx.toast : () => {};

    const minDesdeUi = () => {
        const m = parseInt(slider?.min, 10);
        return Number.isFinite(m) && m >= 0 ? m : 0;
    };

    slider?.addEventListener('input', (e) => {
        if (!input) return;
        const min = minDesdeUi();
        let v = parseInt(e.target.value, 10) || 0;
        if (v < min) v = min;
        if (v > 100) v = 100;
        input.value = String(v);
        e.target.value = String(v);
    });

    input?.addEventListener('input', (e) => {
        if (!slider) return;
        const min = minDesdeUi();
        let val = parseInt(e.target.value, 10);
        if (!Number.isFinite(val)) val = min;
        if (val < min) val = min;
        if (val > 100) val = 100;
        e.target.value = String(val);
        slider.value = String(val);
    });

    guardar?.addEventListener('click', async () => {
        if (_pedidoIdAvance == null || typeof onGuardar !== 'function') return;
        const pedido = typeof findPedido === 'function' ? findPedido(_pedidoIdAvance) : null;
        const min = pedido ? avanceEnteroPedido(pedido) : minDesdeUi();
        let avance = parseInt(input?.value, 10);
        if (!Number.isFinite(avance)) avance = min;
        const val = validarAvanceNoRetrocede(avance, min);
        if (!val.ok) {
            toastFn(val.mensaje, 'warning');
            aplicarMinUiAvanceModal(min);
            return;
        }
        await onGuardar(_pedidoIdAvance, val.valor);
        document.getElementById('avance-modal')?.classList.remove('active');
        _pedidoIdAvance = null;
    });

    cancelar?.addEventListener('click', () => {
        document.getElementById('avance-modal')?.classList.remove('active');
        _pedidoIdAvance = null;
    });
}

/** Body PUT al pasar a ejecución sin bajar avance ya cargado. */
export function bodyIniciarEjecucionSinBajarAvance(avanceActual) {
    const av = avanceEnteroPedido(avanceActual);
    const body = { estado: 'En ejecución' };
    if (av === 0) body.avance = 0;
    return body;
}
