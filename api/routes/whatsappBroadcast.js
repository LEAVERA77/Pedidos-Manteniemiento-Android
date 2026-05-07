import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { sendTenantWhatsAppText } from "../services/whatsappService.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";
import {
  getTenantConfiguracionForWhatsappAreas,
  normalizeArgentinaMobileWithTenantAreaConfig,
} from "../utils/whatsappArAreaConfig.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);

function aplicarPlaceholders(texto, ctx) {
  let s = String(texto || "");
  const map = {
    "{ciudad}": ctx.ciudad || "",
    "{fecha}": ctx.fecha || "",
    "{horario}": ctx.horario || "",
    "{direccion}": ctx.direccion || "",
    "{telefono}": ctx.telefono || "",
  };
  for (const [k, v] of Object.entries(map)) {
    s = s.split(k).join(v);
  }
  return s;
}

/**
 * Destinatarios masivos: **solo móviles** AR (54 + 9 + área). Excluye fijos (54 sin 9).
 * Une `pedidos.telefono_contacto` y `socios_catalogo.telefono` del tenant (y rubro si existe la columna).
 */
async function telefonosMovilesPedidosYSociosTenantBusiness(tenantId, businessType) {
  const hasBtP = await tableHasColumn("pedidos", "business_type");
  const cfg = await getTenantConfiguracionForWhatsappAreas(tenantId);

  const paramsP = [tenantId];
  let whP = "tenant_id = $1 AND telefono_contacto IS NOT NULL AND TRIM(telefono_contacto::text) <> ''";
  if (hasBtP && businessType) {
    paramsP.push(businessType);
    whP += ` AND business_type = $${paramsP.length}`;
  }
  const hasLocP = await tableHasColumn("pedidos", "cliente_localidad");
  const rP = await query(
    hasLocP
      ? `SELECT TRIM(telefono_contacto::text) AS raw,
                NULLIF(TRIM(COALESCE(cliente_localidad::text, '')), '') AS loc
         FROM pedidos WHERE ${whP}
         GROUP BY TRIM(telefono_contacto::text), NULLIF(TRIM(COALESCE(cliente_localidad::text, '')), '')`
      : `SELECT DISTINCT TRIM(telefono_contacto::text) AS raw, NULL::text AS loc FROM pedidos WHERE ${whP}`,
    paramsP
  );

  let rS = { rows: [] };
  try {
    const hasTS = await tableHasColumn("socios_catalogo", "tenant_id");
    const hasBtS = await tableHasColumn("socios_catalogo", "business_type");
    const hasLocS = await tableHasColumn("socios_catalogo", "localidad");
    if (hasTS) {
      const paramsS = [tenantId];
      let whS = `tenant_id = $1 AND COALESCE(activo, TRUE) AND telefono IS NOT NULL AND TRIM(telefono::text) <> ''`;
      if (hasBtS && businessType) {
        paramsS.push(businessType);
        whS += ` AND business_type = $${paramsS.length}`;
      }
      rS = await query(
        hasLocS
          ? `SELECT TRIM(telefono::text) AS raw,
                    NULLIF(TRIM(COALESCE(localidad::text, '')), '') AS loc
             FROM socios_catalogo WHERE ${whS}
             GROUP BY TRIM(telefono::text), NULLIF(TRIM(COALESCE(localidad::text, '')), '')`
          : `SELECT DISTINCT TRIM(telefono::text) AS raw, NULL::text AS loc FROM socios_catalogo WHERE ${whS}`,
        paramsS
      );
    }
  } catch (e) {
    console.warn("[whatsappBroadcast] socios_catalogo", e?.message || e);
  }

  const out = new Set();
  for (const row of [...(rP.rows || []), ...(rS.rows || [])]) {
    const norm = normalizeArgentinaMobileWithTenantAreaConfig(row.raw, cfg, row.loc);
    if (norm && norm.length >= 12) out.add(norm);
  }
  return [...out];
}

