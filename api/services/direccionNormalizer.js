/**
 * Clave legible para logs/diagnóstico (misma lógica que columnas en `correcciones_direcciones`).
 * made by leavera77
 */

import {
  normalizarCalleNormBd,
  normalizarNumeroPuerta,
  normalizarParteDireccion,
} from "./correccionesDirecciones.js";

/**
 * @param {string|null|undefined} calle
 * @param {string|null|undefined} numero
 * @param {string|null|undefined} localidad
 * @param {string|null|undefined} provincia
 */
export function normalizarDireccion(calle, numero, localidad, provincia) {
  const cn = normalizarCalleNormBd(calle);
  const nn = normalizarNumeroPuerta(numero);
  const ln = normalizarParteDireccion(localidad);
  const pn = provincia && String(provincia).trim() ? normalizarParteDireccion(provincia) : "";
  return `${cn}|${nn}|${ln}|${pn}`;
}

export { normalizarCalleNormBd, normalizarNumeroPuerta, normalizarParteDireccion };
