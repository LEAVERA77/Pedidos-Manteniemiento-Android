/**
 * Informes periódicos por email (SMTP o EmailJS).
 * made by leavera77
 */

import nodemailer from "nodemailer";
import { query } from "../db/neon.js";
import {
  emailjsInformeConfigurado,
  enviarCorreoInformeEmailjs,
} from "./emailjsEnvioInforme.js";
import { ensureGestorNovaInformeTemplate } from "./emailjsPlantillaInformeGestorNova.js";
import {
  buildContenidoInformeTenant,
  normalizarFrecuenciaInforme,
  emailjsParamsDesdeContenido,
} from "./reportesInformeContenido.js";

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

/** @param {unknown} raw @param {number} [tenantId] */
async function normalizarEmailjsBody(raw, tenantId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const publicKey = String(o.publicKey || o.public_key || "").trim();
  const serviceId = String(o.serviceId || o.service_id || "").trim();
  let templateIdInforme = String(o.templateIdInforme || o.template_id_informe || "").trim();
  if (!templateIdInforme) {
    const ensured = await ensureGestorNovaInformeTemplate(tenantId);
    templateIdInforme = ensured.templateIdInforme || "";
  }
  if (!publicKey || !serviceId || !templateIdInforme) return null;
  return { publicKey, serviceId, templateId: templateIdInforme, templateIdInforme };
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
    return normalizarEmailjsBody(raw, tenantId);
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
 * @param {{ frecuencia?: string, forzar?: boolean, destinatarioEmail?: string, destinatarioNombre?: string }} [opts]
 */
export async function buildResumenInformeTenant(tenantId, opts = {}) {
  return buildContenidoInformeTenant(tenantId, opts);
}

export async function getReporteEmailConfig(tenantId) {
  if (!(await configTableOk())) {
    return { email: "", frecuencia: "off", tabla_ok: false };
  }
  const tpl = await ensureGestorNovaInformeTemplate(tenantId);
  const r = await query(
    `SELECT email, frecuencia, ultimo_envio FROM tenant_reporte_email_config WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = r.rows?.[0];
  const stored = await getStoredEmailjsConfig(tenantId);
  return {
    email: row?.email || "",
    frecuencia: row?.frecuencia || "off",
    ultimo_envio: row?.ultimo_envio || null,
    tabla_ok: true,
    emailjs_en_servidor: await emailjsInformeConfigurado(stored, tenantId),
    emailjs_plantilla_gestornova: tpl.ok,
    emailjs_template_id_informe: tpl.templateIdInforme || stored?.templateIdInforme || "",
  };
}

export async function putReporteEmailConfig(tenantId, { email, frecuencia, emailjs }) {
  if (!(await configTableOk())) {
    throw new Error("Ejecutá docs/NEON_fcm_reportes_sla.sql en Neon");
  }
  const freq = normalizarFrecuenciaInforme(frecuencia);
  const r = await query(
    `INSERT INTO tenant_reporte_email_config (tenant_id, email, frecuencia, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET email = EXCLUDED.email, frecuencia = EXCLUDED.frecuencia, updated_at = NOW()
     RETURNING *`,
    [tenantId, String(email || "").trim() || null, freq]
  );
  let ej = emailjs ? await normalizarEmailjsBody(emailjs, tenantId) : null;
  if (!ej && (emailjs?.publicKey || process.env.EMAILJS_PUBLIC_KEY)) {
    ej = await normalizarEmailjsBody(
      {
        publicKey: emailjs?.publicKey || process.env.EMAILJS_PUBLIC_KEY,
        serviceId: emailjs?.serviceId || process.env.EMAILJS_SERVICE_ID,
      },
      tenantId
    );
  }
  if (ej) await saveStoredEmailjsConfig(tenantId, ej);
  return r.rows[0];
}

export async function registrarUltimoEnvioInforme(tenantId) {
  if (!(await configTableOk())) return;
  await query(`UPDATE tenant_reporte_email_config SET ultimo_envio = NOW() WHERE tenant_id = $1`, [tenantId]);
}

async function resolveEmailjsParaEnvio(tenantId, emailjsOverride) {
  const fromBody = await normalizarEmailjsBody(emailjsOverride, tenantId);
  if (fromBody) return fromBody;
  const stored = await getStoredEmailjsConfig(tenantId);
  if (stored) return stored;
  const ej = await normalizarEmailjsBody(
    {
      publicKey: process.env.EMAILJS_PUBLIC_KEY,
      serviceId: process.env.EMAILJS_SERVICE_ID,
    },
    tenantId
  );
  return ej;
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
  const freq = normalizarFrecuenciaInforme(frecuenciaOverride ?? cfg.frecuencia ?? "off");
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

  const contenido = await buildContenidoInformeTenant(tenantId, {
    frecuencia: freq,
    forzar,
    destinatarioEmail: email,
    destinatarioNombre: "Administrador",
  });
  const params = emailjsParamsDesdeContenido(contenido, email, "Administrador");

  const emailjsCfg = await resolveEmailjsParaEnvio(tenantId, emailjsOverride);
  const transport = smtpTransport();
  let via = "smtp";
  if (transport) {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@gestornova.local",
      to: email,
      subject: contenido.subject,
      text: contenido.text,
    });
  } else if (await emailjsInformeConfigurado(emailjsCfg, tenantId)) {
    via = "emailjs";
    await enviarCorreoInformeEmailjs(params, emailjsCfg, tenantId);
  } else {
    const tpl = await ensureGestorNovaInformeTemplate(tenantId);
    return {
      ok: false,
      mensaje:
        tpl.mensaje ||
        "Plantilla GestorNova de informes no disponible. En Render: EMAILJS_TEMPLATE_ID_INFORME o EMAILJS_PRIVATE_KEY.",
      usar_cliente: false,
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
    `SELECT tenant_id, email, frecuencia, ultimo_envio FROM tenant_reporte_email_config WHERE frecuencia IN ('diario','semanal','mensual') AND email IS NOT NULL`
  );
  let n = 0;
  for (const row of r.rows || []) {
    const ult = row.ultimo_envio ? new Date(row.ultimo_envio).getTime() : 0;
    const h = Date.now() - ult;
    const min =
      row.frecuencia === "mensual"
        ? 25 * 24 * 3600 * 1000
        : row.frecuencia === "semanal"
          ? 6 * 24 * 3600 * 1000
          : 20 * 3600 * 1000;
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