router.post("/community", async (req, res) => {
  try {
    if (req.body?.confirm !== true && String(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ error: "confirm: true requerido para envío masivo" });
    }
    const titulo = String(req.body?.titulo || "").trim();
    let mensaje = String(req.body?.mensaje || "").trim();
    if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });

    const bt = normalizeBusinessTypeInput(req.body?.business_type) || req.activeBusinessType || "electricidad";
    const now = new Date();
    const ctx = {
      ciudad: String(req.body?.ciudad_ctx || "").trim(),
      fecha: now.toLocaleDateString("es-AR"),
      horario: now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      direccion: String(req.body?.direccion_ctx || "").trim(),
      telefono: String(req.body?.telefono_ctx || "").trim(),
    };
    mensaje = aplicarPlaceholders(mensaje, ctx);
    const cuerpo = titulo ? `*${titulo}*\n\n${mensaje}` : mensaje;

    const tels = await telefonosMovilesPedidosYSociosTenantBusiness(req.tenantId, bt);
    if (!tels.length) {
      return res.status(400).json({
        error:
          "No hay teléfonos móviles válidos en pedidos ni en el catálogo de socios (se excluyen fijos y números mal cargados). En Empresa podés cargar característica por localidad (343 vs 3438, etc.) y un respaldo para números 15… incompletos.",
      });
    }

    let ok = 0;
    let err = 0;
    for (const to of tels) {
      const rSend = await sendTenantWhatsAppText({
        tenantId: req.tenantId,
        toDigits: to,
        bodyText: cuerpo,
        pedidoId: null,
        logContext: "broadcast_comunidad",
      });
      if (rSend.ok) ok += 1;
      else err += 1;
      await new Promise((r) => setTimeout(r, 110));
    }

    try {
      await query(
        `INSERT INTO comunicaciones_envios(
          tenant_id, business_type, canal, titulo, cuerpo, imagen_url, botones_json,
          destinatarios_total, enviados_ok, enviados_error, meta, creado_por_usuario_id
        ) VALUES ($1,$2,'whatsapp',$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)`,
        [
          req.tenantId,
          bt,
          titulo || null,
          cuerpo,
          req.body?.imagen_url || null,
          JSON.stringify(Array.isArray(req.body?.botones) ? req.body.botones.slice(0, 3) : []),
          tels.length,
          ok,
          err,
          JSON.stringify({ kind: "community" }),
          req.user?.id ?? null,
        ]
      );
    } catch (_) {
      /* tabla opcional hasta migración */
    }

    return res.json({ ok: true, destinatarios: tels.length, enviados_ok: ok, enviados_error: err, business_type: bt });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo completar el envío masivo", detail: e.message });
  }
});

router.post("/corte-programado", async (req, res) => {
  try {
    if (req.body?.confirm !== true && String(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ error: "confirm: true requerido" });
    }
    const bt = normalizeBusinessTypeInput(req.body?.business_type) || req.activeBusinessType || "electricidad";
    if (bt === "municipio") {
      return res.status(400).json({ error: "Corte programado no aplica a municipio" });
    }
    const zona = String(req.body?.zona_afectada || "").trim();
    const motivo = String(req.body?.motivo || "").trim();
    const fi = req.body?.fecha_inicio;
    const ff = req.body?.fecha_fin;
    const servicio = bt === "agua" ? "AGUA POTABLE" : "ENERGÍA ELÉCTRICA";
    if (!zona || !motivo) return res.status(400).json({ error: "zona_afectada y motivo requeridos" });

    const extra = String(req.body?.mensaje || "").trim();
    const cuerpo = [
      `⚠️ CORTE PROGRAMADO DE ${servicio}`,
      "",
      `Zona: ${zona}`,
      `Desde: ${fi || "—"}`,
      `Hasta: ${ff || "—"}`,
      `Motivo: ${motivo}`,
      "",
      extra || "",
    ]
      .filter(Boolean)
      .join("\n");

    const tels = await telefonosMovilesPedidosYSociosTenantBusiness(req.tenantId, bt);
    if (!tels.length) {
      return res.status(400).json({
        error:
          "No hay teléfonos móviles en pedidos ni en socios para avisar (WhatsApp solo a celulares; los fijos se omiten). Revisá teléfonos en reclamos y padrón, y en Empresa la característica por localidad o la lista de prefijos (3438,343,…).",
      });
    }

    let ok = 0;
    let err = 0;
    for (const to of tels) {
      const rSend = await sendTenantWhatsAppText({
        tenantId: req.tenantId,
        toDigits: to,
        bodyText: cuerpo,
        pedidoId: null,
        logContext: "broadcast_corte_programado",
      });
      if (rSend.ok) ok += 1;
      else err += 1;
      await new Promise((r) => setTimeout(r, 110));
    }

    try {
      await query(
        `INSERT INTO cortes_programados(
          tenant_id, business_type, zona_afectada, fecha_inicio, fecha_fin, motivo, mensaje_enviado, mensaje_texto
        ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,TRUE,$7)`,
        [req.tenantId, bt, zona || null, fi || null, ff || null, motivo || null, cuerpo]
      );
    } catch (_) {
      /* tabla opcional hasta migración */
    }

    return res.json({ ok: true, destinatarios: tels.length, enviados_ok: ok, enviados_error: err });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo registrar el corte programado", detail: e.message });
  }
});

export default router;
