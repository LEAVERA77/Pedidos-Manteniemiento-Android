import { randomBytes } from "crypto";
import { query } from "../db/neon.js";
import {
  sendWhatsAppInteractiveListWithCredentials,
  sendWhatsAppInteractiveButtonsWithCredentials,
  decodeWhatsAppListRowId,
  normalizeWhatsAppRecipientForMeta,
  maskWaDigitsForLog,
} from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";
import {
  getWhatsAppCredentialsByMetaPhoneNumberId,
  getWhatsAppCredentialsForTenant,
  sendBotWhatsAppText,
  sendTenantWhatsAppText,
} from "./whatsappService.js";
import { crearPedidoDesdeWhatsappBot } from "./pedidoWhatsappBot.js";
import {
  WA_PEDIDO_FOTO_BTN_GALERIA,
  WA_PEDIDO_FOTO_BTN_CAMARA,
  WA_PEDIDO_FOTO_BTN_OMITIR,
  whatsappPedidoSubirFotoDesdeMediaId,
  destroyCloudinaryImageBySecureUrl,
} from "./whatsappPedidoFotoHelpers.js";
import {
  geocodWaOperacionCreate,
  geocodWaOperacionFinishErr,
  enmascararTelefonoWhatsapp,
} from "./geocodWaOperaciones.js";
import {
  buscarIdentidadParaReclamoWhatsApp,
  soloDigitosIdentificadorReclamo,
} from "./whatsappReclamanteLookup.js";
import {
  tiposReclamoParaClienteTipo,
  normalizarRubroCliente,
  tipoReclamoWhatsappFlujoSoloNis,
  tipoReclamoElectricoPideSuministroWhatsapp,
} from "./tiposReclamo.js";
import { resolveTenantIdByMetaPhoneNumberId } from "./metaTenantWhatsapp.js";
import { tryConsumeClienteOpinionReply, hasPendingClienteOpinion } from "./whatsappClienteOpinion.js";
import { reverseGeocodeArgentina } from "./nominatimClient.js";
import {
  humanChatOpenOrGetSession,
  humanChatQueueSnapshot,
  humanChatAppendInbound,
  humanChatCloseBySessionId,
  humanChatFindOpenSessionForPhone,
} from "./whatsappHumanChat.js";
import { derivacionReclamosDesdeConfig } from "../utils/derivacionReclamos.js";
import { validarLocalidadParaChatWhatsapp, normalizarNombreLocalidad } from "./tenantLocalidades.js";
import {
  whatsappBotEnvHardDisabled,
  isWhatsAppAutomatedBotDisabled,
  isPhoneWhatsappBotMasterAsync,
  parseActivarDesactivarComando,
  setGlobalBotActiveDb,
  isPhoneWhatsappHumanChatDirect,
} from "./globalBotState.js";

const sessions = new Map();

const MSG_SALIR_ATRAS =
  "\n\n_Escribí *menú* o *0* para salir · *atrás* para el paso anterior._";

const MSG_ADDR_CIUDAD =
  "¿En qué *ciudad o localidad* está el reclamo? (ej: *Hasenkamp*, *Rosario*).\n\n" +
  "Lo más preciso es *ubicación GPS*: *Adjuntar* (📎) → *Ubicación*. " +
  "Si no podés, escribí bien la *localidad* y luego *calle y número*.\n\n" +
  "_Al enviar ubicación GPS, aceptás que se use únicamente para ubicar el reclamo en el mapa._" +
  MSG_SALIR_ATRAS;

/** 24 jurisdicciones (Nominatim / Argentina). */
const PROVINCIAS_ARG_BOT = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

const MSG_ADDR_PROVINCIA =
  "¿De qué *provincia* es la localidad?\n\n" +
  PROVINCIAS_ARG_BOT.map((p, i) => `*${i + 1}.* ${p}`).join("\n") +
  "\n\nRespondé con el *número* del 1 al 24." +
  MSG_SALIR_ATRAS;

/** Tras elegir provincia (1–24), pedimos la ciudad usando el catálogo nacional filtrado por esa provincia. */
function msgCiudadLuegoDeProvincia(prov) {
  return `Provincia elegida: *${prov}*.\n\n${MSG_ADDR_CIUDAD}`;
}

/** Mapea texto de provincia (Nominatim/OSM) al nombre de la lista del bot. */
function provinciaBotDesdeTextoOsm(stateRaw) {
  if (!stateRaw || typeof stateRaw !== "string") return null;
  const s = normalizarNombreLocalidad(String(stateRaw).trim());
  for (const p of PROVINCIAS_ARG_BOT) {
    if (normalizarNombreLocalidad(p) === s) return p;
  }
  if (s.startsWith("tierra del fuego")) return "Tierra del Fuego";
  if (s.includes("ciudad autonoma") && s.includes("buenos aires")) return "Ciudad Autónoma de Buenos Aires";
  return null;
}

const MSG_ADDR_CALLE =
  "Ahora escribí el *nombre de la calle* (sin número), por ejemplo *Mitre* o *Sarmiento*.\n\n" +
  "_En cualquier momento podés mandar *GPS* con *Adjuntar* → *Ubicación*._" +
  MSG_SALIR_ATRAS;

const MSG_ADDR_NUMERO =
  "Por último el *número de puerta* (ej: *315*). Con esto intentamos ubicar el reclamo en el mapa.\n\n" +
  "_Si podés enviar *ubicación GPS* (*Adjuntar* → *Ubicación*), el pin será más exacto._" +
  MSG_SALIR_ATRAS;

const MSG_SUMINISTRO_CONEXION =
  "Para este tipo de reclamo necesitamos datos del *suministro eléctrico*.\n\n" +
  "¿La conexión es *1)* *Aérea* o *2)* *Subterránea*?" +
  MSG_SALIR_ATRAS;

const MSG_SUMINISTRO_FASES =
  "¿La instalación es *1)* *Monofásica* o *2)* *Trifásica*?" + MSG_SALIR_ATRAS;

const MSG_NOMBRE_PERSONA =
  "¿Cuál es tu *nombre y apellido* (o nombre del titular del reclamo)?" + MSG_SALIR_ATRAS;

const BLOQUEO_RECLAMOS_MSG_DEFAULT =
  "Por el momento no podemos registrar reclamos por WhatsApp. Pedimos disculpas; comunicate por los canales habituales de la empresa.";

/** En estos pasos se acepta ubicación GPS por adjunto. */
const WHATSAPP_STEPS_ADJUNTAR_GPS = new Set([
  "awaiting_desc",
  "awaiting_identificacion_modo",
  "awaiting_nombre_persona",
  "awaiting_opcional_id",
  "awaiting_addr_ciudad",
  "awaiting_addr_provincia",
  "awaiting_addr_calle",
  "awaiting_addr_numero",
  "awaiting_suministro_conexion",
  "awaiting_suministro_fases",
]);

/** En estos pasos *volver* / *atrás* debe manejar el flujo, no reiniciar al menú principal. */
const WHATSAPP_PASOS_VOLVER_ES_ATRAS = new Set([
  "awaiting_desc",
  "awaiting_factibilidad_post_gps",
  "awaiting_identificacion_modo",
  "awaiting_nombre_persona",
  "awaiting_addr_ciudad",
  "awaiting_addr_provincia",
  "awaiting_addr_calle",
  "awaiting_addr_numero",
  "awaiting_suministro_conexion",
  "awaiting_suministro_fases",
  "awaiting_opcional_id",
  "awaiting_nis_whatsapp",
  "awaiting_confirmar_resumen",
  "awaiting_wa_foto_opcional",
  "awaiting_wa_foto_upload",
]);

/** En estos pasos *0* es dato (puerta sin número / omitir ID), no «salir al menú». */
const WHATSAPP_PASOS_CERO_ES_DATO = new Set([
  "awaiting_addr_numero",
  "awaiting_opcional_id",
]);

/**
 * Comandos que borran la sesión y muestran el menú principal.
 * No deben ejecutarse antes que los pasos del flujo cuando el texto es parte del reclamo.
 */
function debeSalirAlMenuPrincipalWhatsApp(lower, sess) {
  if (sess && sess.step === "human_chat") return false;
  if (lower === "menú" || lower === "menu" || lower === "inicio" || lower === "ayuda") return true;
  if (lower === "volver") {
    if (sess && WHATSAPP_PASOS_VOLVER_ES_ATRAS.has(sess.step)) return false;
    return true;
  }
  if (lower === "0") {
    if (sess && WHATSAPP_PASOS_CERO_ES_DATO.has(sess.step)) return false;
    return true;
  }
  if (lower === "cancelar" || lower === "cancel") {
    if (sess && sess.step === "human_chat") return false;
    return true;
  }
  return false;
}

/** Localidad: mínimo útil, al menos una letra, no solo números/símbolos; lista negra corta. */
const LOCALIDAD_BLACKLIST = new Set([
  "asd",
  "qwe",
  "xxx",
  "test",
  "prueba",
  "aaa",
  "eee",
  "fff",
  "na",
  "s/n",
  "sn",
  "n/a",
  "hola",
  "ninguna",
  "ninguno",
]);

function validarLocalidadWhatsApp(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;-]+|[\s,.;-]+$/g, "")
    .trim();
  if (t.length < 3) {
    return {
      ok: false,
      msg: "La *ciudad o localidad* debe tener al menos *3 caracteres*. Escribí el nombre completo (ej: *Hasenkamp*, *Rosario*).",
    };
  }
  if (!/[a-záéíóúüñ]/i.test(t)) {
    return {
      ok: false,
      msg: "La localidad debe incluir *letras* (no solo números o símbolos). Probá de nuevo.",
    };
  }
  const lower = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (LOCALIDAD_BLACKLIST.has(lower)) {
    return {
      ok: false,
      msg: "Ese texto no sirve como *localidad*. Escribí el nombre real de tu ciudad o pueblo.",
    };
  }
  if (/^[\d\s.\-_,;]+$/.test(t)) {
    return { ok: false, msg: "La localidad no puede ser *solo números*. Escribí el nombre con letras." };
  }
  return { ok: true, value: t };
}

/** Calle: al menos 2 caracteres y al menos una letra. */
function validarCalleWhatsApp(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;-]+|[\s,.;-]+$/g, "")
    .trim();
  if (t.length < 2) {
    return { ok: false, msg: "Indicá el *nombre de la calle* con al menos 2 caracteres." };
  }
  if (!/[a-záéíóúüñ]/i.test(t)) {
    return { ok: false, msg: "El nombre de calle debe tener *letras* (no solo números o símbolos)." };
  }
  return { ok: true, value: t };
}

const _MESES_VIA_ARG =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

/** Nombre de vía donde un dígito forma parte del nombre (no confundir con número de puerta). */
function esNombreViaConDigitosLegitimos(rest) {
  const r = String(rest || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!r) return false;
  if (/^calle\s+\d{1,3}$/i.test(r)) return true;
  if (/^pasaje\s+\d{1,3}$/i.test(r)) return true;
  if (new RegExp(`^\\d{1,2}\\s+de\\s+(${_MESES_VIA_ARG})$`, "i").test(r)) return true;
  if (/^(ruta|camino)\s+\d{1,4}$/i.test(r)) return true;
  return false;
}

/**
 * Paso *solo calle*: rechaza "Sarmiento 365" (número de puerta al final); admite "9 de Julio 200", "Calle 5 10", etc.
 * @returns {{ ok: boolean, msg?: string, calle?: string, numeroSugerido?: string|null }}
 */
function analizarEntradaCalleWhatsapp(raw) {
  const base = validarCalleWhatsApp(raw);
  if (!base.ok) return base;
  const t = base.value;

  if (/^calle\s+\d{1,3}$/i.test(t)) {
    return { ok: true, calle: t, numeroSugerido: null };
  }
  if (new RegExp(`^\\d{1,2}\\s+de\\s+(${_MESES_VIA_ARG})$`, "i").test(t)) {
    return { ok: true, calle: t, numeroSugerido: null };
  }
  if (/^(ruta|camino)\s+\d{1,4}$/i.test(t)) {
    return { ok: true, calle: t, numeroSugerido: null };
  }
  if (/^pasaje\s+\d{1,3}$/i.test(t)) {
    return { ok: true, calle: t, numeroSugerido: null };
  }

  const mTrail = t.match(/^(.+?)\s+(\d{1,6})$/);
  if (!mTrail) {
    return { ok: true, calle: t, numeroSugerido: null };
  }
  const rest = mTrail[1].trim();
  const numTok = mTrail[2];
  if (esNombreViaConDigitosLegitimos(rest)) {
    return { ok: true, calle: rest, numeroSugerido: numTok };
  }
  return {
    ok: false,
    msg:
      "En este paso va *solo el nombre de la calle*, *sin número de puerta*.\n\n" +
      "Ej.: *Sarmiento* o *Mitre* (el número lo pedimos después).\n\n" +
      "Si tu calle es *9 de Julio*, *25 de Mayo* o *Calle 5*, escribí el nombre completo en este paso; el número de puerta lo indicás en el siguiente.",
  };
}

/** Puerta: solo dígitos, 1 a 6; *0* = sin número / no aplica. */
function validarNumeroPuertaWhatsApp(raw) {
  const t = String(raw || "").trim();
  if (t === "0") return { ok: true, value: "0" };
  if (!/^\d{1,6}$/.test(t)) {
    return {
      ok: false,
      msg:
        "El *número de puerta* debe ser *solo dígitos* (1 a 6 cifras), sin letras ni símbolos. Ejemplo: *315*. Si no hay número, escribí *0*.",
    };
  }
  return { ok: true, value: t };
}

