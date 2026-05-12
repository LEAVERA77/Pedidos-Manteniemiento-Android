/**
 * Genera mensajes de aviso masivo con IA (Groq / Llama 3.3).
 * Instrucciones diferenciadas por tipo de negocio y título.
 * made by leavera77
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function esEventoOFiesta(tituloLower) {
  const palabras = ["fiesta", "festival", "festejo", "patron", "aniversario", "evento", "acto",
    "celebracion", "inauguracion", "desfile", "corso", "carnaval", "feria", "recital",
    "show", "campeonato", "torneo", "jornada", "invita", "concierto", "espectaculo"];
  return palabras.some((p) => tituloLower.includes(p));
}

function instruccionesMunicipio(tituloLower) {
  if (esEventoOFiesta(tituloLower)) {
    return [
      "El aviso es por un EVENTO O CELEBRACIÓN. El tono debe ser festivo e invitar a la población a participar.",
      "- NO pedir disculpas por molestias.",
      "- Incluir fecha/hora si se deducen del título; si no, dejar [FECHA] y [HORA] para que el admin complete.",
      "- Incluir lugar: dejar [LUGAR] si no se indica.",
      "- Cerrar invitando a los vecinos y sus familias a disfrutar del evento.",
      "- Teléfono de información: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("tormenta")) {
    return [
      "El aviso es por una TORMENTA. El mensaje debe incluir indicaciones concretas para los vecinos:",
      "- Pedir disculpas por las molestias e inconvenientes.",
      "- No salir de casa salvo emergencia.",
      "- No arrojar basura a la vía pública.",
      "- Mantener destapados los desagües pluviales.",
      "- Asegurar objetos sueltos en patios y balcones.",
      "- Evitar circular por calles anegadas.",
      "- Tener a mano linternas y cargadores.",
      "- Teléfono de emergencias del municipio: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("inundacion") || tituloLower.includes("inundación")) {
    return [
      "El aviso es por INUNDACIONES. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias e inconvenientes.",
      "- Zonas afectadas: dejar el marcador [ZONAS] para que el admin complete.",
      "- Indicaciones: no circular por zonas anegadas, evacuar si las autoridades lo indican.",
      "- No tocar cables caídos.",
      "- Mantener a niños y mascotas en lugar seguro.",
      "- Teléfono de emergencias: {telefono}.",
    ].join("\n");
  }
  return "Generar un aviso municipal genérico con el título ingresado. Si el aviso implica un inconveniente (obras, cortes, etc.), pedir disculpas por las molestias. Si es un evento positivo, invitar a participar. Incluir {telefono}.";
}

function instruccionesElectrica(tituloLower) {
  if (esEventoOFiesta(tituloLower)) {
    return [
      "El aviso es por un EVENTO O CELEBRACIÓN de la cooperativa. El tono debe ser festivo e invitar a socios/vecinos a participar.",
      "- NO pedir disculpas.",
      "- Incluir fecha/hora/lugar con marcadores [FECHA], [HORA], [LUGAR] si no se deducen.",
      "- Cerrar invitando a los socios y sus familias.",
      "- Teléfono de información: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("corte") && tituloLower.includes("total")) {
    return [
      "El aviso es por un CORTE TOTAL DE ENERGÍA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias ocasionadas.",
      "- Informar el corte total.",
      "- Horario estimado de restablecimiento: dejar [HORARIO] para que el admin complete.",
      "- Recomendaciones: desenchufar electrodomésticos, no usar velas sin supervisión, tener linternas.",
      "- Teléfono para reclamos: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("corte") && tituloLower.includes("programado")) {
    return [
      "El aviso es por un CORTE PROGRAMADO DE ENERGÍA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias ocasionadas.",
      "- Zona afectada: dejar [DISTRIBUIDOR/ZONA] para que el admin complete.",
      "- Horario: dejar [DESDE] a [HASTA] para que el admin complete.",
      "- Motivo del corte (mantenimiento preventivo si no se indica otro).",
      "- Recomendaciones para los vecinos.",
      "- Teléfono de contacto: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("corte")) {
    return [
      "El aviso es por un CORTE DE ENERGÍA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias ocasionadas.",
      "- Zona afectada: dejar [ZONA] si no está en el título.",
      "- Horario estimado de restablecimiento: dejar [HORARIO].",
      "- Recomendaciones: desenchufar electrodomésticos, tener linternas.",
      "- Teléfono para reclamos: {telefono}.",
    ].join("\n");
  }
  return "Generar un aviso de cooperativa eléctrica genérico. Si implica un inconveniente (corte, obras), pedir disculpas. Si es positivo (evento, reunión de socios), invitar a participar. Incluir {telefono}.";
}

function instruccionesAgua(tituloLower) {
  if (esEventoOFiesta(tituloLower)) {
    return [
      "El aviso es por un EVENTO O CELEBRACIÓN de la cooperativa. Tono festivo, invitar a socios/vecinos.",
      "- NO pedir disculpas.",
      "- Incluir [FECHA], [HORA], [LUGAR] si no se deducen.",
      "- Cerrar invitando a los socios y familias.",
      "- Teléfono de información: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("corte") || tituloLower.includes("sin agua")) {
    return [
      "El aviso es por un CORTE DE AGUA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias ocasionadas.",
      "- Zona afectada: dejar [ZONA] para que el admin complete.",
      "- Horario estimado de restablecimiento.",
      "- Motivo del corte.",
      "- Recomendaciones: guardar agua potable, mantener grifos cerrados.",
      "- Teléfono de contacto: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("baja presión") || tituloLower.includes("baja presion")) {
    return [
      "El aviso es por BAJA PRESIÓN DE AGUA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias.",
      "- Zona afectada: dejar [ZONA].",
      "- Posibles causas.",
      "- Recomendaciones.",
      "- Teléfono de contacto: {telefono}.",
    ].join("\n");
  }
  if (tituloLower.includes("reparación") || tituloLower.includes("reparacion") || tituloLower.includes("cañería") || tituloLower.includes("cañeria") || tituloLower.includes("caneria")) {
    return [
      "El aviso es por REPARACIÓN DE CAÑERÍA. El mensaje debe incluir:",
      "- Pedir disculpas por las molestias.",
      "- Zona de trabajos: dejar [ZONA].",
      "- Posibles cortes o baja presión durante los trabajos.",
      "- Recomendaciones.",
      "- Teléfono de contacto: {telefono}.",
    ].join("\n");
  }
  return "Generar un aviso de cooperativa de agua genérico. Si implica un inconveniente, pedir disculpas. Si es positivo, invitar a participar. Incluir {telefono}.";
}

function buildBroadcastSystemPrompt(tipoNegocio, titulo, nombreTenant) {
  const tipoLabel =
    tipoNegocio === "municipio"
      ? "un Municipio"
      : tipoNegocio === "cooperativa_agua"
        ? "una Cooperativa de Agua"
        : tipoNegocio === "cooperativa_electrica"
          ? "una Cooperativa Eléctrica"
          : "una empresa de servicios públicos";

  const tituloLower = (titulo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let instrucciones;
  if (tipoNegocio === "municipio") instrucciones = instruccionesMunicipio(tituloLower);
  else if (tipoNegocio === "cooperativa_electrica") instrucciones = instruccionesElectrica(tituloLower);
  else if (tipoNegocio === "cooperativa_agua") instrucciones = instruccionesAgua(tituloLower);
  else instrucciones = "Generar un aviso genérico. Si implica un inconveniente, pedir disculpas. Si es un evento positivo, invitar a participar. Incluir {telefono}.";

  let firmaLabel = nombreTenant || "";
  if (firmaLabel) {
    if (tipoNegocio === "municipio") firmaLabel = `Municipalidad de ${firmaLabel}`;
    else if (tipoNegocio === "cooperativa_agua") firmaLabel = `Cooperativa de Agua ${firmaLabel}`;
    else if (tipoNegocio === "cooperativa_electrica") firmaLabel = `Cooperativa Eléctrica ${firmaLabel}`;
  }

  return [
    `Eres un redactor de comunicados oficiales para ${tipoLabel} en Argentina.`,
    "Se te proporcionará un estilo/tema de un aviso que la entidad desea comunicar a los vecinos/socios por WhatsApp.",
    "El admin puede escribir una descripción larga del estilo; usala para adaptar el tono y contenido.",
    "Tu tarea es generar un mensaje de WhatsApp claro, conciso y formal pero amigable.",
    "",
    "Instrucciones específicas para este aviso:",
    instrucciones,
    "",
    "Reglas de tono:",
    "- Si el aviso implica un INCONVENIENTE (corte de servicio, obra, tormenta, inundación, reparaciones, problemas): PEDIR DISCULPAS POR LAS MOLESTIAS al inicio o cierre.",
    "- Si el aviso es un EVENTO POSITIVO (fiesta, festival, inauguración, celebración, torneo, acto, etc.): NO pedir disculpas. Usar tono festivo e INVITAR a la población/socios a participar.",
    "- Si es informativo neutro (aviso de horario, reunión ordinaria, etc.), tono informativo sin disculpas innecesarias.",
    "",
    "Reglas generales:",
    "- Máximo 800 caracteres.",
    "- No uses markdown, HTML ni emojis excesivos. Uno o dos emojis relevantes al inicio.",
    "- Incluí un saludo breve, el cuerpo del aviso y un cierre.",
    "- Donde dice [ZONA], [ZONAS], [HORARIO], [DESDE], [HASTA], [DISTRIBUIDOR/ZONA], [FECHA], [HORA], [LUGAR]: dejá esos marcadores LITERALES en el texto para que el admin los reemplace. NO los inventes.",
    "- Dejá la palabra {telefono} literal donde corresponda el teléfono de contacto.",
    firmaLabel ? `- Firmá al final con: "${firmaLabel}".` : "",
    "",
    "Devolvé SOLO el texto del mensaje, sin comillas ni explicación adicional.",
  ].filter(Boolean).join("\n");
}

/**
 * @param {{ titulo: string, tipo_negocio?: string, nombre_tenant?: string }} opts
 * @returns {Promise<{ ok: boolean, mensaje?: string, error?: string }>}
 */
export async function generarMensajeBroadcast({ titulo, tipo_negocio, nombre_tenant }) {
  const key = getApiKey();
  if (!key) return { ok: false, error: "GROQ_API_KEY no configurada" };
  if (!titulo || !titulo.trim()) return { ok: false, error: "Título vacío" };

  const systemPrompt = buildBroadcastSystemPrompt(tipo_negocio || "municipio", titulo, nombre_tenant || "");

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Estilo/tema del aviso: "${titulo.trim()}"` },
        ],
        temperature: 0.6,
        max_tokens: 600,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      return { ok: false, error: `Groq HTTP ${resp.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const mensaje = raw.trim().replace(/^["']|["']$/g, "");

    if (!mensaje) return { ok: false, error: "La IA no generó un mensaje" };
    return { ok: true, mensaje };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
