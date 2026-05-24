/**
 * Informes periódicos por email (SMTP o EmailJS).
 * made by leavera77
 */

import nodemailer from "nodemailer";
import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import {
  emailjsServidorConfigurado,
  enviarCorreoEmailjsServidor,
} from "./emailjsEnvioServidor.js";

async function configTableOk() {
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_reporte_email_config' LIMIT 1`
    );
    return t.rows.length > 0;
  } catch {
    return false;
  }
}

async function emailjsColumnOk() {
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tenant_reporte_email_config' AND column_name = 'emailjs_config'
       LIMIT 1`
    );
    return t.rows.length > 0;
  } catch {
    return false;
  }
}

function smtpTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

function normalizarFreq(frecuencia) {
  return ["off", "diario", "semanal"].includes(frecuencia) ? frecuencia : "off";
}

/** @param {unknown} raw */
function normalizarEmailjsBody(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const publicKey = String(o.publicKey || o.public_key || "").trim();
  const serviceId = String(o.serviceId || o.service_id || "").trim();
  const templateId = String(o.templateId || o.template_id || "").trim();
  if (!publicKey || !serviceId || !templateId) return null;
  return { publicKey, serviceId, templateId };
}

export async function getStoredEmailjsConfig(tenantId) {
  if (!(await configTableOk()) || !(await emailjsColumnOk())) return null;
  try {
    const r = await query(
      `SELECT emailjs_config FROM tenant_reporte_email_config WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const raw = r.rows?.[0]?.emailjs_config;
    if (!raw || typeof raw !== "object") return null;
    return normalizarEmailjsBody(raw);
  } catch {
    return null;
  }
}

async function saveStoredEmailjsConfig(tenantId, emailjs) {
  if (!(await configTableOk()) || !(await emailjsColumnOk()) || !emailjs) return;
  try {
    await query(
      `UPDATE tenant_reporte_email_config SET emailjs_config = $2::jsonb, updated_at = NOW() WHERE tenant_id = $1`,
      [tenantId, JSON.stringify(emailjs)]
    );
  } catch (e) {
    console.warn("[reportes-email] emailjs_config no guardado:", e.message);
  }
}

/**
 * @param {number} tenantId
 * @param {{ frecuencia?: string, forzar?: boolean }} [opts]
 */
export async function buildResumenInformeTenant(tenantId, { frecuencia = "diario", forzar = false } = {}) {
  const freq = normalizarFreq(frecuencia);
  const hasT = await pedidosTableHasTenantIdColumn();
  const periodo = freq === "semanal" ? "7d" : "1d";
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
  const s = r.rows?.[0] || {};
  const etiquetaFreq = forzar && freq === "off" ? "prueba" : freq;
  const subject = `GestorNova — informe ${etiquetaFreq}`;
  const text = `Resumen operativo (${periodo})\n\nTotal: ${s.total}\nPendientes: ${s.pendientes}\nEn ejecución: ${s.en_ejecucion}\nCerrados: ${s.cerrados}\n\n— GestorNova`;
  return { text, subject, periodo, etiquetaFreq };
}