function interpretaConfirmacionResumenWhatsapp(raw) {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return null;
  if (t === "si" || t === "ok" || t === "dale" || t === "listo" || t === "confirmo" || t === "1" || t === "si.") return "si";
  if (t === "no" || t === "2" || t === "cancelar" || t === "nop") return "no";
  return null;
}

/** Número de opción del menú principal solo si el mensaje es únicamente dígitos (evita parseInt("1 texto") === 1). */
function enteroMenuPrincipalDesdeTextoLibre(raw) {
  const t = String(raw || "").trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function interpretaMenuIdentificacion(raw) {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return 0;
  if (t === "1" || t === "1." || t.startsWith("1)") || t === "uno" || /^1\s+/.test(t)) return 1;
  if (t === "2" || t === "2." || t.startsWith("2)") || t === "dos" || /^2\s+/.test(t)) return 2;
  return 0;
}

/** Tras GPS en factibilidad: 1 servicio / 2 nombre y dirección; null = texto no reconocido (*0* sale al menú vía `debeSalirAlMenuPrincipalWhatsApp`). */
function interpretaOpcionFactibilidadPostGpsWhatsapp(raw) {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return null;
  if (t === "1" || t === "1." || t.startsWith("1)") || t === "uno" || /^1\s+/.test(t)) return "servicio";
  if (t === "2" || t === "2." || t.startsWith("2)") || t === "dos" || /^2\s+/.test(t)) return "nombre";
  return null;
}

function esPedidoFactibilidadNuevoServicioWhatsapp(tipo) {
  return /factibilidad/i.test(String(tipo || "").trim());
}

function mensajeMenuIdentificacion(ctx) {
  const r = normalizarRubroCliente(ctx.tipo);
  const base =
    `Ya tenemos la *descripción* del problema. Ahora necesitamos *identificar* y *ubicar* el reclamo.\n\n` +
    `Elegí *una opción* respondiendo con *1* o *2*:\n\n`;
  if (r === "cooperativa_electrica") {
    return (
      base +
      `*1)* Tengo *NIS* o *número de medidor* (dato de la cooperativa eléctrica).\n` +
      `*2)* Prefiero con *nombre y dirección* (sin datos de cuenta).\n\n` +
      `En cualquier momento podés enviar *GPS* con *Adjuntar* (📎) → *Ubicación*.\n` +
      `*atrás* = corregir la descripción · *menú* / *0* = salir.`
    );
  }
  if (r === "cooperativa_agua") {
    return (
      base +
      `*1)* Tengo *ID de usuario* o *número de medidor* del servicio de agua.\n` +
      `*2)* Prefiero con *nombre y dirección*.\n\n` +
      `También podés mandar *ubicación GPS* con *Adjuntar* → *Ubicación*.\n` +
      `*atrás* = corregir la descripción · *menú* / *0* = salir.`
    );
  }
  if (r === "municipio") {
    return (
      base +
      `*1)* Tengo mi *número de vecino* (credencial / cuenta municipal).\n` +
      `*2)* Prefiero con *nombre y dirección*.\n\n` +
      `Podés adjuntar *ubicación* en cualquier momento (📎 → *Ubicación*).\n` +
      `*atrás* = corregir la descripción · *menú* / *0* = salir.`
    );
  }
  return (
    base +
    `*1)* Datos del servicio (*NIS*, medidor, ID o número de vecino).\n` +
    `*2)* *Nombre y dirección* sin datos de cuenta.\n\n` +
    `Podés enviar *GPS* con *Adjuntar* → *Ubicación*.\n` +
    `*atrás* = corregir la descripción · *menú* / *0* = salir.`
  );
}

function msgOpcionalIdentificadorPorRubro(ctx) {
  const r = normalizarRubroCliente(ctx.tipo);
  if (r === "cooperativa_electrica") {
    return (
      `Si tenés *NIS* o *número de medidor*, enviálo en un solo mensaje (completamos tu nombre desde el sistema).\n\n` +
      `Si no tenés esos datos, escribí *no* y te pedimos *nombre* y *dirección* paso a paso.` +
      MSG_SALIR_ATRAS
    );
  }
  if (r === "cooperativa_agua") {
    return (
      `Si tenés *ID de usuario* o *número de medidor*, enviálo en un mensaje.\n\n` +
      `Si no, escribí *no* y continuamos con *nombre* y *dirección*.` +
      MSG_SALIR_ATRAS
    );
  }
  if (r === "municipio") {
    return (
      `Si tenés tu *número de vecino* (credencial municipal), enviálo.\n\n` +
      `Si no, escribí *no* y te pedimos *nombre* y *dirección* paso a paso.` +
      MSG_SALIR_ATRAS
    );
  }
  return (
    `Si tenés *NIS*, *medidor*, *ID* o *número de cliente*, escribilo.\n\n` +
    `Si preferís seguir sin eso, escribí *no*.` +
    MSG_SALIR_ATRAS
  );
}

const MSG_PEDIR_NIS_SOLO =
  "Para este tipo de reclamo necesitamos el *NIS* o *número de medidor* en un solo mensaje (sin letras extra si podés)." +
  MSG_SALIR_ATRAS;

function esComandoAtras(texto) {
  const t = String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    t === "atras" ||
    t === "volver" ||
    t === "volve" ||
    t.startsWith("volver ") ||
    t === "anterior"
  );
}

function resolveWhatsappBloqueoReclamos(cfgObj) {
  const c = cfgObj && typeof cfgObj === "object" ? cfgObj : {};
  const envOn =
    process.env.WHATSAPP_BLOQUEO_RECLAMOS === "1" ||
    process.env.WHATSAPP_BLOQUEO_RECLAMOS === "true";
  const tenantOn =
    c.whatsapp_bloqueo_reclamos === true ||
    c.whatsapp_bloqueo_reclamos === "true" ||
    c.whatsapp_bloqueo_reclamos === 1 ||
    c.whatsapp_bloqueo_reclamos === "1";
  const mensaje = String(c.whatsapp_bloqueo_mensaje || process.env.WHATSAPP_BLOQUEO_MENSAJE || "").trim();
  return {
    active: envOn || tenantOn,
    mensaje: mensaje || BLOQUEO_RECLAMOS_MSG_DEFAULT,
  };
}

/** Texto libre aceptable como nombre o referencia (no lookup en base). */
function esIdentificacionLibreRazonable(texto) {
  const t = String(texto || "").trim();
  if (t.length < 3 || t.length > 500) return false;
  const soloDig = soloDigitosIdentificadorReclamo(t);
  if (
    soloDig.length >= 4 &&
    soloDig.length <= 20 &&
    /^[\d\s.\-_\u00a0/]+$/u.test(t.replace(/\u00a0/g, " "))
  ) {
    return false;
  }
  if (!/[\p{L}\p{N}]/u.test(t)) return false;
  const sinEsp = t.replace(/\s/g, "");
  if (sinEsp.length < 2) return false;
  return true;
}

/** Si conviene usar el texto como contactName del pedido (evita pisar con direcciones muy numéricas). */
function pareceNombreParaContactoWhatsapp(texto) {
  const t = String(texto || "").trim();
  if (t.length < 2 || t.length > 120) return false;
  const digitCount = (t.match(/\d/g) || []).length;
  if (digitCount > 5) return false;
  return /[\p{L}]{2,}/u.test(t);
}

function botTenantId() {
  return Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
}

function sessionKey(phoneDigits, tenantId) {
  return `${String(phoneDigits || "").replace(/\D/g, "")}:${Number(tenantId)}`;
}

function trimOrNullWhatsapp(v) {
  const s = v != null ? String(v).trim() : "";
  return s ? s : null;
}

function necesitaCapturarSuministroElectrico(sess) {
  if (normalizarRubroCliente(sess?.tipoCliente) !== "cooperativa_electrica") return false;
  if (!tipoReclamoElectricoPideSuministroWhatsapp(sess?.tipo)) return false;
  return !trimOrNullWhatsapp(sess?.suministroTipoConexion) || !trimOrNullWhatsapp(sess?.suministroFases);
}

/** Rellena sesión solo con valores no vacíos del catálogo (no borra datos ya capturados). */
function aplicarSuministroCatalogoWhatsappRes(sess, res) {
  if (!sess || !res) return;
  const t = trimOrNullWhatsapp(res.catalogoTipoConexion);
  const f = trimOrNullWhatsapp(res.catalogoFases);
  if (t) sess.suministroTipoConexion = t;
  if (f) sess.suministroFases = f;
  const prov = trimOrNullWhatsapp(res.catalogoProvincia);
  if (prov) sess.catalogoProvinciaParaGeocode = prov;
  if (prov && !trimOrNullWhatsapp(sess.addrProvincia)) sess.addrProvincia = prov;
  const cpRaw =
    res.catalogoCodigoPostal != null && String(res.catalogoCodigoPostal).trim()
      ? String(res.catalogoCodigoPostal).replace(/\D/g, "")
      : "";
  const cpOk = cpRaw.length >= 4 && cpRaw.length <= 8 ? cpRaw : "";
  if (cpOk && !trimOrNullWhatsapp(sess.addrCodigoPostal)) sess.addrCodigoPostal = cpOk;
}

/** Solo nota de proximidad del padrón (el pin lo define regeocodificarPedido tras el INSERT). */
function aplicarPadronCoordsWhatsapp(sess, res) {
  if (!sess || !res) return;
  const nota = res.notaUbicacionProximidad != null ? String(res.notaUbicacionProximidad).trim() : "";
  if (nota) sess.notaUbicacionInternaWhatsapp = nota;
}

/** Texto breve para chat: provincia y CP del padrón si existen. */
function lineasExtraPadronWhatsapp(res) {
  if (!res) return "";
  const prov = trimOrNullWhatsapp(res.catalogoProvincia);
  const cpRaw =
    res.catalogoCodigoPostal != null && String(res.catalogoCodigoPostal).trim()
      ? String(res.catalogoCodigoPostal).replace(/\D/g, "")
      : "";
  const cpOk = cpRaw.length >= 4 && cpRaw.length <= 8 ? cpRaw : "";
  const lines = [];
  if (prov) lines.push(`Provincia: *${prov}*`);
  if (cpOk) lines.push(`Código postal: *${cpOk}*`);
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

function interpretaSuministroConexionWhatsapp(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t === "1" || t === "1." || t.startsWith("1)") || t === "uno" || /^1\s+/.test(t)) return "Aéreo";
  if (t === "2" || t === "2." || t.startsWith("2)") || t === "dos" || /^2\s+/.test(t)) return "Subterráneo";
  if (t.includes("subter") || t.includes("subterr")) return "Subterráneo";
  if (t.includes("aereo") || t.includes("aérea") || t.includes("aire")) return "Aéreo";
  return null;
}

function interpretaSuministroFasesWhatsapp(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t === "1" || t === "1." || t.startsWith("1)") || t === "uno" || /^1\s+/.test(t)) return "Monofásico";
  if (t === "2" || t === "2." || t.startsWith("2)") || t === "dos" || /^2\s+/.test(t)) return "Trifásico";
  if (t.includes("tri")) return "Trifásico";
  if (t.includes("mono")) return "Monofásico";
  return null;
}

function normCfg(cfg) {
  if (!cfg || typeof cfg !== "object") return {};
  return cfg;
}

async function loadTenantBotContext(tenantId) {
  const r = await query(
    `SELECT id, nombre, tipo, configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`,
    [tenantId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  let cfg = row.configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch (_) {
      cfg = {};
    }
  }
  const c = normCfg(cfg);
  const bloqueo = resolveWhatsappBloqueoReclamos(c);
  const provRaw = c.provincia ?? c.state ?? c.provincia_nominatim ?? c.provincia_geocode;
  const geocodeState =
    provRaw != null && String(provRaw).trim().length >= 2 ? String(provRaw).trim() : null;
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    lat: c.lat_base != null ? Number(c.lat_base) : null,
    lng: c.lng_base != null ? Number(c.lng_base) : null,
    geocodeState,
    tipos: tiposReclamoParaClienteTipo(row.tipo),
    whatsappBloqueoReclamos: bloqueo.active,
    whatsappBloqueoMensaje: bloqueo.mensaje,
    derivacionReclamos: derivacionReclamosDesdeConfig(c),
    bienvenida: String(c.whatsapp_bienvenida || "").trim() || null,
  };
}

/** Límite conservador (Meta Cloud API ~4096). */
const META_DERIVACION_MAX_CHARS = 3800;

function waMeUrlFromInternational(wa) {
  const d = String(wa || "")
    .trim()
    .replace(/^\+/, "");
  if (!/^\d{8,22}$/.test(d)) return null;
  return `https://wa.me/${d}`;
}

/**
 * Opción B (spec): menú / comando *Otros servicios* para orientar vecinos (coop. eléctrica).
 */
function formatDerivacionBotMessage(ctx) {
  const dr = ctx.derivacionReclamos;
  if (!dr) return "";
  const parts = [];
  parts.push("*Otros servicios (agua / energía)*");
  parts.push("");
  parts.push("Este canal gestiona reclamos de *energía eléctrica*.");
  parts.push("");
  if (dr.cooperativa_agua) {
    const n = dr.cooperativa_agua.nombre || "Cooperativa de agua";
    const u = dr.cooperativa_agua.whatsapp ? waMeUrlFromInternational(dr.cooperativa_agua.whatsapp) : null;
    parts.push(`*Agua potable:* ${n}`);
    parts.push(u || "_(WhatsApp no configurado)_");
    parts.push("");
  }
  if (dr.empresa_energia) {
    const n = dr.empresa_energia.nombre || "Empresa de energía";
    const u = dr.empresa_energia.whatsapp ? waMeUrlFromInternational(dr.empresa_energia.whatsapp) : null;
    parts.push(`*Otra distribuidora / energía:* ${n}`);
    parts.push(u || "_(WhatsApp no configurado)_");
    parts.push("");
  }
  let s = parts.join("\n").trim();
  if (s.length > META_DERIVACION_MAX_CHARS) {
    s = `${s.slice(0, META_DERIVACION_MAX_CHARS - 1)}…`;
  }
  return s;
}

