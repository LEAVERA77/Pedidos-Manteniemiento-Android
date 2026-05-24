/**
 * Contenido de informes periódicos por email (texto + params EmailJS).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { analisisBreveInformeEmail } from "./reportesInformeGroq.js";

export const FRECUENCIAS_INFORME = ["off", "diario", "semanal", "mensual"];

/** @param {string} frecuencia */
export function normalizarFrecuenciaInforme(frecuencia) {
  return FRECUENCIAS_INFORME.includes(frecuencia) ? frecuencia : "off";
}

/** @param {string} freq */
function periodoSql(freq) {
  if (freq === "semanal") return "7d";
  if (freq === "mensual") return "mes";
  return "1d";
}

/** @param {string} freq @param {boolean} forzar */
function etiquetaPeriodo(freq, forzar) {
  if (forzar && freq === "off") return "de prueba";
  if (freq === "semanal") return "semanal (últimos 7 días)";
  if (freq === "mensual") return "mensual (último mes)";
  if (freq === "diario") return "diario (últimas 24 horas)";
  return "operativo";
}

/** @param {string} freq @param {boolean} forzar */
function asuntoInforme(freq, forzar, nombreEmpresa) {
  const emp = nombreEmpresa ? ` — ${nombreEmpresa}` : "";
  if (forzar && freq === "off") return `Informe operativo de prueba${emp} | GestorNova`;
  if (freq === "semanal") return `Informe operativo semanal${emp} | GestorNova`;
  if (freq === "mensual") return `Informe operativo mensual${emp} | GestorNova`;
  if (freq === "diario") return `Informe operativo diario${emp} | GestorNova`;
  return `Informe operativo${emp} | GestorNova`;
}

/** @param {{ total: number, pendientes: number, en_ejecucion: number, cerrados: number }} s */
function analisisSinIa(s, freq) {
  const t = Number(s.total) || 0;
  const p = Number(s.pendientes) || 0;
  const e = Number(s.en_ejecucion) || 0;
  const c = Number(s.cerrados) || 0;
  if (t === 0) {
    return "En el período no se registraron pedidos nuevos. Conviene verificar que los canales de carga (WhatsApp, oficina, técnicos) estén activos.";
  }
  const partes = [];
  if (p > 0 && p >= t * 0.4) {
    partes.push(`Hay ${p} pedido(s) pendiente(s) (${Math.round((p / t) * 100)}% del total), lo que sugiere revisar asignación a cuadrillas.`);
  }
  if (e > 0) {
    partes.push(`${e} reclamo(s) están en ejecución; seguí el avance en el panel para evitar demoras.`);
  }
  if (c > 0) {
    partes.push(`Se cerraron ${c} pedido(s) en el período ${etiquetaPeriodo(freq, false)}.`);
  }
  if (!partes.length) {
    partes.push("La operación se mantiene estable en el período analizado.");
  }
  return partes.join(" ");
}

async function nombreEmpresaTenant(tenantId) {
  try {
    const r = await query(`SELECT nombre FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    return String(r.rows?.[0]?.nombre || "").trim() || "GestorNova";
  } catch {
    return "GestorNova";
  }
}

async function estadisticasPeriodo(tenantId, freq) {
  const hasT = await pedidosTableHasTenantIdColumn();
  const periodo = periodoSql(freq);
  const since = parsePeriod(periodo);
  const params = hasT ? [tenantId] : [];
  const tsql = hasT ? ` AND tenant_id = $1` : "";
  const r = await query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estado='Pendiente')::int AS pendientes,
      COUNT(*) FILTER (WHERE estado='En ejecución')::int AS en_ejecucion,
      COUNT(*) FILTER (WHERE estado='Cerrado')::int AS cerrados
     FROM pedidos WHERE fecha_creacion >= ${since}${tsql}`,
    params
  );
  return { stats: r.rows?.[0] || {}, periodo };
}

/**
 * @param {number} tenantId
 * @param {{ frecuencia?: string, forzar?: boolean, destinatarioNombre?: string, destinatarioEmail?: string }} [opts]
 */
export async function buildContenidoInformeTenant(
  tenantId,
  { frecuencia = "diario", forzar = false, destinatarioNombre, destinatarioEmail } = {}
) {
  const freq = normalizarFrecuenciaInforme(frecuencia);
  const nombreEmpresa = await nombreEmpresaTenant(tenantId);
  const { stats, periodo } = await estadisticasPeriodo(tenantId, freq);
  const etiquetaFreq = forzar && freq === "off" ? "prueba" : freq;
  const periodoLabel = etiquetaPeriodo(freq, forzar);
  const subject = asuntoInforme(freq, forzar, nombreEmpresa);

  let analisis =
    (await analisisBreveInformeEmail({ stats, frecuencia: freq, nombreEmpresa })) ||
    analisisSinIa(stats, freq);

  const bloqueResumen = [
    "RESUMEN DE PEDIDOS",
    `• Total en el período: ${stats.total ?? 0}`,
    `• Pendientes: ${stats.pendientes ?? 0}`,
    `• En ejecución: ${stats.en_ejecucion ?? 0}`,
    `• Cerrados: ${stats.cerrados ?? 0}`,
  ].join("\n");

  const cuerpo = [
    `Hola ${destinatarioNombre || "Administrador"},`,
    "",
    `Te enviamos el informe operativo ${periodoLabel} de ${nombreEmpresa} (GestorNova).`,
    "",
    bloqueResumen,
    "",
    "ANÁLISIS",
    analisis,
    "",
    "Podés ver el detalle de cada pedido en el panel de administración.",
    "",
    "Saludos,",
    `Equipo de ${nombreEmpresa}`,
  ].join("\n");

  const emailjsParams = {
    to_email: destinatarioEmail || "",
    to_name: destinatarioNombre || "Administrador",
    email_subject: subject,
    email_body: cuerpo,
    informe_asunto: subject,
    informe_cuerpo: cuerpo,
    informe_periodo: periodoLabel,
    informe_tipo: etiquetaFreq,
    message: cuerpo,
    subject,
    app_name: nombreEmpresa,
    token: "—",
  };

  return {
    text: cuerpo,
    subject,
    periodo,
    etiquetaFreq,
    periodoLabel,
    nombreEmpresa,
    stats,
    analisis,
    emailjsParams,
  };
}

/** Params EmailJS unificados para envío SMTP/API/navegador. */
export function emailjsParamsDesdeContenido(contenido, destinatarioEmail, destinatarioNombre) {
  const p = { ...contenido.emailjsParams };
  if (destinatarioEmail) p.to_email = destinatarioEmail;
  if (destinatarioNombre) p.to_name = destinatarioNombre;
  p.email_subject = contenido.subject;
  p.email_body = contenido.text;
  p.message = contenido.text;
  p.subject = contenido.subject;
  p.informe_cuerpo = contenido.text;
  p.informe_asunto = contenido.subject;
  p.token = "—";
  return p;
}
