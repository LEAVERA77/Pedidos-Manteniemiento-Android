import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { technicianTenantKeyOk, requireTechnicianTenantKey } from "../middleware/technicianTenantKey.js";
import { query, withTransaction } from "../db/neon.js";
import { tableHasColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";
import { crearUsuarioAdminBootstrap } from "../services/tenantBootstrapAdminUser.js";
import { loginExistsGlobally, normalizeLoginId } from "../utils/usuarioLoginGlobal.js";
import {
  TIPOS_RECLAMO_LEGACY,
  tiposReclamoParaClienteTipo,
  normalizarRubroCliente,
} from "../services/tiposReclamo.js";
import { normalizeBusinessTypeInput, rubroNormToBusinessType } from "../services/businessType.js";
import { rubroEfectivoParaTipos } from "../utils/businessScope.js";
import { setUbicacionCentralInTable } from "../services/configuracionStore.js";
import { sanitizeDerivacionReclamosForStore } from "../utils/derivacionReclamos.js";
import { mergeAndValidateDerivaciones } from "../utils/derivacionesConfig.js";
import { sanitizeWhatsappArAreaConfigIncrement } from "../utils/whatsappArAreaConfig.js";
import { resetPedidoContadorPorTenant } from "../services/pedidoContador.js";
import {
  findClienteByNombreAndRubro,
  isTenantSetupIncompleto,
} from "../utils/clienteNombreTipoDuplicate.js";

const router = express.Router();

function parseConfiguracionDb(val) {
  if (val == null) return {};
  if (typeof val === "object") return { ...val };
  if (typeof val === "string") {
    try {
      const o = JSON.parse(val);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

router.get("/mi-configuracion", authWithTenantHost, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const hasAbt = await tableHasColumn("clientes", "active_business_type");
    const r = await query(
      `SELECT id, nombre, tipo, plan, configuracion, activo, fecha_registro, fecha_actualizacion, barrio
              ${hasAbt ? ", active_business_type" : ""}
       FROM clientes
       WHERE id = $1
       LIMIT 1`,
      [tenantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    return res.json({ tenant_id: tenantId, cliente: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo consultar configuración", detail: error.message });
  }
});

router.put("/mi-configuracion", authWithTenantHost, async (req, res) => {
  try {
    const rol = String(req.user.rol || "").toLowerCase();
    const esAdminRol = rol === "admin" || rol === "administrador";
    const techKeyOk = technicianTenantKeyOk(req);
    const techRolOk =
      techKeyOk && (rol === "tecnico" || rol === "técnico" || rol === "supervisor");
    if (!esAdminRol && !techRolOk) {
      return res.status(403).json({ error: "Requiere rol administrador" });
    }

    const body = req.body || {};
    if (!esAdminRol && techRolOk) {
      const allowTop = new Set([
        "nombre",
        "tipo",
        "latitud",
        "longitud",
        "logo_url",
        "configuracion",
        "active_business_type",
      ]);
      for (const k of Object.keys(body)) {
        if (!allowTop.has(k)) delete body[k];
      }
      const cfgIn = body.configuracion;
      if (cfgIn && typeof cfgIn === "object" && !Array.isArray(cfgIn)) {
        const allowCfg = new Set([
          "setup_wizard_completado",
          "marca_publicada_admin",
          "abrir_wizard_recuperacion",
          "provincia",
          "state",
          "provincia_nominatim",
        ]);
        for (const k of Object.keys(cfgIn)) {
          if (!allowCfg.has(k)) delete cfgIn[k];
        }
      }
    }

    const tenantId = req.tenantId;
    const { nombre, tipo, latitud, longitud, configuracion: configuracionBody, active_business_type: activeBusinessBody } =
      body;
    const logo_url = Object.prototype.hasOwnProperty.call(body, "logo_url") ? body.logo_url : undefined;
    const barrioIn = Object.prototype.hasOwnProperty.call(body, "barrio") ? body.barrio : undefined;

    let tipoDb = null;
    if (tipo !== undefined && tipo !== null && String(tipo).trim() !== "") {
      const norm = normalizarRubroCliente(tipo);
      if (!norm) {
        return res.status(400).json({
          error: "Tipo de cliente no reconocido",
          detail: String(tipo),
          tipos_sugeridos: ["municipio", "cooperativa_electrica", "cooperativa_agua", "cooperativa", "empresa"],
        });
      }
      tipoDb = norm;
    }

    const hasAbtCol = await tableHasColumn("clientes", "active_business_type");
    const rTipoNow = await query(
      `SELECT tipo${hasAbtCol ? ", active_business_type" : ""} FROM clientes WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    if (!rTipoNow.rows.length) {
      return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    }
    const prevTipoNorm = normalizarRubroCliente(rTipoNow.rows[0]?.tipo);
    const prevAb = hasAbtCol ? String(rTipoNow.rows[0]?.active_business_type || "").trim().toLowerCase() : "";

    const Inc =
      typeof configuracionBody === "object" && configuracionBody !== null ? { ...configuracionBody } : {};

    if (Object.prototype.hasOwnProperty.call(Inc, "derivaciones")) {
      const r0 = await query(`SELECT configuracion FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
      const existingCfg = parseConfiguracionDb(r0.rows?.[0]?.configuracion);
      const vr = mergeAndValidateDerivaciones(existingCfg.derivaciones, Inc.derivaciones);
      if (!vr.ok) {
        return res.status(400).json({ error: vr.error, detalles: vr.detalles });
      }
      Inc.derivaciones = vr.value;
    }

    if (Object.prototype.hasOwnProperty.call(Inc, "ocultar_modulos_redes")) {
      const o = Inc.ocultar_modulos_redes;
      Inc.ocultar_modulos_redes = !!(
        o === true ||
        o === 1 ||
        String(o).toLowerCase() === "true" ||
        String(o) === "1"
      );
    }

    const cfgJson = {
      ...Inc,
      ...(latitud != null ? { lat_base: latitud } : {}),
      ...(longitud != null ? { lng_base: longitud } : {}),
    };
    sanitizeWhatsappArAreaConfigIncrement(cfgJson);
    if (Object.prototype.hasOwnProperty.call(body, "logo_url")) {
      const v = logo_url;
      cfgJson.logo_url = v === "" || v == null ? null : String(v);
    }

    if (Object.prototype.hasOwnProperty.call(cfgJson, "derivacion_reclamos")) {
      try {
        const s = sanitizeDerivacionReclamosForStore(cfgJson.derivacion_reclamos);
        cfgJson.derivacion_reclamos = s === null ? {} : s;
      } catch (e) {
        return res.status(400).json({
          error: "derivacion_reclamos inválido",
          detail: e?.message || String(e),
        });
      }
    }

    let newActiveBt = null;
    let activeBtSql = "";
    const params = [tenantId, nombre ?? null, tipoDb, JSON.stringify(cfgJson)];
    if (
      hasAbtCol &&
      activeBusinessBody !== undefined &&
      activeBusinessBody !== null &&
      String(activeBusinessBody).trim() !== ""
    ) {
      const ab = normalizeBusinessTypeInput(activeBusinessBody);
      if (ab) {
        newActiveBt = ab;
        params.push(ab);
        activeBtSql = `, active_business_type = $${params.length}`;
      }
    }

    let debeResetearContadorPedidos = false;
    if (tipoDb != null && tipoDb !== prevTipoNorm) {
      debeResetearContadorPedidos = true;
    }
    if (newActiveBt && prevAb !== "" && newActiveBt !== prevAb) {
      debeResetearContadorPedidos = true;
    }
    let sqlBarrio = "";
    if (barrioIn !== undefined) {
      const bv = barrioIn === null || barrioIn === "" ? null : String(barrioIn).trim();
      params.push(bv);
      sqlBarrio = `, barrio = $${params.length}`;
    }

    const r = await query(
      `UPDATE clientes
       SET nombre = COALESCE($2, nombre),
           tipo = COALESCE($3, tipo),
           configuracion = COALESCE(configuracion, '{}'::jsonb) || $4::jsonb
           ${activeBtSql}
           ${sqlBarrio},
           fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING *`,
      params
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    const row = r.rows[0];
    if (debeResetearContadorPedidos) {
      try {
        await resetPedidoContadorPorTenant(tenantId);
      } catch (e) {
        console.warn("[clientes] reset pedido_contador tras cambio rubro/línea:", e?.message || e);
      }
    }
    let cfgMerged = row.configuracion;
    if (typeof cfgMerged === "string") {
      try {
        cfgMerged = JSON.parse(cfgMerged);
      } catch (_) {
        cfgMerged = {};
      }
    }
    const cM = cfgMerged && typeof cfgMerged === "object" ? cfgMerged : {};
    const la = cM.lat_base != null ? Number(cM.lat_base) : null;
    const lo = cM.lng_base != null ? Number(cM.lng_base) : null;
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      try {
        const z = cM.zoom_mapa != null ? Number(cM.zoom_mapa) : 13;
        await setUbicacionCentralInTable(tenantId, {
          lat: la,
          lng: lo,
          zoom: Number.isFinite(z) && z > 0 ? z : 13,
          nombre: row.nombre,
        });
      } catch (e) {
        console.warn("[clientes] sync ubicacion configuracion tabla", e?.message || e);
      }
    }
    return res.json({ ok: true, tenant_id: tenantId, cliente: row });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar configuración", detail: error.message });
  }
});

/**
 * Alta de tenant vacío (solo clave técnica). El wizard completa logo/ubicación con Finalizar.
 * Headers: X-GestorNova-Technician-Key o x-tech-key (alias).
 */
router.post("/nuevo", requireTechnicianTenantKey, async (req, res) => {
  try {
    const nombreRaw = String(req.body?.nombre || "").trim();
    const tipoRaw = String(req.body?.tipo || "").trim();
    if (nombreRaw.length < 2 || nombreRaw.length > 200) {
      return res.status(400).json({ error: "Nombre inválido (entre 2 y 200 caracteres)" });
    }
    if (!tipoRaw) {
      return res.status(400).json({ error: "tipo requerido" });
    }
    const tipoDb = normalizarRubroCliente(tipoRaw);
    if (!tipoDb) {
      return res.status(400).json({
        error: "Tipo de cliente no reconocido",
        detail: tipoRaw,
        tipos_sugeridos: ["municipio", "cooperativa_electrica", "cooperativa_agua"],
      });
    }
    const dupRow = await findClienteByNombreAndRubro(nombreRaw, tipoDb);
    const hasAbt = await tableHasColumn("clientes", "active_business_type");
    const abt = normalizeBusinessTypeInput(tipoDb) || rubroNormToBusinessType(tipoDb);
    const uCol = await usuariosTenantColumnName();
    const hasBt = await tableHasColumn("usuarios", "business_type");
    const hasTw = await tableHasColumn("usuarios", "telefono_whatsapp");
    const hasMustPw = await tableHasColumn("usuarios", "must_change_password");
    const telefonoOpt = String(req.body?.telefono || req.body?.whatsapp || "").trim() || null;
    const loginAdmin = normalizeLoginId(
      req.body?.nombre_usuario ?? req.body?.usuario_admin ?? req.body?.login_admin ?? ""
    );
    if (loginAdmin && (loginAdmin.length < 2 || loginAdmin.length > 120 || /\s/.test(loginAdmin))) {
      return res.status(400).json({
        error: "nombre_usuario inválido (2–120 caracteres, sin espacios)",
      });
    }
    const hasEsDefault = await tableHasColumn("usuarios", "es_usuario_default");

    if (dupRow) {
      const dupId = Number(dupRow.id);
      const setupIncompleto = isTenantSetupIncompleto(dupRow.configuracion);
      if (!setupIncompleto) {
        return res.status(409).json({
          error: "Ya existe un tenant con ese nombre y tipo de negocio",
          code: "tenant_nombre_tipo_duplicado",
          cliente_id: dupId,
          nombre_existente: String(dupRow.nombre || "").trim(),
          setup_completado: true,
        });
      }
      if (loginAdmin && (await loginExistsGlobally(loginAdmin))) {
        return res.status(409).json({
          error: "Ese nombre de usuario ya existe en el sistema",
          code: "login_duplicado",
        });
      }
      let admin_creado_reuse = null;
      if (uCol) {
        const rAdm = await query(
          `SELECT 1 FROM usuarios WHERE ${uCol} = $1 AND lower(rol) IN ('admin', 'administrador') LIMIT 1`,
          [dupId]
        );
        if (!rAdm.rows.length) {
          try {
            admin_creado_reuse = await withTransaction(async (client) =>
              crearUsuarioAdminBootstrap({
                client,
                col: uCol,
                hasBt,
                hasTw,
                tenantId: dupId,
                nombreTenant: String(dupRow.nombre || nombreRaw).trim(),
                telefono: telefonoOpt,
                hasMustChangePassword: hasMustPw,
                loginPreferido: loginAdmin,
                hasEsUsuarioDefault: hasEsDefault,
              })
            );
          } catch (error) {
            if (error?.code === "LOGIN_YA_EXISTE") {
              return res.status(409).json({
                error: "Ese nombre de usuario ya existe en el sistema",
                code: "login_duplicado",
              });
            }
            throw error;
          }
        }
      }
      return res.status(201).json({
        ok: true,
        reutilizado: true,
        setup_incompleto: true,
        cliente: {
          id: dupId,
          nombre: dupRow.nombre,
          tipo: dupRow.tipo || tipoDb,
          ...(hasAbt && dupRow.active_business_type != null
            ? { active_business_type: dupRow.active_business_type }
            : {}),
        },
        admin_creado: admin_creado_reuse,
        message:
          "Ya existía un tenant con ese nombre sin setup finalizado; se reutilizó para continuar el wizard.",
      });
    }

    if (loginAdmin && (await loginExistsGlobally(loginAdmin))) {
      return res.status(409).json({
        error: "Ese nombre de usuario ya existe en el sistema",
        code: "login_duplicado",
      });
    }

    const { row, admin_creado } = await withTransaction(async (client) => {
      let r;
      if (hasAbt) {
        r = await client.query(
          `INSERT INTO clientes (nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion, active_business_type)
           VALUES ($1, $2, 'basico', TRUE, '{}'::jsonb, NOW(), NOW(), $3)
           RETURNING id, nombre, tipo, active_business_type, activo`,
          [nombreRaw, tipoDb, abt]
        );
      } else {
        r = await client.query(
          `INSERT INTO clientes (nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion)
           VALUES ($1, $2, 'basico', TRUE, '{}'::jsonb, NOW(), NOW())
           RETURNING id, nombre, tipo, activo`,
          [nombreRaw, tipoDb]
        );
      }
      const row0 = r.rows[0];
      const tid = Number(row0.id);
      const admin_creado0 = await crearUsuarioAdminBootstrap({
        client,
        col: uCol,
        hasBt,
        hasTw,
        tenantId: tid,
        nombreTenant: nombreRaw,
        telefono: telefonoOpt,
        hasMustChangePassword: hasMustPw,
        loginPreferido: loginAdmin,
        hasEsUsuarioDefault: hasEsDefault,
      });
      return { row: row0, admin_creado: admin_creado0 };
    });

    return res.status(201).json({
      ok: true,
      cliente: {
        id: row.id,
        nombre: row.nombre,
        tipo: row.tipo,
        ...(hasAbt && row.active_business_type != null ? { active_business_type: row.active_business_type } : {}),
      },
      admin_creado,
    });
  } catch (error) {
    if (error?.code === "LOGIN_YA_EXISTE") {
      return res.status(409).json({ error: "Ese nombre de usuario ya existe en el sistema", code: "login_duplicado" });
    }
    console.error("[clientes/nuevo]", error);
    return res.status(500).json({ error: "No se pudo crear el tenant", detail: error.message });
  }
});

router.get("/tipos-reclamo", authWithTenantHost, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const rubro = rubroEfectivoParaTipos(req);
    return res.json({
      tenant_id: tenantId,
      tipo_cliente: rubro,
      tipos: tiposReclamoParaClienteTipo(rubro),
      legacy_tipos: TIPOS_RECLAMO_LEGACY,
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron obtener tipos de reclamo", detail: error.message });
  }
});

router.use(authWithTenantHost, adminOnly);

router.get("/", async (req, res) => {
  const r = await query("SELECT * FROM clientes WHERE id = $1 LIMIT 1", [req.tenantId]);
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  try {
    const secret = String(process.env.PLATFORM_TENANT_SIGNUP_SECRET || "").trim();
    const hdr = String(req.headers["x-platform-signup"] || "").trim();
    if (!secret || hdr !== secret) {
      return res.status(403).json({
        error: "Alta de nuevos tenants deshabilitada desde la API",
        hint: "Definí PLATFORM_TENANT_SIGNUP_SECRET y enviá X-Platform-Signup, o creá la fila en Neon.",
      });
    }
    const { nombre, tipo, plan = "basico", configuracion = {}, activo = true } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: "nombre y tipo requeridos" });
    const r = await query(
      `INSERT INTO clientes(nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion)
       VALUES($1,$2,$3,$4,$5::jsonb,NOW(),NOW()) RETURNING *`,
      [nombre, tipo, plan, !!activo, JSON.stringify(configuracion || {})]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo crear cliente", detail: error.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id !== Number(req.tenantId)) {
    return res.status(403).json({ error: "Solo podés modificar el tenant de tu sesión" });
  }
  const { nombre, tipo, plan, activo, configuracion } = req.body;
  const rPrev = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [id]);
  const prevTipoNorm = normalizarRubroCliente(rPrev.rows?.[0]?.tipo);
  const tipoNormNuevo = tipo != null && tipo !== undefined ? normalizarRubroCliente(tipo) : null;
  const r = await query(
    `UPDATE clientes
     SET nombre = COALESCE($2,nombre),
         tipo = COALESCE($3,tipo),
         plan = COALESCE($4,plan),
         activo = COALESCE($5,activo),
         configuracion = COALESCE($6::jsonb,configuracion),
         fecha_actualizacion = NOW()
     WHERE id = $1 RETURNING *`,
    [id, nombre ?? null, tipo ?? null, plan ?? null, activo ?? null, configuracion ? JSON.stringify(configuracion) : null]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
  if (tipoNormNuevo && tipoNormNuevo !== prevTipoNorm) {
    try {
      await resetPedidoContadorPorTenant(id);
    } catch (e) {
      console.warn("[clientes] reset pedido_contador PUT /:id:", e?.message || e);
    }
  }
  res.json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id !== Number(req.tenantId)) {
    return res.status(403).json({ error: "Solo podés dar de baja el tenant de tu sesión" });
  }
  await query("UPDATE clientes SET activo = FALSE, fecha_actualizacion = NOW() WHERE id = $1", [id]);
  res.json({ ok: true });
});

export default router;