function textoBienvenidaYAyuda(ctx) {
  const n = ctx.nombre || "nuestro servicio";
  const max = ctx.tipos?.length || 0;
  const bienvenida = ctx.bienvenida ? `\n\n${ctx.bienvenida}\n` : "";
  return (
    `Bienvenido al centro de atención de *${n}*.${bienvenida}\n\n` +
    (max
      ? `Si preferís, escribí solo el *número* del *1* al *${max}* según esta guía:\n\n${ctx.tipos.map((t, i) => `${i + 1}) ${t}`).join("\n")}\n\n`
      : "") +
    `Enviá *menú* o *0* para repetir este mensaje.`
  );
}

/** Menú solo texto (respaldo si la lista interactiva falla o clientes antiguos). */
function menuTextoNumerado(ctx) {
  const lineas = [
    `📋 *${ctx.nombre || "Pedidos"}*`,
    "",
    "Escribí el *número* de tu reclamo:",
    "",
  ];
  ctx.tipos.forEach((t, i) => {
    lineas.push(`${i + 1}) ${t}`);
  });
  lineas.push("");
  lineas.push("Para *salir*: *menú* o *0*.");
  return lineas.join("\n");
}

function esPedidoCargarReclamo(text) {
  const n = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/\bcargar\s+reclamo\b/.test(n)) return true;
  if (/\bnuevo\s+reclamo\b/.test(n)) return true;
  if (/\bquiero\s+(hacer\s+)?(un\s+)?reclamo\b/.test(n)) return true;
  if (n === "reclamo" || n === "lista" || n === "tipos") return true;
  return false;
}

/** Resuelve tenant para enviar con el mismo número/token que recibió el webhook (multitenant). */
async function tenantIdForWebhook(phoneNumberId) {
  const resolved = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  return resolved != null && Number.isFinite(Number(resolved)) ? Number(resolved) : botTenantId();
}

async function reply(phoneDigits, text, tenantId, webhookPhoneNumberId = null) {
  const digitsCanon = String(phoneDigits || "").replace(/\D/g, "");
  console.log("[BOT_RESPUESTA] toDigits del remitente (inbound, debe coincidir con [WEBHOOK] from procesado)", {
    ...maskWaDigitsForLog(digitsCanon),
    tenantId: tenantId != null && Number.isFinite(Number(tenantId)) ? Number(tenantId) : botTenantId(),
  });
  const tid =
    tenantId != null && Number.isFinite(Number(tenantId)) && Number(tenantId) >= 1
      ? Number(tenantId)
      : botTenantId();
  const wpid = webhookPhoneNumberId != null ? String(webhookPhoneNumberId).trim() : "";
  const r = wpid
    ? await sendBotWhatsAppText({
        tenantId: tid,
        webhookPhoneNumberId: wpid,
        toDigits: phoneDigits,
        bodyText: text,
        logContext: "whatsapp_bot_meta",
      })
    : await sendTenantWhatsAppText({
        tenantId: tid,
        toDigits: phoneDigits,
        bodyText: text,
        logContext: "whatsapp_bot_meta",
      });
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] send failed", {
      tenantId: tid,
      error: r.error,
      graph: r.graph?.error || r.graph,
    });
  } else {
    console.log("[webhook-meta-whatsapp] outbound_sent", {
      to: String(phoneDigits || "").replace(/\D/g, "").slice(0, 4) + "…",
      ok: true,
      tenantId: tid,
    });
  }
  return r;
}

const TIPO_RECLAMO_OTROS = "Otros";

async function iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx) {
  const sk = sessionKey(phone, tid);
  try {
    const { id: sessionDbId, isNew } = await humanChatOpenOrGetSession(tid, phone, contactName);
    const snap = await humanChatQueueSnapshot(tid, sessionDbId);
    sessions.set(sk, {
      step: "human_chat",
      humanChatSessionId: sessionDbId,
      tenantId: tid,
      tipoCliente: ctx.tipo,
      contactName: contactName || null,
      phoneNumberId: wpid,
      humanChatFirstAcked: !isNew,
    });
    let body;
    if (snap.otherActive) {
      body =
        `En este momento otro cliente está en *atención* con un representante.\n\n` +
        `Estás en *lista de espera* (lugar aproximado en la cola: *${snap.position}* de *${snap.totalOpen}*).\n\n` +
        `Podés escribir tu *consulta* igualmente; quedará registrada y te atenderemos en orden.`;
    } else if (snap.position > 1) {
      body =
        `Elegiste *Otros*: te derivamos a un *representante humano*.\n\n` +
        `Hay *${snap.position - 1}* persona(s) antes que vos en la cola. Un representante te atenderá a la brevedad.\n\n` +
        `Escribí tu *mensaje* por acá. Para volver al *menú automático*, escribí *menú*, *salir* o *fin*.`;
    } else {
      body =
        `Elegiste *Otros*: te derivamos a un *representante humano*.\n\n` +
        `Escribí tu *consulta* o pregunta por este chat; te responderemos a la brevedad.\n\n` +
        `Para volver al *menú automático*, escribí *menú*, *salir* o *fin*.`;
    }
    await reply(phone, body, tid, wpid);
  } catch (e) {
    console.error("[whatsapp-bot-meta] iniciarFlujoOtrosHumano", e);
    await reply(
      phone,
      "No pudimos iniciar el chat con un representante. Intentá más tarde o escribí *menú*.",
      tid,
      wpid
    );
  }
}

/**
 * Extrae lat/lng del mensaje Cloud API tipo `location` (msg.location).
 * @returns {{ lat: number, lng: number } | null}
 */
export function extractLocationFromMetaMessage(msg) {
  if (!msg || String(msg.type || "") !== "location") return null;
  const loc = msg.location || {};
  const la = Number(loc.latitude);
  const lo = Number(loc.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lng: lo };
}

/** Ciudad / calle / número desde Nominatim reverse (`addressdetails`). */
function extraerCiudadCalleNumeroDesdeReverse(rev) {
  if (!rev?.address || typeof rev.address !== "object") return null;
  const a = rev.address;
  const ciudad = String(
    a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.city_district ||
      a.county ||
      a.state_district ||
      ""
  ).trim();
  const calle = String(
    a.road || a.pedestrian || a.path || a.footway || a.residential || a.street || ""
  ).trim();
  const hn = String(a.house_number || "").trim();
  const numero = hn.length ? hn : "0";
  if (ciudad.length < 2 || calle.length < 2) return null;
  return { ciudad, calle, numero };
}

/**
 * GPS en pasos de domicilio: reverse OSM + misma ruta que texto → `geocodeStructuredAddressAndFinalizePedido`.
 * Si el usuario ya cargó localidad/calle por texto, se respeta y se completa con el reverse.
 */
async function inferirDireccionDesdeGpsYGeocodificar(
  phone,
  sess,
  sk,
  contactName,
  ctx,
  phoneNumberId,
  lat,
  lng,
  stepAddr
) {
  const tid = sess.tenantId;
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : sess.phoneNumberId || null;
  let rev = null;
  try {
    rev = await reverseGeocodeArgentina(lat, lng);
  } catch (_) {}
  const ext = extraerCiudadCalleNumeroDesdeReverse(rev);

  sess.userSharedGps = { lat, lng };
  sess.lat = lat;
  sess.lng = lng;
  if (rev?.displayName) sess.direccionTexto = rev.displayName;
  if (rev?.barrio && normalizarRubroCliente(sess.tipoCliente) === "municipio" && !sess.barrio) {
    sess.barrio = rev.barrio;
  }
  if (wpid) sess.phoneNumberId = wpid;

  if (stepAddr === "awaiting_addr_provincia" && rev?.address?.state) {
    const pBot = provinciaBotDesdeTextoOsm(String(rev.address.state).trim());
    if (pBot) {
      sess.addrProvincia = pBot;
      sess.step = "awaiting_addr_ciudad";
      sessions.set(sk, sess);
      await reply(phone, msgCiudadLuegoDeProvincia(pBot), tid, wpid);
      return;
    }
  }
  if (stepAddr === "awaiting_addr_provincia") {
    sessions.set(sk, sess);
    await reply(
      phone,
      "Recibimos tu *ubicación GPS*. Elegí la *provincia* con un número del *1* al *24*:\n\n" + MSG_ADDR_PROVINCIA,
      tid,
      wpid
    );
    return;
  }

  const ciudadTxt = String(sess.addrCiudad || "").trim();
  const calleTxt = String(sess.addrCalle || "").trim();
  const numTxt = String(sess.addrNumero ?? "").trim();

  let ciudad = "";
  let calle = "";
  let numero = "0";

  if (ext) {
    ciudad = ciudadTxt.length >= 2 ? ciudadTxt : ext.ciudad;
    calle = calleTxt.length >= 2 ? calleTxt : ext.calle;
    if (stepAddr === "awaiting_addr_numero" && numTxt.length) {
      const vn = validarNumeroPuertaWhatsApp(numTxt);
      numero = vn.ok ? vn.value : "0";
    } else if (ext.numero && ext.numero !== "0") {
      const d = String(ext.numero).replace(/\D/g, "").slice(0, 6);
      numero = d.length ? d : "0";
    } else {
      const fallback = numTxt.length ? numTxt : ext.numero || "0";
      const vn2 = validarNumeroPuertaWhatsApp(String(fallback).trim() || "0");
      numero = vn2.ok ? vn2.value : "0";
    }
  } else if (ciudadTxt.length >= 2 && calleTxt.length >= 2) {
    ciudad = ciudadTxt;
    calle = calleTxt;
    numero = numTxt.length ? numTxt : "0";
    sessions.set(sk, sess);
    await geocodeStructuredAddressAndFinalizePedido(phone, sess, sk, contactName, ctx, wpid, ciudad, calle, numero, {
      stateOrProvince: sess.addrProvincia || ctx?.geocodeState,
    });
    return;
  } else {
    sessions.set(sk, sess);
    await reply(
      phone,
      "Recibimos tu *ubicación GPS*, pero no pudimos inferir calle y ciudad automáticamente. Seguí con los mensajes de texto del paso anterior.",
      tid,
      wpid
    );
    return;
  }

  if (ciudad.length < 2 || calle.length < 2) {
    sessions.set(sk, sess);
    await reply(
      phone,
      "Recibimos tu *GPS*. Completá con *texto* lo que falte según el paso anterior.",
      tid,
      wpid
    );
    return;
  }

  sessions.set(sk, sess);
  await geocodeStructuredAddressAndFinalizePedido(phone, sess, sk, contactName, ctx, wpid, ciudad, calle, numero, {
    stateOrProvince: sess.addrProvincia || ctx?.geocodeState,
  });
}

/**
 * Si el usuario mandó GPS antes del paso ciudad (descripción / identificación / nombre),
 * intenta inferir domicilio y cerrar sin mostrar MSG_ADDR_CIUDAD.
 * @returns {Promise<boolean>} true si había pin y se ejecutó la inferencia (no enviar MSG_ADDR_CIUDAD después).
 */
async function intentarGeocodificarConUbicacionGpsPinSiHay(phone, sess, sk, contactName, ctx, wpid) {
  const pin = sess.ubicacionGpsPin;
  if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return false;
  const { lat, lng } = pin;
  delete sess.ubicacionGpsPin;
  sess.step = "awaiting_addr_provincia";
  sessions.set(sk, sess);
  await inferirDireccionDesdeGpsYGeocodificar(phone, sess, sk, contactName, ctx, wpid, lat, lng, "awaiting_addr_provincia");
  return true;
}

/** Municipio: completa `sess.barrio` con Nominatim reverse si aún no está (p. ej. flujo calle/número). */
async function enrichBarrioDesdeReverseSiMunicipio(sess) {
  if (normalizarRubroCliente(sess?.tipoCliente) !== "municipio") return;
  if (sess.barrio != null && String(sess.barrio).trim()) return;
  const la = sess.lat != null ? Number(sess.lat) : NaN;
  const lo = sess.lng != null ? Number(sess.lng) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
  try {
    const rev = await reverseGeocodeArgentina(la, lo);
    if (rev?.barrio) sess.barrio = rev.barrio;
  } catch (_) {}
}

