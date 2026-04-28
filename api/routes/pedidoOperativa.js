/**
 * Geocerca, chat interno y fotos clasificadas por pedido (Neon).
 * Se registra en el router de pedidos ANTES de GET /:id.
 */

import { query } from "../db/neon.js";
import { adminOnly } from "../middleware/auth.js";
import { distanciaMetrosHaversine } from "../services/geocercaHaversine.js";
import { uploadManyBase64 } from "../services/cloudinary.js";
import { parseFotosBase64 } from "../utils/helpers.js";
import { enqueueNotificacionChatInternoPedido } from "../services/notificacionesMovilEnqueue.js";

async function tableExists(name) {
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [name]
    );
    return t.rows.length > 0;
  } catch {
    return false;
  }
}

async function loadGeocercaSettings(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { habilitada: true, radio_metros: 100 };
  if (!(await tableExists("tenant_geocerca_settings"))) {
    return { habilitada: true, radio_metros: 100 };
  }
  const r = await query(
    `SELECT habilitada, radio_metros FROM tenant_geocerca_settings WHERE tenant_id = $1 LIMIT 1`,
    [tid]
  );
  const row = r.rows?.[0];
  if (!row) return { habilitada: true, radio_metros: 100 };
  return {
    habilitada: row.habilitada !== false,
    radio_metros: Math.min(5000, Math.max(10, Number(row.radio_metros) || 100)),
  };
}

function puedeVerPedido(user, pedido) {
  if (user.rol === "admin") return true;
  if (!pedido.tecnico_asignado_id) return true;
  return Number(pedido.tecnico_asignado_id) === Number(user.id);
}

/**
 * @param {import('express').Router} router
 * @param {{
 *   getPedidoInTenant: (id: number, req: import('express').Request) => Promise<object|null>,
 *   assertPedidoMismoTenant: (p: object, req: import('express').Request) => Promise<void>,
 *   notifyClientePedidoActividad?: (pedido: object, tenantId: number, detalleTexto: string) => Promise<void>,
 * }} deps
 */
