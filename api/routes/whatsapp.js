import express from "express";
import { authWithTenantHost } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { normalizePhone } from "../utils/helpers.js";
import { metaSendWhatsAppText } from "../services/metaWhatsapp.js";
import {
  tableHasColumn,
  getPedidoRowInTenant,
  usuarioPerteneceATenant,
  pedidosTableHasTenantIdColumn,
  usuariosTenantColumnName,
} from "../utils/tenantScope.js";

const router = express.Router();
router.use(authWithTenantHost);

async function whatsappNotifInsertCols() {
  const hasTenant = await tableHasColumn("whatsapp_notificaciones", "tenant_id");
  return { hasTenant };
}

async function assertWhatsAppRefsEnTenant(req, { destinatario_id, pedido_id }) {
  const tid = req.tenantId;
  if (pedido_id != null && String(pedido_id).trim() !== "") {
    const pid = Number(pedido_id);
    if (!Number.isFinite(pid) || pid < 1) {
      return { ok: false, status: 400, error: "pedido_id inválido" };
    }
    const p = await getPedidoRowInTenant(pid, tid);
    if (!p) {
      return { ok: false, status: 403, error: "Pedido no encontrado en este tenant" };
    }
  }
  if (destinatario_id != null && String(destinatario_id).trim() !== "") {
    const uid = Number(destinatario_id);
    if (!Number.isFinite(uid) || uid < 1) {
      return { ok: false, status: 400, error: "destinatario_id inválido" };
    }
    const okU = await usuarioPerteneceATenant(uid, tid);
    if (!okU) {
      return { ok: false, status: 403, error: "Destinatario no pertenece a este tenant" };
    }
  }
  return { ok: true };
}

router.post("/enviar-link", async (req, res) => {
  try {
    const { destinatario_id, destinatario_tipo = "usuario", telefono, pedido_id, mensaje } = req.body;
    const chk = await assertWhatsAppRefsEnTenant(req, { destinatario_id, pedido_id });
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });

    const tel = normalizePhone(telefono);
    if (!tel || !mensaje) return res.status(400).json({ error: "telefono y mensaje son requeridos" });

    const waUrl = `https://wa.me/${tel.replace(/[^\d]/g, "")}?text=${encodeURIComponent(String(mensaje))}`;
    const { hasTenant } = await whatsappNotifInsertCols();
    let r;
    if (hasTenant) {
      r = await query(
        `INSERT INTO whatsapp_notificaciones
         (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion, tenant_id)
         VALUES($1,$2,$3,$4,$5,'enviado',NOW(),NOW(),$6)
         RETURNING *`,
        [destinatario_id || null, destinatario_tipo, tel, mensaje, pedido_id || null, req.tenantId]
      );
    } else {
      r = await query(
        `INSERT INTO whatsapp_notificaciones
         (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
         VALUES($1,$2,$3,$4,$5,'enviado',NOW(),NOW())
         RETURNING *`,
        [destinatario_id || null, destinatario_tipo, tel, mensaje, pedido_id || null]
      );
    }
    res.status(201).json({ ok: true, waUrl, registro: r.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "No se pudo registrar envío WhatsApp", detail: error.message });
  }
});

router.get("/historial", async (req, res) => {
  try {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "Solo admin" });
    const tid = req.tenantId;
    const { hasTenant } = await whatsappNotifInsertCols();
    if (hasTenant) {
      const r = await query(
        `SELECT * FROM whatsapp_notificaciones WHERE tenant_id = $1 ORDER BY id DESC LIMIT 500`,
        [tid]
      );
      return res.json(r.rows);
    }
    const pedidosTid = await pedidosTableHasTenantIdColumn();
    const ucol = await usuariosTenantColumnName();
    if (pedidosTid && ucol) {
      const r = await query(
        `SELECT w.*
         FROM whatsapp_notificaciones w
         LEFT JOIN pedidos p ON p.id = w.pedido_id
         LEFT JOIN usuarios u ON u.id = w.destinatario_id
         WHERE (w.pedido_id IS NOT NULL AND p.id IS NOT NULL AND p.tenant_id = $1)
            OR (w.pedido_id IS NULL AND w.destinatario_id IS NOT NULL AND u.${ucol} = $1)
         ORDER BY w.id DESC
         LIMIT 500`,
        [tid]
      );
      return res.json(r.rows);
    }
    if (ucol) {
      const r = await query(
        `SELECT w.*
         FROM whatsapp_notificaciones w
         INNER JOIN usuarios u ON u.id = w.destinatario_id
         WHERE u.${ucol} = $1
         ORDER BY w.id DESC
         LIMIT 500`,
        [tid]
      );
      return res.json(r.rows);
    }
    const r = await query("SELECT * FROM whatsapp_notificaciones ORDER BY id DESC LIMIT 500");
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener historial", detail: error.message });
  }
});

router.post("/meta/enviar-texto", async (req, res) => {
  try {
    const { telefono, mensaje, destinatario_id, pedido_id } = req.body || {};
    const chk = await assertWhatsAppRefsEnTenant(req, { destinatario_id, pedido_id });
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });

    const tel = normalizePhone(telefono);
    const body = String(mensaje || "").trim();
    if (!tel || !body) return res.status(400).json({ error: "telefono y mensaje son requeridos" });

    const send = await metaSendWhatsAppText(tel, body);
    const graph = send.graph || {};
    const { hasTenant } = await whatsappNotifInsertCols();
    if (!send.ok) {
      if (send.error === "missing_meta_credentials") {
        return res.status(500).json({ error: "Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID" });
      }
      if (hasTenant) {
        await query(
          `INSERT INTO whatsapp_notificaciones
           (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion, tenant_id)
           VALUES($1,'usuario',$2,$3,$4,'error',NOW(),NOW(),$5)`,
          [destinatario_id || null, tel, body, pedido_id || null, req.tenantId]
        );
      } else {
        await query(
          `INSERT INTO whatsapp_notificaciones
           (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
           VALUES($1,'usuario',$2,$3,$4,'error',NOW(),NOW())`,
          [destinatario_id || null, tel, body, pedido_id || null]
        );
      }
      return res.status(send.status || 502).json({ ok: false, error: "graph_error", detail: graph });
    }

    let r;
    if (hasTenant) {
      r = await query(
        `INSERT INTO whatsapp_notificaciones
         (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion, tenant_id)
         VALUES($1,'usuario',$2,$3,$4,'enviado',NOW(),NOW(),$5) RETURNING *`,
        [destinatario_id || null, tel, body, pedido_id || null, req.tenantId]
      );
    } else {
      r = await query(
        `INSERT INTO whatsapp_notificaciones
         (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
         VALUES($1,'usuario',$2,$3,$4,'enviado',NOW(),NOW()) RETURNING *`,
        [destinatario_id || null, tel, body, pedido_id || null]
      );
    }
    return res.json({ ok: true, graph, registro: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo enviar por Meta", detail: error.message });
  }
});

export default router;