async function finalizePedidoFromSession(phone, sess, contactName) {
  const sk = sessionKey(phone, sess.tenantId);
  await enrichBarrioDesdeReverseSiMunicipio(sess);
  let descripcionFinal = String(sess.descripcion || "").trim();
  if (!descripcionFinal) {
    sessions.delete(sk);
    await reply(
      phone,
      "Faltan datos del pedido. Escribí *menú* para empezar de nuevo.",
      sess.tenantId,
      sess.phoneNumberId
    );
    return;
  }
  if (sess.identificacionLibreTexto && String(sess.identificacionLibreTexto).trim()) {
    descripcionFinal += `\n\nIdentificación / referencia: ${String(sess.identificacionLibreTexto).trim()}`;
  }
  if (sess.waPedidoFotoUploadFallback) {
    descripcionFinal +=
      "\n\n_(Nota sistema: la foto del reclamo se subió sin optimización estándar por un fallo temporal al procesarla.)_";
  }
  const fotoWaUrl =
    sess.waPedidoFotoCloudinaryUrl != null && String(sess.waPedidoFotoCloudinaryUrl).trim()
      ? String(sess.waPedidoFotoCloudinaryUrl).trim()
      : null;
  const dirDecl = String(sess.direccionDeclaradaUsuario || "").trim();
  const dirMapa = String(sess.direccionTexto || "").trim();
  const calleT = String(sess.addrCalle || "").trim();
  const locT = String(sess.addrCiudad || "").trim();
  const numRaw = String(sess.addrNumero ?? "").trim();
  const numT = numRaw && numRaw !== "0" ? numRaw : null;
  let clienteDireccion = dirMapa ? dirMapa : null;
  if (!calleT && !locT && !numT && dirDecl) {
    clienteDireccion = dirDecl;
  }
  let latN = sess.lat != null && Number.isFinite(Number(sess.lat)) ? Number(sess.lat) : null;
  let lngN = sess.lng != null && Number.isFinite(Number(sess.lng)) ? Number(sess.lng) : null;
  if (
    latN != null &&
    lngN != null &&
    Math.abs(latN) < 1e-6 &&
    Math.abs(lngN) < 1e-6
  ) {
    latN = null;
    lngN = null;
  }
  let correlationId = null;
  try {
    const notaInt = sess.notaUbicacionInternaWhatsapp != null ? String(sess.notaUbicacionInternaWhatsapp).trim() : "";
    correlationId = `wa_${sess.tenantId}_${Date.now()}_${randomBytes(5).toString("hex")}`;
    await geocodWaOperacionCreate({
      correlationId,
      tenantId: Number(sess.tenantId),
      telefonoMasked: enmascararTelefonoWhatsapp(phone),
      meta: { flow: "finalize_pedido_session" },
    });
    const pedido = await crearPedidoDesdeWhatsappBot({
      tenantId: sess.tenantId,
      tipoCliente: sess.tipoCliente,
      tipoTrabajo: sess.tipo,
      descripcion: descripcionFinal,
      telefonoContacto: phone,
      lat: latN,
      lng: lngN,
      contactName: sess.contactName || contactName || null,
      nis: sess.nisParaPedido ?? null,
      medidor: sess.medidorParaPedido ?? null,
      nisMedidor: sess.nisMedidorParaPedido ?? null,
      clienteDireccion,
      clienteCalle: calleT || null,
      clienteNumeroPuerta: numT,
      clienteLocalidad: locT || null,
      provincia: sess.addrProvincia != null ? String(sess.addrProvincia).trim() || null : null,
      codigoPostal:
        sess.addrCodigoPostal != null ? String(sess.addrCodigoPostal).trim().replace(/\D/g, "") || null : null,
      suministroTipoConexion: trimOrNullWhatsapp(sess.suministroTipoConexion),
      suministroFases: trimOrNullWhatsapp(sess.suministroFases),
      barrio: sess.barrio ?? null,
      notaUbicacionInterna: notaInt || null,
      correlationId,
      fotoUrlOpcionalWhatsapp: fotoWaUrl,
    });
    sessions.delete(sk);
    const notaSinMapa =
      sess._geocodeSinMapa && (latN == null || lngN == null)
        ? "\n\n_Si no enviaste ubicación GPS, el mapa se actualizará automáticamente con tu domicilio._"
        : "";
    try {
      await reply(
        phone,
        `Su reclamo N° *${pedido.numero_pedido}* ha sido cargado con éxito.\n\nTipo: *${sess.tipo}*${notaSinMapa}\n\nGracias por contactarnos.`,
        sess.tenantId,
        sess.phoneNumberId
      );
    } catch (re) {
      try {
        console.error(
          JSON.stringify({
            evt: "finalize_pedido_wa_reply_error",
            correlationId,
            tenantId: sess.tenantId,
            err: String(re?.message || re),
          })
        );
      } catch (_) {}
    }
  } catch (e) {
    const m = String(e?.message || "");
    if (correlationId) {
      try {
        console.error(
          JSON.stringify({
            evt: "finalize_pedido_wa_error",
            correlationId,
            tenantId: sess.tenantId,
            err: m,
            stack: e?.stack ? String(e.stack).slice(0, 2500) : undefined,
          })
        );
      } catch (_) {}
      await geocodWaOperacionFinishErr(correlationId, e, { detail: "finalizePedidoFromSession" });
    }
    if (m === "OUTAGE_SECTOR_MULTI_RECLAMO") {
      sessions.delete(sk);
      const ctxOut = await loadTenantBotContext(sess.tenantId);
      const msgOut =
        `Estamos recibiendo *muchos reclamos* en tu zona en las últimas horas. ` +
        `Posiblemente se trata de un *corte* que afecta a tu *sector* o es de *carácter general*.\n\n` +
        `Te ofrecemos hablar con un *representante* de la cooperativa por este mismo chat. ` +
        `En un momento te derivamos; podés escribir tu consulta cuando te lo indiquemos.`;
      await reply(phone, msgOut, sess.tenantId, sess.phoneNumberId);
      if (ctxOut) {
        await iniciarFlujoOtrosHumano(
          phone,
          sess.tenantId,
          sess.phoneNumberId || null,
          sess.contactName || contactName || "",
          ctxOut
        );
      } else {
        await reply(
          phone,
          "Si preferís, llamá a la oficina o escribí *menú* para volver al inicio.",
          sess.tenantId,
          sess.phoneNumberId
        );
      }
      return;
    }
    sessions.delete(sk);
    if (m === "sin_usuario_admin_tenant" || m === "sin_usuario_para_pedido_whatsapp") {
      await reply(
        phone,
        "No pudimos asociar el reclamo a un usuario del sistema (falta personal cargado o configuración). Avisá a la cooperativa/municipio.",
        sess.tenantId,
        sess.phoneNumberId
      );
    } else {
      await reply(
        phone,
        "No pudimos registrar el pedido. Intentá de nuevo o llamá a la oficina.",
        sess.tenantId,
        sess.phoneNumberId
      );
    }
  }
}

/** Misma limpieza que *atrás* en el resumen; no borra la foto opcional WA (sigue asociada al borrador). */
function volverAtrasDomicilioDesdeResumenWhatsapp(sess, sk, phoneNumberId) {
  delete sess.direccionDeclaradaUsuario;
  delete sess.direccionTexto;
  delete sess._geocodeSinMapa;
  sess.addrNumero = null;
  if (!sess.userSharedGps) {
    sess.lat = null;
    sess.lng = null;
  }
  sess.step = "awaiting_addr_numero";
  if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
  sessions.set(sk, sess);
}

async function limpiarFotoOpcionalWhatsappEnSesion(sess) {
  const u = sess?.waPedidoFotoCloudinaryUrl != null ? String(sess.waPedidoFotoCloudinaryUrl).trim() : "";
  if (u) {
    await destroyCloudinaryImageBySecureUrl(u);
    delete sess.waPedidoFotoCloudinaryUrl;
  }
  delete sess.waPedidoFotoUploadFallback;
}

/**
 * Resumen legible + confirmación explícita antes del INSERT (`finalizePedidoFromSession`).
 */
async function pedirConfirmacionResumenReclamoWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId) {
  const tid = sess.tenantId;
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : sess.phoneNumberId || null;
  sess.step = "awaiting_confirmar_resumen";
  sessions.set(sk, sess);
  const ident = [];
  if (sess.nisParaPedido) ident.push(`NIS: *${sess.nisParaPedido}*`);
  if (sess.medidorParaPedido) ident.push(`Medidor: *${sess.medidorParaPedido}*`);
  if (sess.nisMedidorParaPedido) ident.push(`NIS/medidor: *${sess.nisMedidorParaPedido}*`);
  const nom = String(sess.contactName || contactName || "").trim();
  if (nom && !ident.length) ident.push(`Nombre / titular: *${nom}*`);
  if (!ident.length) ident.push("Identificación: *solo WhatsApp*");
  const calle = String(sess.addrCalle || "").trim();
  const loc = String(sess.addrCiudad || "").trim();
  const num = String(sess.addrNumero ?? "").trim();
  const prov = String(sess.addrProvincia || "").trim();
  const desc = String(sess.descripcion || "").trim();
  const descShort = desc.length > 220 ? `${desc.slice(0, 217)}…` : desc;
  const sumLine =
    sess.suministroTipoConexion || sess.suministroFases
      ? `\n*Suministro:* ${String(sess.suministroTipoConexion || "—")} · ${String(sess.suministroFases || "—")}`
      : "";
  const fotoLine = sess.waPedidoFotoCloudinaryUrl ? `\n*Foto adjunta:* sí` : "";
  const body =
    `*Resumen del reclamo*\n\n` +
    `${ident.join(" · ")}\n` +
    `*Tipo:* ${String(sess.tipo || "—")}\n` +
    `*Domicilio:* ${calle} ${num === "0" ? "(s/n)" : num}, *${loc}*${prov ? `, *${prov}*` : ""}` +
    sumLine +
    `\n\n*Descripción:*\n${descShort || "—"}` +
    fotoLine +
    `\n\n¿*Confirmás* el registro?\n` +
    `Respondé *SI* o *1* para cargar el reclamo.\n` +
    `Si querés corregir *calle o número*, escribí *atrás*. *menú* = cancelar todo.`;
  await reply(phone, body + MSG_SALIR_ATRAS, tid, wpid);
}

/**
 * Paso intermedio antes del resumen: hasta una foto Cloudinary (reemplazo si mandan otra).
 */
async function pedirFotoOpcionalAntesConfirmacionWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId) {
  const tid = sess.tenantId;
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : sess.phoneNumberId || null;
  sess.step = "awaiting_wa_foto_opcional";
  sessions.set(sk, sess);
  const bodyText =
    `¿Querés adjuntar *una foto* del problema?\n\n` +
    `Podés enviarla *desde la galería* o *con la cámara* (📎 → Imagen).\n\n` +
    `_Solo guardamos *una* foto por reclamo; si mandás otra, *reemplaza* la anterior._`;

  const pid = String(wpid || "").trim();
  let accessToken = "";
  let graphPid = pid;
  if (pid) {
    const byPid = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byPid.accessToken || "").trim();
  }
  if (!accessToken || !graphPid) {
    const creds = await getWhatsAppCredentialsForTenant(ctx.id);
    accessToken = String(creds.accessToken || "").trim();
    graphPid = pid || String(creds.phoneNumberId || "").trim();
  }

  const buttons = [
    { id: WA_PEDIDO_FOTO_BTN_GALERIA, title: "Desde galería" },
    { id: WA_PEDIDO_FOTO_BTN_CAMARA, title: "Tomar foto" },
    { id: WA_PEDIDO_FOTO_BTN_OMITIR, title: "Sin foto" },
  ];

  if (accessToken && graphPid) {
    const r = await sendWhatsAppInteractiveButtonsWithCredentials(
      phone,
      { bodyText: `${bodyText}${MSG_SALIR_ATRAS}`, buttons },
      { accessToken, phoneNumberId: graphPid, purpose: "whatsapp_pedido_foto_opcional" }
    );
    if (r.ok) return;
    console.warn("[whatsapp-bot-meta] botones foto opcional fallaron, texto plano", r.error || r.graph);
  }

  await reply(
    phone,
    `${bodyText}\n\n` +
      `Si querés mandar foto: escribí *1* y después enviá la imagen con 📎.\n` +
      `Si no: escribí *3* u *omitir*.` +
      MSG_SALIR_ATRAS,
    tid,
    wpid
  );
}

/**
 * Guarda domicilio estructurado en sesión y pide confirmación (INSERT tras SI). La ubicación en mapa la resuelve
 * `regeocodificarPedido` en el servidor (mismo pipeline que el botón Re-geocodificar).
 * Pedidos WhatsApp: solo estrategia API Simple / parámetro `q` (sin interpolación previa al INSERT).
 * Solo se usan coordenadas aquí si el usuario compartió GPS válido (`userSharedGps`).
 *
 * @param {{ origenCatalogo?: boolean, stateOrProvince?: string }} opts
 */
