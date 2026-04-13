/**
 * Clave legible para logs/diagnóstico (la BD usa columnas normalizadas en correcciones_direcciones).
 * made by leavera77
 */

import { normalizarNumeroPuerta, normalizarParteDireccion } from "./correccionesDirecciones.js";

/**
 * @param {string|null|undefined} calle
 * @param {string|null|undefined} numero
 * @param {string|null|undefined} localidad
 * @param {string|null|undefined} provincia
 */
export function normalizarDireccion(calle, numero, localidad, provincia) {
  const cn = normalizarParteDireccion(calle);
  const nn = normalizarNumeroPuerta(numero);
  const ln = normalizarParteDireccion(localidad);
  const pn = provincia && String(provincia).trim() ? normalizarParteDireccion(provincia) : "";
  return `${cn}|${nn}|${ln}|${pn}`;
}

export { normalizarNumeroPuerta, normalizarParteDireccion };
