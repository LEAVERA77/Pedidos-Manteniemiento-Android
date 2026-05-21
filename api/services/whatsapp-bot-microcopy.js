/**
 * Textos del bot WhatsApp (base estática + paridad con IA opcional en groqWhatsappBotMicrocopy.js).
 * made by leavera77
 */

import { normalizarRubroCliente } from "./tiposReclamo.js";

/**
 * @param {{ tipo?: string|null, nombre?: string }} ctx
 */
export function mensajePedirNombrePersonaEstatico(ctx) {
  const r = normalizarRubroCliente(ctx?.tipo);
  let tipPadron =
    "\n\n*Consejo:* si no sabés tu número de cliente, escribí solo el *apellido* (ej: *González*) y te mostramos titulares parecidos del padrón para elegir el correcto.";
  if (r === "cooperativa_electrica") {
    tipPadron =
      "\n\n*Sin NIS:* escribí solo el *apellido* del titular y te listamos coincidencias del padrón para que elijas tu suministro.";
  } else if (r === "municipio") {
    tipPadron =
      "\n\n*Sin número de vecino:* probá con el *apellido* y elegí tu nombre en la lista del padrón.";
  } else if (r === "cooperativa_agua") {
    tipPadron =
      "\n\n*Sin ID de usuario:* escribí el *apellido* y te mostramos opciones del padrón.";
  }
  return (
    "¿Cuál es tu *nombre y apellido* (o del titular del reclamo)?" +
    tipPadron +
    "\n\nTambién podés escribir el nombre completo si lo preferís."
  );
}

/**
 * @param {{ tipo?: string|null }} ctx
 */
export function mensajeOpcionalIdentificadorConsejoIa(ctx) {
  const r = normalizarRubroCliente(ctx?.tipo);
  if (r === "cooperativa_electrica") {
    return (
      "\n\nSi no tenés NIS ni medidor, escribí *no* y en el siguiente paso podés buscar por *apellido* en el padrón."
    );
  }
  if (r === "municipio") {
    return "\n\nSi no tenés credencial, escribí *no* y buscá por *apellido* en el padrón.";
  }
  return "\n\nSi no tenés el dato, escribí *no* y seguimos con nombre (podés usar solo el *apellido* para ver opciones del padrón).";
}

/**
 * @param {string} tipoSel
 * @param {number} maxOtros
 */
export function mensajeIntroDescripcionReclamoEstatico(tipoSel, maxOtros) {
  const t = String(tipoSel || "").trim();
  if (t === "Otros") {
    return `Elegiste: *${t}*.\n\nDescribí tu reclamo (máximo *${maxOtros}* caracteres). Sé concreto: *qué pasa*, *dónde* y desde *cuándo* (si aplica).\n\n`;
  }
  return (
    `Elegiste: *${t}*.\n\nAhora escribí una *breve descripción* del problema: qué ocurre, dónde y desde cuándo (si sabés).\n\n`
  );
}

/**
 * @param {string} textoIngresado
 */
export function mensajeNombreSinCoincidenciaPadron(textoIngresado) {
  const t = String(textoIngresado || "").trim();
  const palabras = t.split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) {
    const ap = palabras[palabras.length - 1];
    return (
      `No encontré *tus datos* en el padrón con ese nombre.\n\n` +
      `Probá de nuevo escribiendo solo el *apellido* (ej: *${ap}*) para ver la lista de titulares.\n\n`
    );
  }
  return "No encontré *tus datos* en el padrón con ese nombre.\n\n";
}

/** Extrae apellido probable para segunda búsqueda (última palabra con ≥3 letras). */
export function extraerApellidoProbableBusquedaNombre(texto) {
  const norm = String(texto || "")
    .trim()
    .replace(/\s+/g, " ");
  const palabras = norm.split(" ").filter((p) => /[\p{L}]{2,}/u.test(p));
  if (palabras.length < 2) return null;
  const candidatos = [palabras[palabras.length - 1], palabras[0]].map((p) => p.trim()).filter(Boolean);
  for (const c of candidatos) {
    const limpio = c.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s-]/g, "").trim();
    if (limpio.length >= 3) return limpio;
  }
  return null;
}