async function geocodeStructuredAddressAndFinalizePedido(
  phone,
  sess,
  sk,
  contactName,
  ctx,
  phoneNumberId,
  addrCiudad,
  addrCalle,
  addrNumero,
  opts = {}
) {
  const ciudad = String(addrCiudad || "").trim();
  const calle = String(addrCalle || "").trim();
  const numRaw = String(addrNumero ?? "").trim();
  let numero = "0";
  if (opts.origenCatalogo) {
    const digits = numRaw.replace(/\D/g, "").slice(0, 6);
    numero = digits.length ? digits : "0";
  } else {
    const nv = validarNumeroPuertaWhatsApp(numRaw.length ? numRaw : "0");
    numero = nv.ok ? nv.value : "0";
  }
  sess.addrCiudad = ciudad;
  sess.addrCalle = calle;
  sess.addrNumero = numero;
  sess.direccionDeclaradaUsuario = [ciudad, calle, numRaw || numero].filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
  sess._geocodeOrigenCatalogo = !!opts.origenCatalogo;
  if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
  sessions.set(sk, sess);

  if (necesitaCapturarSuministroElectrico(sess)) {
    sess.step = "awaiting_suministro_conexion";
    sessions.set(sk, sess);
    await reply(
      phone,
      MSG_SUMINISTRO_CONEXION,
      sess.tenantId,
      phoneNumberId || sess.phoneNumberId || null
    );
    return;
  }

  const stOpt = String(opts.stateOrProvince || "").trim();
  if (stOpt && !trimOrNullWhatsapp(sess.addrProvincia)) sess.addrProvincia = stOpt;

  const ciudadLabel = ciudad || "tu localidad";
  const userGps =
    sess.userSharedGps &&
    Number.isFinite(Number(sess.userSharedGps.lat)) &&
    Number.isFinite(Number(sess.userSharedGps.lng))
      ? { lat: Number(sess.userSharedGps.lat), lng: Number(sess.userSharedGps.lng) }
      : null;

  const nom = String(sess.contactName || contactName || "").trim();
  const origen = opts.origenCatalogo ? "Domicilio en padrón" : "Calle indicada por el usuario";

  if (userGps) {
    sess.lat = userGps.lat;
    sess.lng = userGps.lng;
    sess._geocodeSinMapa = false;
    sess.direccionTexto = nom
      ? `Ubicación por *GPS del usuario*: ${nom}, ${ciudadLabel}. ${origen}: ${calle} ${numero}`
          .replace(/\s+/g, " ")
          .trim()
      : `Ubicación por *GPS del usuario*: ${ciudadLabel}. ${origen}: ${calle} ${numero}`
          .replace(/\s+/g, " ")
          .trim();
  } else {
    sess.lat = null;
    sess.lng = null;
    sess._geocodeSinMapa = true;
    sess.direccionTexto = nom
      ? `${origen}: ${calle} ${numero}, ${ciudadLabel}. ${nom}. (El mapa se actualizará al procesar el reclamo.)`
          .replace(/\s+/g, " ")
          .trim()
      : `${origen}: ${calle} ${numero}, ${ciudadLabel}. (El mapa se actualizará al procesar el reclamo.)`
          .replace(/\s+/g, " ")
          .trim();
  }

  sessions.set(sk, sess);
  await pedirFotoOpcionalAntesConfirmacionWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId);
}

/** Cloud API: máximo 10 filas en una lista interactiva. */
const MAX_WHATSAPP_LIST_ROWS = 10;

async function replyListaTiposReclamo(phoneDigits, ctx, phoneNumberIdWebhook) {
  if (ctx.whatsappBloqueoReclamos) {
    await reply(phoneDigits, ctx.whatsappBloqueoMensaje, ctx.id, phoneNumberIdWebhook);
    return { ok: true, blocked: true };
  }
  const bodyText =
    `Elegí el tipo que mejor describe tu reclamo:\n\n` +
    `_Para *salir* escribí *menú* o *0* en un mensaje de texto._`;
  const pid = String(phoneNumberIdWebhook || "").trim();
  let accessToken = "";
  let graphPid = pid;
  if (pid) {
    const byPid = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byPid.accessToken || "").trim();
  }
  if (!accessToken || !graphPid) {
    const creds = await getWhatsAppCredentialsForTenant(ctx.id);
    accessToken = String(creds.accessToken || "").trim();
    graphPid = pid || String(creds.phoneNumberId || "").trim();
  }
  if (!accessToken || !graphPid) {
    console.error("[whatsapp-bot-meta] lista interactiva: sin credenciales Meta");
    await reply(phoneDigits, menuTextoNumerado(ctx), ctx.id, pid || null);
    return { ok: false, error: "missing_meta_credentials" };
  }
  if (ctx.tipos.length > MAX_WHATSAPP_LIST_ROWS) {
    console.warn("[whatsapp-bot-meta] demasiados tipos para lista WA, usando menú numerado", {
      n: ctx.tipos.length,
      tenantId: ctx.id,
    });
    await reply(
      phoneDigits,
      menuTextoNumerado(ctx) + "\n\n_(Hay muchas opciones: escribí el número del 1 al " + ctx.tipos.length + ".)_",
      ctx.id,
      pid || null
    );
    return { ok: true, skippedInteractive: true };
  }
  const r = await sendWhatsAppInteractiveListWithCredentials(
    phoneDigits,
    {
      bodyText,
      buttonText: "Ver tipos",
      sectionTitle: "Tipos de reclamo",
      tipos: ctx.tipos,
    },
    { accessToken, phoneNumberId: graphPid, purpose: "whatsapp_bot_menu_tipos" }
  );
  const logTxt = r.ok ? `[lista interactiva] ${ctx.tipos.length} tipos (${ctx.nombre || "tenant"})` : `[lista interactiva] error`;
  try {
    await logWhatsappMensajeEnviado(phoneDigits, logTxt, r.ok);
  } catch (e) {
    console.error("[whatsapp-bot-meta] log enviado", e.message);
  }
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] lista interactiva falló, menú texto", r.graph || r.error);
    await reply(phoneDigits, menuTextoNumerado(ctx), ctx.id, pid || null);
  } else {
    console.log("[webhook-meta-whatsapp] outbound_list", { to: String(phoneDigits || "").replace(/\D/g, "").slice(0, 4) + "…", ok: true });
  }
  return r;
}

async function aplicarImagenRecibidaFlujoPedidoWa(
  phone,
  sess,
  sk,
  mediaId,
  phoneNumberId,
  contactName,
  ctxOk,
  opts = {}
) {
  const soloReemplazarFoto = !!opts.soloReemplazarFoto;
  let accessToken = "";
  const pid = String(phoneNumberId || "").trim();
  if (pid) {
    const byPid = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byPid.accessToken || "").trim();
  }
  if (!accessToken) {
    const creds = await getWhatsAppCredentialsForTenant(sess.tenantId);
    accessToken = String(creds.accessToken || "").trim();
  }
  if (!accessToken) {
    await reply(
      phone,
      "No pudimos procesar la imagen (configuración). Intentá más tarde o escribí *omitir*.",
      sess.tenantId,
      phoneNumberId
    );
    return;
  }
  try {
    const prevUrl = sess.waPedidoFotoCloudinaryUrl ? String(sess.waPedidoFotoCloudinaryUrl).trim() : "";
    const { secureUrl, usedFallback } = await whatsappPedidoSubirFotoDesdeMediaId(mediaId, accessToken);
    if (prevUrl) {
      await destroyCloudinaryImageBySecureUrl(prevUrl).catch(() => {});
    }
    sess.waPedidoFotoCloudinaryUrl = secureUrl;
    sess.waPedidoFotoUploadFallback = !!usedFallback;
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(
      phone,
      soloReemplazarFoto
        ? "Listo, *actualizamos la foto* del reclamo. Te reenviamos el *resumen*."
        : "Listo, *guardamos tu foto*. Te mostramos el *resumen* para confirmar el reclamo.",
      sess.tenantId,
      phoneNumberId
    );
    await pedirConfirmacionResumenReclamoWhatsapp(phone, sess, sk, contactName, ctxOk, phoneNumberId);
  } catch (e) {
    console.error("[whatsapp-bot-meta] subida foto WA", e?.message || e);
    await reply(
      phone,
      "No pudimos guardar la imagen. Podés escribir *omitir* para seguir *sin foto*, probar otra imagen, o *atrás* para elegir de nuevo.",
      sess.tenantId,
      phoneNumberId
    );
  }
}

async function processInboundWhatsappImageMessage({ fromRaw, msg, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  if (await isWhatsAppAutomatedBotDisabled()) return;

  const mediaId = msg?.image?.id ? String(msg.image.id).trim() : "";
  if (!mediaId) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const sess = sessions.get(sk);

  if (sess && sess.step === "human_chat") {
    await reply(
      phone,
      "Recibimos una imagen, pero en este modo solo podemos seguirte por *texto*. Escribí tu consulta o *menú*.",
      tid,
      phoneNumberId
    );
    return;
  }

  const stepFotoPrevio =
    sess &&
    (sess.step === "awaiting_wa_foto_upload" ||
      sess.step === "awaiting_wa_foto_opcional" ||
      sess.step === "awaiting_confirmar_resumen");
  if (!sess || !stepFotoPrevio) {
    await reply(
      phone,
      "Recibimos tu imagen. Si no estabas cargando un reclamo, no la usamos; para iniciar uno escribí *menú*.",
      tid,
      phoneNumberId
    );
    return;
  }

  const ctxOk = await loadTenantBotContext(tid);
  if (!ctxOk) {
    sessions.delete(sk);
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }

  if (sess.step === "awaiting_confirmar_resumen") {
    await aplicarImagenRecibidaFlujoPedidoWa(phone, sess, sk, mediaId, phoneNumberId, contactName, ctxOk, {
      soloReemplazarFoto: true,
    });
    return;
  }

  if (sess.step === "awaiting_wa_foto_opcional") {
    sess.step = "awaiting_wa_foto_upload";
    sessions.set(sk, sess);
  }

  await aplicarImagenRecibidaFlujoPedidoWa(phone, sess, sk, mediaId, phoneNumberId, contactName, ctxOk);
}

export async function handleInboundMetaWhatsAppPayload(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const phoneNumberId = value?.metadata?.phone_number_id ?? null;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const msg of messages) {
        const from = String(msg?.from || "");
        if (!from) continue;
        console.log("[WEBHOOK_BOT] msg.from (fromRaw hacia processInboundText):", from);
        const fromNorm = normalizeWhatsAppRecipientForMeta(from.replace(/\D/g, ""));
        const cMatch = contacts.find(
          (c) =>
            normalizeWhatsAppRecipientForMeta(String(c?.wa_id || "").replace(/\D/g, "")) === fromNorm
        );
        const contactName = cMatch?.profile?.name || contacts[0]?.profile?.name || null;

        if (msg?.type === "interactive") {
          const ir = msg.interactive;
          if (ir?.type === "list_reply") {
            const rowId = ir?.list_reply?.id;
            try {
              await processListReplySelection({
                fromRaw: from,
                listRowId: rowId,
                phoneNumberId,
                contactName,
              });
            } catch (e) {
              console.error("[whatsapp-bot-meta] list_reply error", e);
              await reply(
                fromNorm,
                "No pudimos leer tu elección. Escribí *menú* para empezar de nuevo.",
                await tenantIdForWebhook(phoneNumberId),
                phoneNumberId
              );
            }
          } else if (ir?.type === "button_reply") {
            const title = String(ir?.button_reply?.title || "").trim();
            const buttonReplyId = String(ir?.button_reply?.id || "").trim();
            try {
              await processInboundText({
                fromRaw: from,
                text: title || "menú",
                phoneNumberId,
                contactName,
                buttonReplyId,
              });
            } catch (e) {
              console.error("[whatsapp-bot-meta] button_reply error", e);
            }
          }
          continue;
        }

        if (msg?.type === "location") {
          const coords = extractLocationFromMetaMessage(msg);
          try {
            if (coords) {
              await processInboundLocation({
                fromRaw: from,
                lat: coords.lat,
                lng: coords.lng,
                phoneNumberId,
                contactName,
              });
            } else {
              await reply(
                fromNorm,
                "No pudimos leer las coordenadas. Enviá de nuevo con *Adjuntar* → *Ubicación*, o escribí una dirección.",
                await tenantIdForWebhook(phoneNumberId),
                phoneNumberId
              );
            }
          } catch (e) {
            console.error("[whatsapp-bot-meta] location error", e);
            await reply(
              fromNorm,
              "Error al procesar la ubicación. Intentá de nuevo o escribí *menú*.",
              await tenantIdForWebhook(phoneNumberId),
              phoneNumberId
            );
          }
          continue;
        }

        if (msg?.type === "image") {
          try {
            await processInboundWhatsappImageMessage({
              fromRaw: from,
              msg,
              phoneNumberId,
              contactName,
            });
          } catch (e) {
            console.error("[whatsapp-bot-meta] image inbound error", e);
            await reply(
              fromNorm,
              "No pudimos procesar la imagen. Si estabas cargando un reclamo, escribí *menú* o intentá de nuevo.",
              await tenantIdForWebhook(phoneNumberId),
              phoneNumberId
            );
          }
          continue;
        }

        if (msg?.type !== "text") continue;
        const text = String(msg?.text?.body || "").trim();
        if (!text) continue;
        try {
          await processInboundText({
            fromRaw: from,
            text,
            phoneNumberId,
            contactName,
          });
        } catch (e) {
          console.error("[whatsapp-bot-meta] process error", e);
          await reply(
            fromNorm,
            "Ocurrió un error. Intentá más tarde o contactá a la oficina.",
            await tenantIdForWebhook(phoneNumberId),
            phoneNumberId
          );
        }
      }
    }
  }
}

