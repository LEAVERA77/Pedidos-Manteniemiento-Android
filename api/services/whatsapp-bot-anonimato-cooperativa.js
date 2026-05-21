/**
 * Reglas de anonimato en bot WhatsApp — cooperativa eléctrica.
 * Anónimo solo para «Denuncia de fraude (anónima)»; el resto exige identificación.
 * made by leavera77
 */

import { normalizarRubroCliente, TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA } from "./tiposReclamo.js";

export { TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA };

/**
 * @param {string} tipoTrabajo
 * @param {string} tipoCliente
 */
export function esTipoDenunciaFraudeAnonimaCoopElectrica(tipoTrabajo, tipoCliente) {
  return (
    normalizarRubroCliente(tipoCliente) === "cooperativa_electrica" &&
    String(tipoTrabajo || "").trim() === TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA
  );
}

/** Opción 3 del menú post-descripción (solo dirección sin datos) — no en cooperativa eléctrica. */
export function permiteOpcionSoloDireccionSinIdentidad(tipoCliente) {
  return normalizarRubroCliente(tipoCliente) !== "cooperativa_electrica";
}

/**
 * @param {string} tipoTrabajo
 * @param {string} tipoCliente
 */
export function reclamoPermiteFlujoAnonimo(tipoTrabajo, tipoCliente) {
  return esTipoDenunciaFraudeAnonimaCoopElectrica(tipoTrabajo, tipoCliente);
}

/**
 * @param {string} tipoTrabajo
 * @param {string} tipoCliente
 */
export function nombreContactoAnonimoWhatsapp(tipoTrabajo, tipoCliente) {
  if (esTipoDenunciaFraudeAnonimaCoopElectrica(tipoTrabajo, tipoCliente)) {
    return "Denuncia anónima (fraude)";
  }
  return "Vecino anónimo";
}

/**
 * @param {{ tipo?: string }} ctx
 */
export function mensajeMenuIdentificacionPorRubro(ctx) {
  const r = normalizarRubroCliente(ctx?.tipo);
  const base =
    `Ya tenemos la *descripción* del problema. Ahora necesitamos *identificar* y *ubicar* el reclamo.\n\n` +
    `Elegí *una opción* respondiendo con el *número*:\n\n`;

  if (r === "cooperativa_electrica") {
    return (
      base +
      `*1)* Tengo *NIS* o *número de medidor* (completamos tu nombre desde el padrón).\n` +
      `*2)* *Nombre y apellido* + domicilio (sin NIS/medidor).\n\n` +
      `Para *denunciar un fraude sin dar tus datos*, cancelá con *menú* y elegí en el menú principal *${TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA}*.\n\n` +
      `Podés enviar *GPS* con *Adjuntar* (📎) → *Ubicación*.\n` +
      `*atrás* = corregir la descripción · *menú* = salir.`
    );
  }

  const opt3 =
    `*3)* Solo *dirección* (sin datos personales): *provincia*, *ciudad*, *calle* y *número*.\n\n`;

  if (r === "cooperativa_agua") {
    return (
      base +
      `*1)* Tengo *ID de usuario* o *número de medidor* del servicio de agua.\n` +
      `*2)* Prefiero con *nombre y dirección*.\n` +
      opt3 +
      `También podés mandar *ubicación GPS* con *Adjuntar* → *Ubicación*.\n` +
      `*atrás* = corregir la descripción · *menú* = salir.`
    );
  }
  if (r === "municipio") {
    return (
      base +
      `*1)* Tengo mi *número de vecino* (credencial / cuenta municipal).\n` +
      `*2)* Prefiero con *nombre y dirección*.\n` +
      opt3 +
      `Podés adjuntar *ubicación* en cualquier momento (📎 → *Ubicación*).\n` +
      `*atrás* = corregir la descripción · *menú* = salir.`
    );
  }
  return (
    base +
    `*1)* Datos del servicio (*NIS*, medidor, ID o número de vecino).\n` +
    `*2)* *Nombre y apellido* + domicilio.\n` +
    opt3 +
    `Podés enviar *GPS* con *Adjuntar* → *Ubicación*.\n` +
    `*atrás* = corregir la descripción · *menú* = salir.`
  );
}

/**
 * @param {{ tipo?: string, tipos?: string[] }} ctx
 */
export function mensajeOpcion3NoDisponibleCoop(ctx) {
  const fraudLabel = (ctx.tipos || []).includes(TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA)
    ? `*${TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA}*`
    : "la opción de *denuncia de fraude (anónima)*";
  return (
    "Para reclamos de la cooperativa necesitamos *identificarte* " +
    "(*NIS* o *medidor*, o *nombre y apellido* con domicilio) para poder gestionarlos.\n\n" +
    `Si querés reportar un *fraude sin identificarte*, escribí *menú* y elegí ${fraudLabel} en el menú principal.\n\n` +
    "Respondé *1* o *2* según el mensaje anterior."
  );
}

export function mensajeIntroDescripcionDenunciaFraudeAnonima() {
  return (
    `Elegiste: *${TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA}*.\n\n` +
    "Tu *nombre y datos de contacto no se guardan* en el sistema para este reclamo.\n\n" +
    "Contanos *qué ocurrió* con el mayor detalle posible (situación, lugar, personas o medidor involucrados, fechas aproximadas).\n\n"
  );
}

/**
 * Pie opcional en menú numerado de tipos (cooperativa eléctrica).
 */
export function pieMenuTiposCooperativaElectrica() {
  return (
    `\n_Para *denuncia anónima de fraude* (sin nombre ni NIS), elegí *${TIPO_DENUNCIA_FRAUDE_ANONIMA_COOPERATIVA}*._`
  );
}
