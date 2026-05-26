/**
 * Ciclo descargo ↔ valoración WA: un guardado por ronda; nueva ronda si calificación baja tras cierre.
 * made by leavera77
 */

export const UMBRAL_VALORACION_BAJA = 3;

export function estrellasOpinionPedido(p) {
    const n = Number(p?.oes ?? p?.opinion_cliente_estrellas);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
}

export function esValoracionBajaOpinion(estrellas) {
    return estrellas != null && estrellas < UMBRAL_VALORACION_BAJA;
}

export function esPedidoCerradoOpinionUi(p) {
    return (
        String(p?.es ?? '')
            .trim()
            .toLowerCase() === 'cerrado'
    );
}

function tsFecha(v) {
    if (v == null || v === '') return 0;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
}

/** Valoración del cliente más reciente que el último descargo guardado. */
export function valoracionPosteriorADescargo(p) {
    const fop = tsFecha(p?.fopin ?? p?.fecha_opinion_cliente);
    const fod = tsFecha(p?.fodesc ?? p?.fecha_descargo_empresa);
    if (!fop) return false;
    if (!fod) return true;
    return fop > fod;
}

export function mapDescargoTexto(p) {
    const v = p?.odesc ?? p?.opinion_descargo_empresa;
    if (v == null || v === '') return '';
    return String(v).trim();
}

/** Descargo ya guardado para la valoración actual (no se puede volver a pulsar Guardar). */
export function descargoYaGuardadoParaValoracionActual(p) {
    const desc = mapDescargoTexto(p);
    if (!desc) return false;
    return !valoracionPosteriorADescargo(p);
}

/**
 * Formulario editable: pedido cerrado y sin descargo guardado para esta valoración.
 * Re-ciclo: calificación baja (&lt;3) tras un nuevo cierre; si no es baja, solo la primera vez sin descargo.
 */
export function puedeMostrarFormularioDescargoEmpresa(p, esAdmin) {
    if (!esAdmin) return false;
    const est = estrellasOpinionPedido(p);
    if (est == null) return false;
    if (!esPedidoCerradoOpinionUi(p)) return false;
    if (descargoYaGuardadoParaValoracionActual(p)) return false;
    if (esValoracionBajaOpinion(est)) return true;
    return !mapDescargoTexto(p) && !valoracionPosteriorADescargo(p);
}

export function textoInicialTextareaDescargo(p, esAdmin) {
    if (!puedeMostrarFormularioDescargoEmpresa(p, esAdmin)) return '';
    if (descargoYaGuardadoParaValoracionActual(p)) return mapDescargoTexto(p);
    return '';
}