export async function getReporteEmailConfig(tenantId) {
  if (!(await configTableOk())) {
    return { email: "", frecuencia: "off", tabla_ok: false };
  }
  const r = await query(
    `SELECT email, frecuencia, ultimo_envio FROM tenant_reporte_email_config WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = r.rows?.[0];
  return {
    email: row?.email || "",
    frecuencia: row?.frecuencia || "off",
    ultimo_envio: row?.ultimo_envio || null,
    tabla_ok: true,
    emailjs_en_servidor: emailjsServidorConfigurado(),
    emailjs_guardado: !!(await getStoredEmailjsConfig(tenantId)),
  };
}

export async function putReporteEmailConfig(tenantId, { email, frecuencia, emailjs }) {
  if (!(await configTableOk())) {
    throw new Error("Ejecutá docs/NEON_fcm_reportes_sla.sql en Neon");
  }
  const freq = normalizarFreq(frecuencia);
  const r = await query(
    `INSERT INTO tenant_reporte_email_config (tenant_id, email, frecuencia, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET email = EXCLUDED.email, frecuencia = EXCLUDED.frecuencia, updated_at = NOW()
     RETURNING *`,
    [tenantId, String(email || "").trim() || null, freq]
  );
  const ej = normalizarEmailjsBody(emailjs);
  if (ej) await saveStoredEmailjsConfig(tenantId, ej);
  return r.rows[0];
}

export async function registrarUltimoEnvioInforme(tenantId) {
  if (!(await configTableOk())) return;
  await query(`UPDATE tenant_reporte_email_config SET ultimo_envio = NOW() WHERE tenant_id = $1`, [tenantId]);
}

async function resolveEmailjsParaEnvio(tenantId, emailjsOverride) {
  const fromBody = normalizarEmailjsBody(emailjsOverride);
  if (fromBody) return fromBody;
  const stored = await getStoredEmailjsConfig(tenantId);
  if (stored) return stored;
  return null;
}

export async function generarYEnviarReporteTenant(
  tenantId,
  { forzar = false, emailOverride, frecuenciaOverride, emailjsOverride } = {}
) {
  const cfg = await getReporteEmailConfig(tenantId);
  if (!cfg.tabla_ok && !forzar) {
    return { ok: false, mensaje: "Ejecutá docs/NEON_fcm_reportes_sla.sql en Neon" };
  }
  const email = String(emailOverride ?? cfg.email ?? "").trim();
  const freq = normalizarFreq(frecuenciaOverride ?? cfg.frecuencia ?? "off");
  if (!email) {
    return {
      ok: false,
      mensaje: forzar
        ? "Indicá un email destino en el formulario"
        : "Reportes desactivados o sin email",
    };
  }
  if (!forzar && (freq === "off" || !cfg.email)) {
    return { ok: false, mensaje: "Reportes desactivados o sin email (guardá la config)" };
  }

  const { text, subject, etiquetaFreq } = await buildResumenInformeTenant(tenantId, {
    frecuencia: freq,
    forzar,
  });

  const emailjsCfg = await resolveEmailjsParaEnvio(tenantId, emailjsOverride);
  const transport = smtpTransport();
  let via = "smtp";
  if (transport) {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@gestornova.local",
      to: email,
      subject,
      text,
    });
  } else if (emailjsServidorConfigurado(emailjsCfg)) {
    via = "emailjs";
    await enviarCorreoEmailjsServidor(
      {
        to_email: email,
        to_name: "Administrador",
        message: text,
        subject,
        token: "informe",
        app_name: `GestorNova — informe ${etiquetaFreq}`,
      },
      emailjsCfg
    );
  } else {
    return {
      ok: false,
      mensaje:
        "Correo no disponible en el servidor. Desde la web usá «Enviar ahora» (EmailJS del config.json) o agregá EMAILJS_* en Render. Opcional: docs/NEON_reporte_email_emailjs.sql para guardar credenciales en Neon.",
      usar_cliente: true,
    };
  }

  await registrarUltimoEnvioInforme(tenantId);
  const viaTxt = via === "emailjs" ? " (EmailJS API)" : "";
  return { ok: true, mensaje: `Informe enviado a ${email}${viaTxt}` };
}

/** Cron: procesar todos los tenants con frecuencia activa. */
export async function ejecutarReportesProgramadosCron() {
  if (!(await configTableOk())) return { processed: 0 };
  const r = await query(
    `SELECT tenant_id, email, frecuencia, ultimo_envio FROM tenant_reporte_email_config WHERE frecuencia IN ('diario','semanal') AND email IS NOT NULL`
  );
  let n = 0;
  for (const row of r.rows || []) {
    const ult = row.ultimo_envio ? new Date(row.ultimo_envio).getTime() : 0;
    const h = Date.now() - ult;
    const min = row.frecuencia === "semanal" ? 6 * 24 * 3600 * 1000 : 20 * 3600 * 1000;
    if (h < min) continue;
    try {
      const out = await generarYEnviarReporteTenant(row.tenant_id, {
        frecuenciaOverride: row.frecuencia,
        emailOverride: row.email,
      });
      if (out.ok) n += 1;
      else console.warn("[reportes-cron]", row.tenant_id, out.mensaje);
    } catch (e) {
      console.warn("[reportes-cron]", row.tenant_id, e.message);
    }
  }
  return { processed: n };
}