export function registerPedidoOperativaRoutes(router, deps) {
  const { getPedidoInTenant, assertPedidoMismoTenant, notifyClientePedidoActividad } = deps;

  router.post("/:id/geocerca/verificar", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "lat y lng numéricos requeridos" });
      }
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!puedeVerPedido(req.user, pedido)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const tenantId = Number(req.tenantId);
      const cfg = await loadGeocercaSettings(tenantId);

      const plat = pedido.lat != null ? Number(pedido.lat) : null;
      const plng = pedido.lng != null ? Number(pedido.lng) : null;
      let dist = 0;
      let permitido = true;
      if (!cfg.habilitada) {
        permitido = true;
      } else if (plat == null || plng == null || Number.isNaN(plat) || Number.isNaN(plng)) {
        permitido = true;
        dist = -1;
      } else {
        dist = distanciaMetrosHaversine(lat, lng, plat, plng);
        permitido = dist <= cfg.radio_metros;
      }

      if (await tableExists("pedido_geocerca_evento")) {
        try {
          await query(
            `INSERT INTO pedido_geocerca_evento
             (tenant_id, pedido_id, usuario_id, lat_tecnico, lng_tecnico, lat_pedido, lng_pedido, distancia_metros, permitido)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [tenantId, id, req.user.id, lat, lng, plat, plng, dist < 0 ? 0 : dist, permitido]
          );
        } catch (e) {
          console.error("[geocerca] log", e.message);
        }
      }

      return res.json({
        permitido,
        distancia_metros: dist < 0 ? null : Math.round(dist * 10) / 10,
        max_metros: cfg.radio_metros,
        geocerca_habilitada: cfg.habilitada,
        pedido_sin_coordenadas: plat == null || plng == null,
      });
    } catch (error) {
      return res.status(500).json({ error: "Error geocerca", detail: error.message });
    }
  });

  router.get("/:id/geocerca/eventos", adminOnly, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!(await tableExists("pedido_geocerca_evento"))) return res.json([]);
      const r = await query(
        `SELECT e.*, u.nombre AS usuario_nombre
         FROM pedido_geocerca_evento e
         LEFT JOIN usuarios u ON u.id = e.usuario_id
         WHERE e.pedido_id = $1
         ORDER BY e.created_at DESC
         LIMIT 200`,
        [id]
      );
      return res.json(r.rows);
    } catch (error) {
      return res.status(500).json({ error: "Error listando eventos", detail: error.message });
    }
  });

  router.get("/:id/chat-interno/mensajes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!puedeVerPedido(req.user, pedido)) return res.status(403).json({ error: "Sin permiso" });
      if (!(await tableExists("pedido_chat_mensaje"))) return res.json([]);
      const r = await query(
        `SELECT m.*, u.nombre AS autor_nombre, u.rol AS autor_rol
         FROM pedido_chat_mensaje m
         JOIN usuarios u ON u.id = m.autor_usuario_id
         WHERE m.pedido_id = $1
         ORDER BY m.created_at ASC
         LIMIT 500`,
        [id]
      );
      return res.json(r.rows);
    } catch (error) {
      return res.status(500).json({ error: "Error chat", detail: error.message });
    }
  });

  router.post("/:id/chat-interno/mensajes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const cuerpo = String(req.body?.cuerpo || "").trim();
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      if (cuerpo.length < 1 || cuerpo.length > 4000) {
        return res.status(400).json({ error: "cuerpo: 1–4000 caracteres" });
      }
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!puedeVerPedido(req.user, pedido)) return res.status(403).json({ error: "Sin permiso" });
      if (!(await tableExists("pedido_chat_mensaje"))) {
        return res.status(503).json({ error: "Ejecutá docs/NEON_top3_operativa_cooperativa.sql en Neon" });
      }
      const tenantId = Number(req.tenantId);
      const ins = await query(
        `INSERT INTO pedido_chat_mensaje (tenant_id, pedido_id, autor_usuario_id, cuerpo)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tenantId, id, req.user.id, cuerpo]
      );
      const row = ins.rows[0];
      setImmediate(() => {
        enqueueNotificacionChatInternoPedido({
          pedido,
          autorUserId: req.user.id,
          autorRol: req.user.rol,
          cuerpoSnippet: cuerpo,
          tenantId,
        }).catch(() => {});
      });
      const u = await query(`SELECT nombre, rol FROM usuarios WHERE id = $1`, [req.user.id]);
      return res.status(201).json({
        ...row,
        autor_nombre: u.rows?.[0]?.nombre,
        autor_rol: u.rows?.[0]?.rol,
      });
    } catch (error) {
      return res.status(500).json({ error: "Error enviando mensaje", detail: error.message });
    }
  });

  router.get("/:id/fotos-clasificadas", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!puedeVerPedido(req.user, pedido)) return res.status(403).json({ error: "Sin permiso" });
      if (!(await tableExists("pedido_foto_clasificada"))) return res.json([]);
      const r = await query(
        `SELECT id, tipo, orden, url_cloudinary, created_at
         FROM pedido_foto_clasificada WHERE pedido_id = $1 ORDER BY tipo, orden ASC`,
        [id]
      );
      return res.json(r.rows);
    } catch (error) {
      return res.status(500).json({ error: "Error listando fotos", detail: error.message });
    }
  });

  router.post("/:id/fotos-clasificadas", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const tipo = String(req.body?.tipo || "").toLowerCase();
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
      if (!["antes", "despues", "otro"].includes(tipo)) {
        return res.status(400).json({ error: "tipo debe ser antes, despues u otro" });
      }
      const pedido = await getPedidoInTenant(id, req);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      try {
        await assertPedidoMismoTenant(pedido, req);
      } catch (e) {
        if (e.statusCode === 403) return res.status(403).json({ error: e.message });
        throw e;
      }
      if (!puedeVerPedido(req.user, pedido)) return res.status(403).json({ error: "Sin permiso" });
      if (!(await tableExists("pedido_foto_clasificada"))) {
        return res.status(503).json({ error: "Ejecutá docs/NEON_top3_operativa_cooperativa.sql en Neon" });
      }
      const fotosB64 = parseFotosBase64(req.body);
      if (!fotosB64.length) return res.status(400).json({ error: "fotos_base64 o foto_base64 requeridos" });
      if (fotosB64.length > 10) return res.status(400).json({ error: "máximo 10 imágenes por request" });
      const urls = await uploadManyBase64(fotosB64);
      const tenantId = Number(req.tenantId);

      const maxOrden = await query(
        `SELECT COALESCE(MAX(orden), -1) AS m FROM pedido_foto_clasificada WHERE pedido_id = $1 AND tipo = $2`,
        [id, tipo]
      );
      let orden = Number(maxOrden.rows?.[0]?.m ?? -1) + 1;
      const inserted = [];
      for (const url of urls) {
        if (orden >= 50) break;
        const ins = await query(
          `INSERT INTO pedido_foto_clasificada (tenant_id, pedido_id, tipo, orden, url_cloudinary)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (pedido_id, tipo, orden) DO UPDATE SET url_cloudinary = EXCLUDED.url_cloudinary
           RETURNING *`,
          [tenantId, id, tipo, orden, url]
        );
        inserted.push(ins.rows[0]);
        orden += 1;
      }
      if (notifyClientePedidoActividad && inserted.length && tipo === "despues") {
        setImmediate(() => {
          void notifyClientePedidoActividad(
            pedido,
            tenantId,
            "Se cargó material fotográfico «después» del trabajo en su reclamo."
          );
        });
      }
      return res.status(201).json({ ok: true, fotos: inserted });
    } catch (error) {
      return res.status(500).json({ error: "Error subiendo fotos", detail: error.message });
    }
  });
}