async function processInboundLocation({ fromRaw, lat, lng, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  if (await isWhatsAppAutomatedBotDisabled()) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const sess = sessions.get(sk);

  if (sess && sess.step === "human_chat") {
    await reply(
      phone,
      "Para el chat con un representante alcanza con escribir tu *consulta* en texto. Si querés enviar ubicación, hacelo en un mensaje de texto (calle, ciudad).",
      tid,
      phoneNumberId
    );
    return;
  }

  if (!sess || !WHATSAPP_STEPS_ADJUNTAR_GPS.has(sess.step)) {
    await reply(phone, "Ahora no estamos esperando una ubicación. Escribí *menú* para ver las opciones.", tid, phoneNumberId);
    return;
  }

  const ctxOk = await loadTenantBotContext(tid);
  if (!ctxOk) {
    sessions.delete(sk);
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }

  const stepAddr = String(sess.step || "");

  /** Pasos de domicilio: reverse Nominatim + misma geocodificación estructurada que el texto (sin volver a pedir ciudad/calle). */
  if (
    stepAddr === "awaiting_addr_ciudad" ||
    stepAddr === "awaiting_addr_provincia" ||
    stepAddr === "awaiting_addr_calle" ||
    stepAddr === "awaiting_addr_numero"
  ) {
    await inferirDireccionDesdeGpsYGeocodificar(
      phone,
      sess,
      sk,
      contactName,
      ctxOk,
      phoneNumberId,
      lat,
      lng,
      stepAddr
    );
    return;
  }

  /** Descripción u opciones previas: guardamos el pin para usarlo al ubicar (reverse al avanzar). */
  if (stepAddr === "awaiting_desc") {
    sess.ubicacionGpsPin = { lat, lng };
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    if (esPedidoFactibilidadNuevoServicioWhatsapp(sess.tipo)) {
      sess.step = "awaiting_factibilidad_post_gps";
      sessions.set(sk, sess);
      await reply(
        phone,
        "Recibimos tu *ubicación*. Respondé con *1* (datos del servicio) o *2* (nombre y dirección) o *0* (salir).\n\n" +
          `_(*menú* = salir · *atrás* = volver a describir / otra ubicación)_`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(
      phone,
      "Recibimos tu *ubicación GPS*; la usaremos para ubicar el reclamo en el mapa. Ahora escribí la *descripción* del problema (texto).\n\n" +
        `_(*menú* / *0* = salir · *atrás* = cancelar este reclamo)_`,
      tid,
      phoneNumberId
    );
    return;
  }

  if (stepAddr === "awaiting_identificacion_modo" || stepAddr === "awaiting_opcional_id") {
    sess.ubicacionGpsPin = { lat, lng };
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(
      phone,
      "Recibimos tu *ubicación GPS*; la usaremos más adelante para el mapa. Seguí con el paso anterior en *texto*.\n\n" +
        `_*menú* = salir · *atrás* = paso anterior_`,
      tid,
      phoneNumberId
    );
    return;
  }

  if (stepAddr === "awaiting_nombre_persona") {
    sess.ubicacionGpsPin = { lat, lng };
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(
      phone,
      "Recibimos tu *ubicación GPS*; la usaremos para ubicar el reclamo en el mapa.\n\n¿Cuál es tu *nombre y apellido* (o del titular)?" +
        MSG_SALIR_ATRAS,
      tid,
      phoneNumberId
    );
    return;
  }

  if (stepAddr === "awaiting_suministro_conexion" || stepAddr === "awaiting_suministro_fases") {
    sess.userSharedGps = { lat, lng };
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    let hint = "Recibimos tu *ubicación GPS*. ";
    if (stepAddr === "awaiting_suministro_fases") {
      hint += "Respondé *1* (monofásico) o *2* (trifásico) en texto.";
    } else {
      hint += "Respondé *1* (aéreo) o *2* (subterráneo) en texto.";
    }
    hint += " _(*menú* = salir · *atrás* = paso anterior)_";
    await reply(phone, hint, tid, phoneNumberId);
    return;
  }

  await reply(
    phone,
    "Recibimos la *ubicación*, pero este paso no admite GPS así. Escribí *menú* o seguí con *texto*.",
    tid,
    phoneNumberId
  );
}

async function processListReplySelection({ fromRaw, listRowId, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  if (await isWhatsAppAutomatedBotDisabled()) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }
  const tipo = decodeWhatsAppListRowId(listRowId);
  if (!tipo || !ctx.tipos.includes(tipo)) {
    await reply(phone, "Opción no válida. Escribí *menú* para ver las opciones.", tid, phoneNumberId);
    return;
  }
  if (tipo !== TIPO_RECLAMO_OTROS && ctx.whatsappBloqueoReclamos) {
    await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
    return;
  }
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : null;
  if (tipo === TIPO_RECLAMO_OTROS || tipo === "Pérdida en Vereda/Calle") {
    await iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx);
    return;
  }
  sessions.set(sk, {
    step: "awaiting_desc",
    tipo,
    tenantId: tid,
    tipoCliente: ctx.tipo,
    contactName: contactName || null,
    phoneNumberId: wpid,
  });
  await reply(
    phone,
    `Elegiste: *${tipo}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).\n\n` +
      `_(*menú* / *0* = salir · *atrás* = cancelar este reclamo)_`,
    tid,
    phoneNumberId
  );
}

/**
 * Sesión humana abierta (vecino «Otros» o tercero por derivación): sin menús del bot.
 * Debe ejecutarse antes de `!ctx`, cooperativa/derivación y menú principal.
 */
async function processInboundHumanChatMessageOnly({ phone, text, tid, sk, phoneNumberId }) {
  const sess = sessions.get(sk);
  if (!sess || sess.step !== "human_chat") return false;
  const lower = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (lower === "salir" || lower === "fin" || lower === "chau") {
    try {
      await humanChatCloseBySessionId(sess.humanChatSessionId);
    } catch (_) {}
    sessions.delete(sk);
    await reply(
      phone,
      "Cerramos el chat con el representante. Cuando quieras, escribí *menú* para ver las opciones.",
      tid,
      phoneNumberId
    );
    return true;
  }
  try {
    await humanChatAppendInbound(sess.humanChatSessionId, text);
  } catch (e) {
    if (e && (e.code === "HUMAN_CHAT_CLOSED" || String(e.message || "").includes("human_chat_session_closed"))) {
      sessions.delete(sk);
      await reply(
        phone,
        "El chat con el representante ya *finalizó*. Escribí *menú* para ver las opciones del asistente.",
        tid,
        phoneNumberId
      );
      return true;
    }
    console.error("[whatsapp-bot-meta] human_chat inbound", e);
    await reply(phone, "No pudimos registrar el mensaje. Intentá de nuevo.", tid, phoneNumberId);
    return true;
  }
  if (!sess.humanChatFirstAcked) {
    sess.humanChatFirstAcked = true;
    sessions.set(sk, sess);
    await reply(phone, "Recibimos tu mensaje. Un *representante* te responderá a la brevedad.", tid, phoneNumberId);
  }
  return true;
}

async function processInboundText({ fromRaw, text, phoneNumberId, contactName, buttonReplyId = "" }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);

  const comandoMaster = parseActivarDesactivarComando(text);
  if (comandoMaster) {
    const okMaster = await isPhoneWhatsappBotMasterAsync(phone, tid);
    if (!okMaster) {
      console.warn("[whatsapp-bot-meta] comando maestro no autorizado", {
        comando: comandoMaster,
        tid,
        phone: maskWaDigitsForLog(phone),
      });
      await reply(
        phone,
        `Recibí la orden *${comandoMaster}*, pero este número no está autorizado.\n\n` +
          "Revisá en Neon que tu usuario *admin* tenga en *telefono* o *whatsapp_notificaciones* el mismo número que usás en WhatsApp (con o sin 9 móvil), o definí *WHATSAPP_BOT_MASTER_PHONE* en el servidor con los dígitos completos (ej. 5493434540250).",
        tid,
        phoneNumberId ? String(phoneNumberId).trim() : null
      );
      return;
    }
    const wpidM = phoneNumberId ? String(phoneNumberId).trim() : null;
    if (comandoMaster === "activar" && whatsappBotEnvHardDisabled()) {
      await reply(
        phone,
        "El servidor tiene WHATSAPP_BOT_ENABLED desactivado: no se puede encender el bot solo por WhatsApp. Contactá al administrador del sistema.",
        tid,
        wpidM
      );
      return;
    }
    try {
      await setGlobalBotActiveDb(comandoMaster === "activar", phone);
    } catch (e) {
      console.error("[whatsapp-bot-meta] global bot toggle DB", e?.message || e);
      await reply(
        phone,
        "No se pudo guardar el estado en base de datos. Verificá la migración global_bot_state (api/db/migrations/global_bot_state.sql).",
        tid,
        wpidM
      );
      return;
    }
    const msgOn =
      "✅ *Asistente automático de reclamos* activado a nivel global.\n\n" +
      "Los vecinos pueden escribir *Hola* o *menú* para iniciar un reclamo.";
    const msgOff =
      "⏸️ *Asistente automático de reclamos* desactivado a nivel global.\n\n" +
      "Para volver a activarlo, enviá la palabra *activar* desde este mismo número.";
    await reply(phone, comandoMaster === "activar" ? msgOn : msgOff, tid, wpidM);
    return;
  }

  const automatedBotOff = await isWhatsAppAutomatedBotDisabled();
  const ctx = await loadTenantBotContext(tid);
  const wpidBootstrap = phoneNumberId ? String(phoneNumberId).trim() : null;
  try {
    const hcOpen = await humanChatFindOpenSessionForPhone(tid, phone);
    if (hcOpen?.id) {
      sessions.set(sk, {
        step: "human_chat",
        humanChatSessionId: Number(hcOpen.id),
        tenantId: tid,
        tipoCliente: ctx?.tipo ?? null,
        contactName: contactName || null,
        phoneNumberId: wpidBootstrap,
        humanChatFirstAcked: true,
      });
    }
  } catch (_) {}

  try {
    const opinionTry = await tryConsumeClienteOpinionReply({
      tenantId: tid,
      phoneDigits: phone,
      text,
      nombreEntidad: ctx?.nombre,
    });
    if (opinionTry.handled) {
      sessions.delete(sk);
      if (opinionTry.ack) {
        await reply(phone, opinionTry.ack, tid, phoneNumberId);
      }
      return;
    }
  } catch (e) {
    console.error("[whatsapp-bot-meta] opinion reply", e.message);
  }

  try {
    if (await processInboundHumanChatMessageOnly({ phone, text, tid, sk, phoneNumberId })) {
      return;
    }
  } catch (e) {
    console.error("[whatsapp-bot-meta] human_chat inbound (early)", e?.message || e);
  }

  /**
   * Tercero: chat humano sin menú (WHATSAPP_HUMAN_CHAT_DIRECT_PHONES). No aplica a maestro ni admin
   * (mismo criterio que *activar*), para no forzar "Otros" al probar el bot ni reenviar el intro
   * en cada request sin sesión en memoria. Si ya hay sesión abierta en BD, rehidratar y guardar, sin
   * llamar a iniciarFlujoOtrosHumano otra vez (evita toasts y spam de bienvenida).
   */
  if (ctx) {
    try {
      if (isPhoneWhatsappHumanChatDirect(phone) && !(await isPhoneWhatsappBotMasterAsync(phone, tid))) {
        let pendOpinBoot = false;
        try {
          pendOpinBoot = await hasPendingClienteOpinion(tid, phone);
        } catch (_) {}
        if (!pendOpinBoot) {
          const s0 = sessions.get(sk);
          if (s0?.step !== "human_chat" && !s0) {
            const trimmed0 = String(text || "").trim();
            const lower0 = trimmed0
              .replace(/^\*+|\*+$/g, "")
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            if (trimmed0 && !debeSalirAlMenuPrincipalWhatsApp(lower0, s0)) {
              const hcDirect = await humanChatFindOpenSessionForPhone(tid, phone);
              if (hcDirect?.id) {
                sessions.set(sk, {
                  step: "human_chat",
                  humanChatSessionId: Number(hcDirect.id),
                  tenantId: tid,
                  tipoCliente: ctx?.tipo ?? null,
                  contactName: contactName || null,
                  phoneNumberId: wpidBootstrap,
                  humanChatFirstAcked: true,
                });
                if (await processInboundHumanChatMessageOnly({ phone, text, tid, sk, phoneNumberId })) {
                  return;
                }
              } else {
                await iniciarFlujoOtrosHumano(phone, tid, wpidBootstrap, contactName, ctx);
                if (await processInboundHumanChatMessageOnly({ phone, text, tid, sk, phoneNumberId })) {
                  return;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[whatsapp-bot-meta] direct human_chat bootstrap", e?.message || e);
    }
  }

  /** Tras cierre por WA: ventana de opinión abierta (evita confundir "5" o "10" con menú / reinicio). */
  let pendOpinionActiva = false;
  try {
    pendOpinionActiva = await hasPendingClienteOpinion(tid, phone);
  } catch (_) {}

  // Saludo inicial (es/en) → misma bienvenida que "Hola"; no aplica en medio de un reclamo.
  const _sessHola = sessions.get(sk);
  const _stepHola = _sessHola?.step;
  const _enFlujoReclamoBot = _stepHola && _stepHola !== "idle" && _stepHola !== "human_chat";
  const _rawSaludo = String(text || "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .trim();
  const _esSaludoInicial =
    /\bhola\b/i.test(_rawSaludo) ||
    /^(hi|hello|hey)(\b|[\s!.]|$)/i.test(_rawSaludo) ||
    /^buenas(\b|[\s!.]|$)/i.test(_rawSaludo) ||
    /^good\s*(morning|afternoon|evening)(\b|[\s!.]|$)/i.test(_rawSaludo);
  if (_esSaludoInicial && _stepHola !== "human_chat" && !_enFlujoReclamoBot) {
    let pendOpinionHola = false;
    try {
      pendOpinionHola = await hasPendingClienteOpinion(tid, phone);
    } catch (_) {}
    if (pendOpinionHola) {
      await reply(
        phone,
        "Hola. Tenemos pendiente tu valoración del reclamo que cerramos.\n\n" +
          "*Primero* enviá un número del *1 al 5* (o ⭐). *Después* podés agregar un comentario o *omitir*.\n\n" +
          "Para el *menú* de nuevos reclamos, escribí *menú* o *0*.",
        tid,
        phoneNumberId
      );
      return;
    }
    console.log("[whatsapp-bot-meta] hola detectado", { phone, text: String(text || "").slice(0, 120), tenant: tid });
    const prevS = sessions.get(sk);
    if (prevS?.humanChatSessionId) {
      try {
        await humanChatCloseBySessionId(prevS.humanChatSessionId);
      } catch (_) {}
    }
    sessions.delete(sk);
    const nombre = ctx?.nombre || "GestorNova";
    if (automatedBotOff) {
      await reply(
        phone,
        `Bienvenido al centro de atención de *${nombre}*. El asistente automático está desactivado.`,
        tid,
        phoneNumberId
      );
      return;
    }
    if (!ctx) {
      await reply(
        phone,
        `Bienvenido al centro de atención de *${nombre}*. Estamos completando la configuración del servicio.`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(phone, textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
    return;
  }

  if (automatedBotOff) return;

  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }

  const lower = String(text || "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizarRubroCliente(ctx.tipo) === "cooperativa_electrica") {
    const esOtrosServicios =
      lower === "otros servicios" ||
      lower === "derivar" ||
      lower === "agua potable" ||
      lower === "otra energia" ||
      lower === "otra empresa";
    if (esOtrosServicios) {
      const msg = formatDerivacionBotMessage(ctx);
      if (msg) {
        await reply(phone, msg, tid, phoneNumberId);
        return;
      }
      await reply(
        phone,
        "Para consultas de *agua* u *otra empresa eléctrica*, todavía no hay contactos configurados en el sistema. Escribí *menú* para reclamos de energía de esta cooperativa.",
        tid,
        phoneNumberId
      );
      return;
    }
  }

  const sessMenu = sessions.get(sk);
  if (debeSalirAlMenuPrincipalWhatsApp(lower, sessMenu)) {
    const prevM = sessMenu;
    if (prevM?.humanChatSessionId) {
      try {
        await humanChatCloseBySessionId(prevM.humanChatSessionId);
      } catch (_) {}
    }
    sessions.delete(sk);
    await reply(phone, textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
    return;
  }

  let sess = sessions.get(sk);
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : null;
  const replyBtnId = String(buttonReplyId || "").trim();

  if (sess && sess.step === "awaiting_wa_foto_opcional") {
    const t = String(text || "").trim();
    if (debeSalirAlMenuPrincipalWhatsApp(lower, sess)) {
      await limpiarFotoOpcionalWhatsappEnSesion(sess);
      sessions.delete(sk);
      await reply(phone, menuTextoNumerado(ctx), tid, phoneNumberId);
      return;
    }
    if (esComandoAtras(t)) {
      volverAtrasDomicilioDesdeResumenWhatsapp(sess, sk, phoneNumberId);
      await reply(
        phone,
        "Volvimos al *número de puerta*. Corregí el dato y seguimos.\n\n" + MSG_ADDR_NUMERO,
        tid,
        phoneNumberId
      );
      return;
    }
    if (
      replyBtnId === WA_PEDIDO_FOTO_BTN_OMITIR ||
      lower === "omitir" ||
      lower === "sin foto" ||
      lower === "no foto" ||
      t === "3"
    ) {
      await limpiarFotoOpcionalWhatsappEnSesion(sess);
      sessions.set(sk, sess);
      await pedirConfirmacionResumenReclamoWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId || wpid);
      return;
    }
    if (
      replyBtnId === WA_PEDIDO_FOTO_BTN_GALERIA ||
      replyBtnId === WA_PEDIDO_FOTO_BTN_CAMARA ||
      t === "1" ||
      t === "2"
    ) {
      sess.step = "awaiting_wa_foto_upload";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      const hintCamara =
        replyBtnId === WA_PEDIDO_FOTO_BTN_CAMARA ||
        /\bcamara\b|\bfoto\b.*\bsacar\b/i.test(t + lower);
      const hint = hintCamara
        ? "Abrí 📎 → *Cámara*, sacá *una* foto y enviala."
        : "Abrí 📎 → *Galería* o *Cámara*, elegí *una* imagen y enviala.";
      await reply(
        phone,
        `Perfecto. ${hint}\n\n_Si preferís no mandar imagen, escribí *omitir*.` + MSG_SALIR_ATRAS,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(
      phone,
      "Usá los *botones* del mensaje anterior, o escribí *1* para adjuntar foto, *3* u *omitir* si no querés foto.",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_wa_foto_upload") {
    const t = String(text || "").trim();
    if (debeSalirAlMenuPrincipalWhatsApp(lower, sess)) {
      await limpiarFotoOpcionalWhatsappEnSesion(sess);
      sessions.delete(sk);
      await reply(phone, menuTextoNumerado(ctx), tid, phoneNumberId);
      return;
    }
    if (esComandoAtras(t)) {
      sess.step = "awaiting_wa_foto_opcional";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await pedirFotoOpcionalAntesConfirmacionWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId || wpid);
      return;
    }
    if (lower === "omitir" || lower === "sin foto" || lower === "no foto" || t === "3") {
      await limpiarFotoOpcionalWhatsappEnSesion(sess);
      sessions.set(sk, sess);
      await pedirConfirmacionResumenReclamoWhatsapp(phone, sess, sk, contactName, ctx, phoneNumberId || wpid);
      return;
    }
    await reply(
      phone,
      "En este paso enviá *una imagen* con 📎 o escribí *omitir* para seguir sin foto.",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_factibilidad_post_gps") {
    if (esComandoAtras(text)) {
      sess.step = "awaiting_desc";
      delete sess.factibilidadPostGpsRama;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(
        phone,
        "Volvimos atrás. Podés enviar otra *ubicación GPS* o escribir la *descripción* del pedido.\n\n" +
          `_(*menú* / *0* = salir · *atrás* = cancelar este reclamo)_`,
        tid,
        phoneNumberId
      );
      return;
    }
    const opt = interpretaOpcionFactibilidadPostGpsWhatsapp(text);
    if (opt === "servicio" || opt === "nombre") {
      sess.factibilidadPostGpsRama = opt;
      sess.step = "awaiting_desc";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(
        phone,
        "Perfecto. Ahora escribí una *breve descripción* del pedido de factibilidad (una o varias líneas).\n\n" +
          `_(*menú* / *0* = salir · *atrás* = paso anterior)_`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(
      phone,
      "No reconocimos la opción. Respondé con *1* (datos del servicio), *2* (nombre y dirección) o *0* (salir).",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_identificacion_modo") {
    if (esComandoAtras(text)) {
      sess.step = "awaiting_desc";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(
        phone,
        "Volvimos atrás. Escribí de nuevo una *breve descripción* del problema (una o varias líneas).",
        tid,
        phoneNumberId
      );
      return;
    }
    const choice = interpretaMenuIdentificacion(text);
    if (choice === 2) {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_nombre_persona",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_NOMBRE_PERSONA, tid, phoneNumberId);
      return;
    }
    if (choice === 1) {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_opcional_id",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, msgOpcionalIdentificadorPorRubro(ctx), tid, phoneNumberId);
      return;
    }
    await reply(
      phone,
      "Respondé con *1* (datos del servicio) o *2* (nombre y dirección).",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_nombre_persona") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      sess.step = "awaiting_identificacion_modo";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, mensajeMenuIdentificacion(ctx), tid, phoneNumberId);
      return;
    }
    if (t.length < 2) {
      await reply(phone, "Escribí al menos *2 caracteres* para el nombre.", tid, phoneNumberId);
      return;
    }
    if (t.length > 200) {
      await reply(phone, "El nombre es muy largo. Acortalo un poco.", tid, phoneNumberId);
      return;
    }
    sess.contactName = t;
    sess.addrOrigenPaso = "nombre";
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    if (await intentarGeocodificarConUbicacionGpsPinSiHay(phone, sess, sk, contactName, ctx, phoneNumberId || wpid)) {
      return;
    }
    sess.step = "awaiting_addr_provincia";
    sessions.set(sk, sess);
    await reply(phone, MSG_ADDR_PROVINCIA, tid, phoneNumberId);
    return;
  }

  if (sess && sess.step === "awaiting_opcional_id") {
    const raw = String(text || "").trim();
    if (esComandoAtras(raw)) {
      sess.step = "awaiting_identificacion_modo";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, mensajeMenuIdentificacion(ctx), tid, phoneNumberId);
      return;
    }
    const low = raw.toLowerCase();
    if (/^(no|n|salto|siguiente|omitir|sigue|skip|-|)$/i.test(low) || low === "0") {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_nombre_persona",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_NOMBRE_PERSONA, tid, phoneNumberId);
      return;
    }
    const res = await buscarIdentidadParaReclamoWhatsApp(tid, raw);
    if (res.skip) {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_nombre_persona",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_NOMBRE_PERSONA, tid, phoneNumberId);
      return;
    }
    if (!res.ok) {
      if (esIdentificacionLibreRazonable(raw)) {
        const next = {
          ...sess,
          step: "awaiting_addr_provincia",
          addrOrigenPaso: "opcional",
          identificacionLibreTexto: raw,
          nisParaPedido: null,
          medidorParaPedido: null,
          nisMedidorParaPedido: null,
          phoneNumberId: sess.phoneNumberId || wpid,
        };
        if (pareceNombreParaContactoWhatsapp(raw)) {
          next.contactName = raw;
        }
        sessions.set(sk, next);
        if (await intentarGeocodificarConUbicacionGpsPinSiHay(phone, next, sk, contactName, ctx, phoneNumberId || wpid)) {
          return;
        }
        await reply(
          phone,
          "Listo. *Tomamos* tu *nombre o referencia* para este reclamo.\n\n" + MSG_ADDR_PROVINCIA,
          tid,
          phoneNumberId
        );
        return;
      }
      await reply(
        phone,
        "No encontramos ese dato para este servicio. Revisá el número o escribí *no* para continuar sin datos.",
        tid,
        phoneNumberId
      );
      return;
    }
    const nuevoNombre = res.clienteNombre;
    const locCat = String(res.catalogoLocalidad || "").trim();
    const calleCat = String(res.catalogoCalle || "").trim();
    const numCat = String(res.catalogoNumero || "").trim();
    const puedeMapaDesdePadron =
      locCat.length >= 2 && calleCat.length >= 2 && sess.descripcion && String(sess.descripcion).trim();

    if (puedeMapaDesdePadron) {
      const nextSess = {
        ...sess,
        contactName: nuevoNombre || sess.contactName,
        nisParaPedido: res.nis ?? null,
        medidorParaPedido: res.medidor ?? null,
        nisMedidorParaPedido: res.nisMedidor ?? null,
        phoneNumberId: sess.phoneNumberId || wpid,
      };
      aplicarSuministroCatalogoWhatsappRes(nextSess, res);
      aplicarPadronCoordsWhatsapp(nextSess, res);
      sessions.set(sk, nextSess);
      const extraPad = lineasExtraPadronWhatsapp(res);
      await reply(
        phone,
        `Listo, registramos a *${nuevoNombre}*.\n\n*Cliente encontrado en padrón.*${extraPad}\n\nDomicilio: *${calleCat} ${numCat || "s/n"}*, *${locCat}*. Te mostramos un *resumen* para confirmar…`,
        tid,
        phoneNumberId
      );
      await geocodeStructuredAddressAndFinalizePedido(
        phone,
        nextSess,
        sk,
        contactName,
        ctx,
        phoneNumberId || wpid,
        locCat,
        calleCat,
        numCat || "0",
        { origenCatalogo: true, stateOrProvince: trimOrNullWhatsapp(nextSess.addrProvincia) || ctx?.geocodeState || "" }
      );
      return;
    }

    const sessOpc = {
      ...sess,
      step: "awaiting_addr_provincia",
      addrOrigenPaso: "opcional",
      contactName: nuevoNombre || sess.contactName,
      nisParaPedido: res.nis ?? null,
      medidorParaPedido: res.medidor ?? null,
      nisMedidorParaPedido: res.nisMedidor ?? null,
      phoneNumberId: sess.phoneNumberId || wpid,
    };
    aplicarSuministroCatalogoWhatsappRes(sessOpc, res);
    aplicarPadronCoordsWhatsapp(sessOpc, res);
    sessions.set(sk, sessOpc);
    if (await intentarGeocodificarConUbicacionGpsPinSiHay(phone, sessOpc, sk, contactName, ctx, phoneNumberId || wpid)) {
      return;
    }
    await reply(
      phone,
      `Listo, registramos a *${nuevoNombre}*.\n\n` + MSG_ADDR_PROVINCIA,
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_nis_whatsapp") {
    if (esComandoAtras(text)) {
      sess.step = "awaiting_desc";
      delete sess.addrOrigenPaso;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(
        phone,
        `Volvimos al paso anterior.\n\nAhora escribí de nuevo una *breve descripción* del problema (una o varias líneas).`,
        tid,
        phoneNumberId
      );
      return;
    }
    const raw = String(text || "").trim();
    const res = await buscarIdentidadParaReclamoWhatsApp(tid, raw);
    if (!res.ok || res.skip) {
      await reply(
        phone,
        "No encontramos ese *NIS* o *medidor* en el sistema. Revisá el dato o escribí *atrás* / *menú*.",
        tid,
        phoneNumberId
      );
      return;
    }
    const nuevoNombre = res.clienteNombre;
    const locCat = String(res.catalogoLocalidad || "").trim();
    const calleCat = String(res.catalogoCalle || "").trim();
    const numCat = String(res.catalogoNumero || "").trim();
    const puedeMapaDesdePadron =
      locCat.length >= 2 && calleCat.length >= 2 && sess.descripcion && String(sess.descripcion).trim();

    sess.nisParaPedido = res.nis ?? null;
    sess.medidorParaPedido = res.medidor ?? null;
    sess.nisMedidorParaPedido = res.nisMedidor ?? null;
    sess.contactName = nuevoNombre || sess.contactName;
    aplicarSuministroCatalogoWhatsappRes(sess, res);
    aplicarPadronCoordsWhatsapp(sess, res);
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();

    if (puedeMapaDesdePadron) {
      sessions.set(sk, sess);
      const extraPadNis = lineasExtraPadronWhatsapp(res);
      await reply(
        phone,
        `Listo, registramos el *NIS* y a *${nuevoNombre}*.\n\n*Cliente encontrado en padrón.*${extraPadNis}\n\nDomicilio: *${calleCat} ${numCat || "s/n"}*, *${locCat}*. Te mostramos un *resumen* para confirmar…`,
        tid,
        phoneNumberId
      );
      await geocodeStructuredAddressAndFinalizePedido(
        phone,
        sess,
        sk,
        contactName,
        ctx,
        phoneNumberId || wpid,
        locCat,
        calleCat,
        numCat || "0",
        { origenCatalogo: true, stateOrProvince: trimOrNullWhatsapp(sess.addrProvincia) || ctx?.geocodeState || "" }
      );
      return;
    }

    sess.step = "awaiting_addr_provincia";
    sess.addrOrigenPaso = "nis_solo";
    sessions.set(sk, sess);
    if (await intentarGeocodificarConUbicacionGpsPinSiHay(phone, sess, sk, contactName, ctx, phoneNumberId || wpid)) {
      return;
    }
    await reply(
      phone,
      `Registramos el *NIS*. Para ubicar el reclamo en el mapa, primero indicá la *provincia*${nuevoNombre ? ` (titular: *${nuevoNombre}*)` : ""}.\n\n` +
        MSG_ADDR_PROVINCIA,
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_addr_provincia") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      const orig = sess.addrOrigenPaso;
      if (orig === "nombre") {
        sess.step = "awaiting_nombre_persona";
        delete sess.addrOrigenPaso;
        delete sess.addrProvincia;
        if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
        sessions.set(sk, sess);
        await reply(phone, MSG_NOMBRE_PERSONA, tid, phoneNumberId);
        return;
      }
      if (orig === "opcional") {
        sess.step = "awaiting_opcional_id";
        delete sess.addrOrigenPaso;
        delete sess.addrProvincia;
        if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
        sessions.set(sk, sess);
        await reply(phone, msgOpcionalIdentificadorPorRubro(ctx), tid, phoneNumberId);
        return;
      }
      if (orig === "nis_solo") {
        sess.step = "awaiting_nis_whatsapp";
        delete sess.addrOrigenPaso;
        delete sess.addrProvincia;
        if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
        sessions.set(sk, sess);
        await reply(phone, MSG_PEDIR_NIS_SOLO, tid, phoneNumberId);
        return;
      }
      sess.step = "awaiting_identificacion_modo";
      delete sess.addrOrigenPaso;
      delete sess.addrProvincia;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, mensajeMenuIdentificacion(ctx), tid, phoneNumberId);
      return;
    }
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n < 1 || n > PROVINCIAS_ARG_BOT.length) {
      await reply(phone, `Respondé con un *número del 1 al ${PROVINCIAS_ARG_BOT.length}* según la lista de provincias.`, tid, phoneNumberId);
      return;
    }
    const provNombre = PROVINCIAS_ARG_BOT[n - 1];
    sess.addrProvincia = provNombre;
    delete sess.addrCodigoPostal;
    sess.step = "awaiting_addr_ciudad";
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(phone, msgCiudadLuegoDeProvincia(provNombre), tid, phoneNumberId);
    return;
  }

  if (sess && sess.step === "awaiting_addr_ciudad") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      sess.step = "awaiting_addr_provincia";
      delete sess.addrCiudad;
      delete sess.addrProvincia;
      delete sess.addrCodigoPostal;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, MSG_ADDR_PROVINCIA, tid, phoneNumberId);
      return;
    }
    if (!sess.addrProvincia || !String(sess.addrProvincia).trim()) {
      sess.step = "awaiting_addr_provincia";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(
        phone,
        "Falta la *provincia*. Elegí un *número del 1 al 24* en la lista anterior.\n\n" + MSG_ADDR_PROVINCIA,
        tid,
        phoneNumberId
      );
      return;
    }
    const vLoc = validarLocalidadWhatsApp(t);
    if (!vLoc.ok) {
      await reply(phone, vLoc.msg, tid, phoneNumberId);
      return;
    }
    const vCat = await validarLocalidadParaChatWhatsapp(tid, vLoc.value, sess.addrProvincia);
    if (!vCat.ok) {
      await reply(phone, vCat.msg, tid, phoneNumberId);
      return;
    }
    sess.addrCiudad = vCat.nombreCanonico || vLoc.value;
    sess.addrCalle = null;
    sess.addrNumero = null;
    delete sess.addrCodigoPostal;
    sess.step = "awaiting_addr_calle";
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(phone, MSG_ADDR_CALLE, tid, phoneNumberId);
    return;
  }

  if (sess && sess.step === "awaiting_addr_calle") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      sess.step = "awaiting_addr_ciudad";
      sess.addrCalle = null;
      sess.addrNumero = null;
      delete sess.addrNumeroSugerido;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      const prov = String(sess.addrProvincia || "").trim();
      await reply(
        phone,
        prov ? msgCiudadLuegoDeProvincia(prov) : MSG_ADDR_CIUDAD,
        tid,
        phoneNumberId
      );
      return;
    }
    const aCal = analizarEntradaCalleWhatsapp(t);
    if (!aCal.ok) {
      await reply(phone, aCal.msg, tid, phoneNumberId);
      return;
    }
    sess.addrCalle = aCal.calle;
    if (aCal.numeroSugerido) {
      sess.addrNumeroSugerido = String(aCal.numeroSugerido);
    } else {
      delete sess.addrNumeroSugerido;
    }
    sess.step = "awaiting_addr_numero";
    sessions.set(sk, sess);
    let msgNum = MSG_ADDR_NUMERO;
    if (sess.addrNumeroSugerido) {
      msgNum =
        `Si el número de puerta que querías era *${sess.addrNumeroSugerido}*, escribilo así; si no, indicá el correcto.\n\n` +
        MSG_ADDR_NUMERO;
    }
    await reply(phone, msgNum, tid, phoneNumberId);
    return;
  }

  if (sess && sess.step === "awaiting_suministro_conexion") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      delete sess.suministroTipoConexion;
      delete sess.suministroFases;
      sess.step = "awaiting_addr_numero";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, MSG_ADDR_NUMERO, tid, phoneNumberId);
      return;
    }
    const c = interpretaSuministroConexionWhatsapp(t);
    if (!c) {
      await reply(
        phone,
        "No entendimos. Respondé *1* (aéreo) o *2* (subterráneo).",
        tid,
        phoneNumberId
      );
      return;
    }
    sess.suministroTipoConexion = c;
    sess.step = "awaiting_suministro_fases";
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await reply(phone, MSG_SUMINISTRO_FASES, tid, phoneNumberId);
    return;
  }

  if (sess && sess.step === "awaiting_suministro_fases") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      delete sess.suministroFases;
      sess.step = "awaiting_suministro_conexion";
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, MSG_SUMINISTRO_CONEXION, tid, phoneNumberId);
      return;
    }
    const f = interpretaSuministroFasesWhatsapp(t);
    if (!f) {
      await reply(
        phone,
        "No entendimos. Respondé *1* (monofásico) o *2* (trifásico).",
        tid,
        phoneNumberId
      );
      return;
    }
    sess.suministroFases = f;
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await geocodeStructuredAddressAndFinalizePedido(
      phone,
      sess,
      sk,
      contactName,
      ctx,
      phoneNumberId || wpid,
      sess.addrCiudad,
      sess.addrCalle,
      sess.addrNumero,
      { origenCatalogo: !!sess._geocodeOrigenCatalogo }
    );
    return;
  }

  if (sess && sess.step === "awaiting_confirmar_resumen") {
    const t = String(text || "").trim();
    if (debeSalirAlMenuPrincipalWhatsApp(lower, sess)) {
      sessions.delete(sk);
      await reply(phone, menuTextoNumerado(ctx), tid, phoneNumberId);
      return;
    }
    if (esComandoAtras(t)) {
      volverAtrasDomicilioDesdeResumenWhatsapp(sess, sk, phoneNumberId);
      await reply(
        phone,
        "Volvimos al *número de puerta*. Corregí el dato y seguimos.\n\n" + MSG_ADDR_NUMERO,
        tid,
        phoneNumberId
      );
      return;
    }
    const conf = interpretaConfirmacionResumenWhatsapp(text);
    if (conf === "no") {
      volverAtrasDomicilioDesdeResumenWhatsapp(sess, sk, phoneNumberId);
      await reply(phone, "Indicá de nuevo el *número de puerta* (solo dígitos, o *0* si no aplica).\n\n" + MSG_ADDR_NUMERO, tid, phoneNumberId);
      return;
    }
    if (conf === "si") {
      await finalizePedidoFromSession(phone, sess, contactName);
      return;
    }
    await reply(
      phone,
      "No entendimos. Respondé *SI* o *1* para *registrar* el reclamo, *atrás* para corregir calle/número, o *menú* para salir.",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_addr_numero") {
    const t = String(text || "").trim();
    if (esComandoAtras(t)) {
      sess.step = "awaiting_addr_calle";
      sess.addrNumero = null;
      delete sess.addrNumeroSugerido;
      if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
      sessions.set(sk, sess);
      await reply(phone, MSG_ADDR_CALLE, tid, phoneNumberId);
      return;
    }
    const vNum = validarNumeroPuertaWhatsApp(t);
    if (!vNum.ok) {
      await reply(phone, vNum.msg, tid, phoneNumberId);
      return;
    }
    sess.addrNumero = vNum.value;
    delete sess.addrNumeroSugerido;
    if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
    sessions.set(sk, sess);
    await geocodeStructuredAddressAndFinalizePedido(
      phone,
      sess,
      sk,
      contactName,
      ctx,
      phoneNumberId,
      sess.addrCiudad,
      sess.addrCalle,
      sess.addrNumero,
      { origenCatalogo: false }
    );
    return;
  }

  if (!sess || sess.step === "idle") {
    if (pendOpinionActiva) {
      try {
        const opIdle = await tryConsumeClienteOpinionReply({
          tenantId: tid,
          phoneDigits: phone,
          text,
          nombreEntidad: ctx?.nombre,
        });
        if (opIdle.handled) {
          sessions.delete(sk);
          if (opIdle.ack) await reply(phone, opIdle.ack, tid, phoneNumberId);
          return;
        }
      } catch (_) {}
    }
    if (esPedidoCargarReclamo(text)) {
      if (ctx.whatsappBloqueoReclamos) {
        await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
        return;
      }
      await replyListaTiposReclamo(phone, ctx, phoneNumberId);
      return;
    }
    const n = enteroMenuPrincipalDesdeTextoLibre(text);
    if (n != null && n >= 1 && n <= ctx.tipos.length) {
      const tipoSel = ctx.tipos[n - 1];
      if (tipoSel === TIPO_RECLAMO_OTROS || tipoSel === "Pérdida en Vereda/Calle") {
        await iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx);
        return;
      }
      if (ctx.whatsappBloqueoReclamos) {
        await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
        return;
      }
      sessions.set(sk, {
        step: "awaiting_desc",
        tipo: tipoSel,
        tenantId: tid,
        tipoCliente: ctx.tipo,
        contactName: contactName || null,
        phoneNumberId: wpid,
      });
      await reply(
        phone,
        `Elegiste: *${tipoSel}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).\n\n` +
          `_(*menú* / *0* = salir · *atrás* = cancelar este reclamo)_`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(
      phone,
      `No reconocí el mensaje.\n\n` + textoBienvenidaYAyuda(ctx),
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_desc") {
    if (esComandoAtras(text)) {
      if (sess.factibilidadPostGpsRama === "servicio" || sess.factibilidadPostGpsRama === "nombre") {
        sess.step = "awaiting_factibilidad_post_gps";
        delete sess.factibilidadPostGpsRama;
        if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
        sessions.set(sk, sess);
        await reply(
          phone,
          "Recibimos tu *ubicación*. Respondé con *1* (datos del servicio) o *2* (nombre y dirección) o *0* (salir).\n\n" +
            `_(*menú* = salir · *atrás* = volver a describir / otra ubicación)_`,
          tid,
          phoneNumberId
        );
        return;
      }
      sessions.delete(sk);
      await reply(phone, textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
      return;
    }
    const desc = String(text ?? "");
    if (!desc.trim()) {
      await reply(phone, "Escribí una *breve descripción* del problema (no puede quedar vacío).", tid, phoneNumberId);
      return;
    }
    const ramaFac = sess.factibilidadPostGpsRama;
    if (ramaFac === "servicio" || ramaFac === "nombre") {
      delete sess.factibilidadPostGpsRama;
      if (ramaFac === "servicio") {
        sessions.set(sk, {
          ...sess,
          step: "awaiting_opcional_id",
          descripcion: desc,
          phoneNumberId: sess.phoneNumberId || wpid,
        });
        await reply(phone, msgOpcionalIdentificadorPorRubro(ctx), tid, phoneNumberId);
        return;
      }
      sessions.set(sk, {
        ...sess,
        step: "awaiting_nombre_persona",
        descripcion: desc,
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_NOMBRE_PERSONA, tid, phoneNumberId);
      return;
    }
    if (tipoReclamoWhatsappFlujoSoloNis(sess.tipo)) {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_nis_whatsapp",
        descripcion: desc,
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_PEDIR_NIS_SOLO, tid, phoneNumberId);
      return;
    }
    sessions.set(sk, {
      ...sess,
      step: "awaiting_identificacion_modo",
      descripcion: desc,
      phoneNumberId: sess.phoneNumberId || wpid,
    });
    await reply(phone, mensajeMenuIdentificacion(ctx), tid, phoneNumberId);
    return;
  }
}
