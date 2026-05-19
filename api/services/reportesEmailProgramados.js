/**
 * Informes periódicos por email (SMTP opcional).
 * made by leavera77
 */

import nodemailer from "nodemailer";
import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";

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
  };
}

export async function putReporteEmailConfig(tenantId, { email, frecuencia }) {
  if (!(await configTableOk())) {
    throw new Error("Ejecutá docs/NEON_fcm_reportes_sla.sql en Neon");
  }
  const freq = ["off", "diario", "semanal"].includes(frecuencia) ? frecuencia : "off";
  const r = await query(
    `INSERT INTO tenant_reporte_email_config (tenant_id, email, frecuencia, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET email = EXCLUDED.email, frecuencia = EXCLUDED.frecuencia, updated_at = NOW()
     RETURNING *`,
    [tenantId, String(email || "").trim() || null, freq]
  );
  return r.rows[0];
}

export async function generarYEnviarReporteTenant(tenantId, { forzar = false } = {}) {
  const cfg = await getReporteEmailConfig(tenantId);
  if (!cfg.email || cfg.frecuencia === "off") {
    return { ok: false, mensaje: "Reportes desactivados o sin email" };
  }
  const transport = smtpTransport();
  if (!transport) {
    return { ok: false, mensaje: "SMTP no configurado en el servidor (SMTP_HOST)" };
  }
  const hasT = await pedidosTableHasTenantIdColumn();
  const since = parsePeriod(cfg.frecuencia === "semanal" ? "7d" : "1d");
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
  const subject = `GestorNova — informe ${cfg.frecuencia} tenant ${tenantId}`;
  const text = `Resumen operativo\n\nTotal: ${s.total}\nPendientes: ${s.pendientes}\nEn ejecución: ${s.en_ejecucion}\nCerrados: ${s.cerrados}\n\n— GestorNova`;
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@gestornova.local",
    to: cfg.email,
    subject,
    text,
  });
  if (await configTableOk()) {
    await query(`UPDATE tenant_reporte_email_config SET ultimo_envio = NOW() WHERE tenant_id = $1`, [tenantId]);
  }
  return { ok: true, mensaje: `Informe enviado a ${cfg.email}` };
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
      await generarYEnviarReporteTenant(row.tenant_id);
      n += 1;
    } catch (e) {
      console.warn("[reportes-cron]", row.tenant_id, e.message);
    }
  }
  return { processed: n };
}
