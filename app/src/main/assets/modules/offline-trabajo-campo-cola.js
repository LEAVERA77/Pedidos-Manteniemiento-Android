const copiarCampo = (v) => JSON.parse(JSON.stringify(v));
/** Almacenamiento independiente del diario de campo. Contiene datos sensibles sin cifrado de aplicación. */
export const COLA_CAMPO_KEY = 'pmg_trabajo_campo_queue_v1';

export function leerColaCampo(storage = globalThis.localStorage) {
    const raw = storage.getItem(COLA_CAMPO_KEY);
    if (raw === null) return [];
    let lista;
    try { lista = JSON.parse(raw); } catch (_) { throw new Error('No se puede leer la cola de campo; no se modificó.'); }
    if (!Array.isArray(lista)) throw new Error('La cola de campo no es válida; no se modificó.');
    return lista;
}

function escribirColaCampo(lista, storage) {
    const raw = JSON.stringify(lista);
    try { storage.setItem(COLA_CAMPO_KEY, raw); } catch (_) { throw new Error('No se pudo guardar el trabajo en el dispositivo. Revisá el espacio disponible.'); }
    if (storage.getItem(COLA_CAMPO_KEY) !== raw)
        throw new Error('No se pudo confirmar el guardado local del trabajo.');
}

/** Guarda antes de mostrar éxito; nunca edita o reemplaza una operación congelada. */
export function guardarDiarioCampo(diario, storage = globalThis.localStorage) {
    if (!diario || diario.tipo !== 'TRABAJO_CAMPO' || diario.congelado || !diario.operacion_id || !Array.isArray(diario.eventos))
        throw new Error('Operación de campo inválida.');
    const lista = leerColaCampo(storage), i = lista.findIndex(x => x.operacion_id === diario.operacion_id);
    if (i >= 0) {
        const anterior = lista[i];
        if (anterior.congelado) throw new Error('La operación ya fue enviada y debe sincronizarse antes de continuar.');
        if (anterior.usuario_id !== diario.usuario_id || anterior.tenant_id !== diario.tenant_id ||
            anterior.pedido_id !== diario.pedido_id || anterior.business_type !== diario.business_type ||
            JSON.stringify(anterior.base) !== JSON.stringify(diario.base))
            throw new Error('El contexto o la versión inicial del pedido cambiaron.');
        if (diario.eventos.length < anterior.eventos.length ||
            JSON.stringify(diario.eventos.slice(0, anterior.eventos.length)) !== JSON.stringify(anterior.eventos))
            throw new Error('No se pueden borrar ni modificar eventos ya guardados.');
        lista[i] = copiarCampo(diario);
    } else {
        if (diario.congelado) throw new Error('No se puede crear una operación ya congelada.');
        if (lista.some(x => x.usuario_id === diario.usuario_id && x.tenant_id === diario.tenant_id && x.pedido_id === diario.pedido_id))
            throw new Error('Ya existe trabajo pendiente para este pedido.');
        lista.push(copiarCampo(diario));
    }
    escribirColaCampo(lista, storage);
    return copiarCampo(diario);
}

/** Congelar se confirma localmente antes de enviar: un reintento conserva exactamente el contenido. */
export function congelarDiarioCampo(operacionId, contexto, storage = globalThis.localStorage) {
    const lista = leerColaCampo(storage), i = lista.findIndex(x => x.operacion_id === operacionId);
    if (i < 0) throw new Error('La operación pendiente ya no está disponible.');
    const op = lista[i];
    if (op.usuario_id !== contexto.usuario_id || op.tenant_id !== contexto.tenant_id || op.business_type !== contexto.business_type)
        throw new Error('Iniciá sesión con el usuario, organización y rubro originales para sincronizar.');
    if (!op.eventos?.length) throw new Error('La operación no contiene trabajo para sincronizar.');
    if (!op.congelado) {
        lista[i] = { ...op, congelado:true };
        escribirColaCampo(lista, storage);
    }
    return copiarCampo(lista[i]);
}

/** Solo se elimina tras confirmación explícita del servidor para ese mismo contenido congelado. */
export function confirmarDiarioCampo(diarioConfirmado, storage = globalThis.localStorage) {
    const lista = leerColaCampo(storage), i = lista.findIndex(x => x.operacion_id === diarioConfirmado?.operacion_id);
    if (i < 0 || !lista[i].congelado || JSON.stringify(lista[i]) !== JSON.stringify(diarioConfirmado))
        throw new Error('La operación local cambió; se conserva para revisión.');
    lista.splice(i,1);
    escribirColaCampo(lista, storage);
}
