/**
 * Plantilla EmailJS integrada GestorNova para informes (asunto + cuerpo dinámicos).
 * made by leavera77
 */

import { query } from "../db/neon.js";

export const GESTORNOVA_INFORME_TEMPLATE_NAME = "GestorNova_Informe_Operativo";

/** Definición de la plantilla que debe existir en EmailJS (creada por API o a mano una vez). */
export const GESTORNOVA_INFORME_TEMPLATE_DEF = {
  name: GESTORNOVA_INFORME_TEMPLATE_NAME,
  subject: "{{email_subject}}",
  html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;max-width:640px">
<div style="white-space:pre-wrap">{{email_body}}</div>
</div>`,
  text: "{{email_body}}",
};

let cacheTemplateId = String(process.env.EMAILJS_TEMPLATE_ID_INFORME || "").trim();

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

async function leerTemplateIdDesdeNeon() {
  if (!(await emailjsColumnOk())) return "";
  try {
    const r = await query(
      `SELECT emailjs_config->>'templateIdInforme' AS tid
       FROM tenant_reporte_email_config
       WHERE emailjs_config->>'templateIdInforme' IS NOT NULL
         AND trim(emailjs_config->>'templateIdInforme') <> ''
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`
    );
    return String(r.rows?.[0]?.tid || "").trim();
  } catch {
    return "";
  }
}

async function guardarTemplateIdNeon(tenantId, templateId) {
  if (!tenantId || !templateId || !(await emailjsColumnOk())) return;
  try {
    await query(
      `INSERT INTO tenant_reporte_email_config (tenant_id, emailjs_config, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         emailjs_config = COALESCE(tenant_reporte_email_config.emailjs_config, '{}'::jsonb)
           || jsonb_build_object('templateIdInforme', $3::text),
         updated_at = NOW()`,
      [tenantId, JSON.stringify({ templateIdInforme: templateId }), templateId]
    );
  } catch (e) {
    console.warn("[emailjs-informe] no se guardó templateId en Neon:", e.message);
  }
}

/**
 * Intenta crear la plantilla GestorNova en EmailJS (requiere EMAILJS_PRIVATE_KEY).
 * @returns {Promise<string>}
 */
async function intentarCrearPlantillaEmailjs() {
  const publicKey = String(process.env.EMAILJS_PUBLIC_KEY || process.env.EMAILJS_USER_ID || "").trim();
  const privateKey = String(process.env.EMAILJS_PRIVATE_KEY || "").trim();
  const serviceId = String(process.env.EMAILJS_SERVICE_ID || "").trim();
  if (!publicKey || !privateKey || !serviceId) return "";

  const payloads = [
    {
      user_id: publicKey,
      accessToken: privateKey,
      service_id: serviceId,
      template: {
        name: GESTORNOVA_INFORME_TEMPLATE_DEF.name,
        subject: GESTORNOVA_INFORME_TEMPLATE_DEF.subject,
        html: GESTORNOVA_INFORME_TEMPLATE_DEF.html,
        text: GESTORNOVA_INFORME_TEMPLATE_DEF.text,
      },
    },
    {
      user_id: publicKey,
      accessToken: privateKey,
      service_id: serviceId,
      template_name: GESTORNOVA_INFORME_TEMPLATE_DEF.name,
      template_subject: GESTORNOVA_INFORME_TEMPLATE_DEF.subject,
      template_html: GESTORNOVA_INFORME_TEMPLATE_DEF.html,
      template_text: GESTORNOVA_INFORME_TEMPLATE_DEF.text,
    },
  ];

  const urls = [
    "https://api.emailjs.com/api/v1.0/email/template/create",
    "https://api.emailjs.com/api/v1.0/email/templates",
    "https://api.emailjs.com/api/v1.0/email/template/add",
  ];

  for (const url of urls) {
    for (const body of payloads) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const txt = await r.text();
        if (!r.ok) continue;
        try {
          const j = JSON.parse(txt);
          const id = String(j.template_id || j.templateId || j.id || "").trim();
          if (id) return id;
        } catch {
          if (/template_[a-z0-9]+/i.test(txt)) {
            const m = txt.match(/template_[a-z0-9]+/i);
            if (m) return m[0];
          }
        }
      } catch {
        /* siguiente intento */
      }
    }
  }
  return "";
}

/**
 * Resuelve el Template ID de informes (env → Neon → creación automática).
 * @param {number} [tenantId]
 */
export async function resolveGestorNovaInformeTemplateId(tenantId) {
  if (cacheTemplateId) return cacheTemplateId;

  const fromEnv = String(process.env.EMAILJS_TEMPLATE_ID_INFORME || "").trim();
  if (fromEnv) {
    cacheTemplateId = fromEnv;
    return cacheTemplateId;
  }

  const fromDb = await leerTemplateIdDesdeNeon();
  if (fromDb) {
    cacheTemplateId = fromDb;
    return cacheTemplateId;
  }

  const created = await intentarCrearPlantillaEmailjs();
  if (created) {
    cacheTemplateId = created;
    if (tenantId) await guardarTemplateIdNeon(tenantId, created);
    console.info("[emailjs-informe] plantilla GestorNova creada/enlazada:", created);
    return cacheTemplateId;
  }

  return "";
}

/**
 * @param {number} tenantId
 */
export async function ensureGestorNovaInformeTemplate(tenantId) {
  const templateId = await resolveGestorNovaInformeTemplateId(tenantId);
  const resetId = String(process.env.EMAILJS_TEMPLATE_ID || "").trim();
  if (!templateId) {
    return {
      ok: false,
      templateIdInforme: "",
      mensaje:
        "No se pudo obtener la plantilla de informes. En Render agregá EMAILJS_TEMPLATE_ID_INFORME o EMAILJS_PRIVATE_KEY para crearla automáticamente.",
    };
  }
  if (resetId && templateId === resetId) {
    return {
      ok: false,
      templateIdInforme: templateId,
      mensaje:
        "EMAILJS_TEMPLATE_ID_INFORME no puede ser igual al de recuperación de clave. Usá EMAILJS_PRIVATE_KEY en Render o un Template ID distinto.",
    };
  }
  if (tenantId) await guardarTemplateIdNeon(tenantId, templateId);
  return { ok: true, templateIdInforme: templateId, mensaje: "Plantilla GestorNova informes lista" };
}
