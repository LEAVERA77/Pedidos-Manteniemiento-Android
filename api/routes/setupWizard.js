import express from "express";
import bcrypt from "bcryptjs";
import { authWithTenantHost, adminOnly, signToken } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";
import {
  normalizeBusinessTypeInput,
  rubroNormToBusinessType,
  businessTypeToRubroParaTipos,
} from "../services/businessType.js";
import { normalizarRubroCliente } from "../services/tiposReclamo.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { tenantIdentityPairKey, normalizeCompanyNameKey } from "../utils/tenantIdentity.js";

const router = express.Router();

/** Clave en env + header `X-GestorNova-Technician-Key` (solo personal técnico; no va en el repo). */
function technicianTenantKeyOk(req) {
  const expected = String(process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY || "").trim();
  const got = String(req.headers["x-gestornova-technician-key"] || "").trim();
  return Boolean(expected && got === expected);
}

function requireTechnicianTenantKey(req, res, next) {
  if (!technicianTenantKeyOk(req)) {
    return res.status(403).json({ error: "Operación no permitida" });
  }
  return next();
}

router.get("/technician/tenants", ...authWithTenantHost, adminOnly, requireTechnicianTenantKey, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, nombre, tipo, COALESCE(activo, TRUE) AS activo
       FROM clientes
       ORDER BY id ASC
       LIMIT 500`
    );
    return res.json({ ok: true, clientes: r.rows || [] });
  } catch (e) {
    console.error("[setup/technician/tenants]", e);
    return res.status(500).json({ error: "No se pudo listar clientes", detail: e.message });
  }
});

router.post("/technician/attach-tenant", ...authWithTenantHost, adminOnly, requireTechnicianTenantKey, async (req, res) => {
  try {
    const tid = Number(req.body?.tenant_id);
    if (!Number.isFinite(tid) || tid < 1) {
      return res.status(400).json({ error: "tenant_id inválido" });
    }
    const rC = await query(`SELECT id, nombre FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
    if (!rC.rows.length) {
      return res.status(404).json({ error: "Cliente / tenant no encontrado" });
    }
    const uid = Number(req.user.id);
    const rEmail = await query(`SELECT lower(trim(coalesce(email,''))) AS e FROM usuarios WHERE id = $1 LIMIT 1`, [uid]);
    const em = String(rEmail.rows?.[0]?.e || "");
    if (!em) {
      return res.status(400).json({ error: "Tu usuario no tiene email; no se puede comprobar duplicados" });
    }
    const dup = await query(
      `SELECT id FROM usuarios
       WHERE tenant_id = $1 AND id <> $2 AND lower(trim(coalesce(email,''))) = $3
       LIMIT 1`,
      [tid, uid, em]
    );
    if (dup.rows.length) {
      return res.status(409).json({
        error: "Ya existe otro usuario con el mismo email en ese tenant",
        hint: "Cambiá el email de una de las cuentas o desactivá la duplicada en Neon.",
      });
    }
    const rUpd = await query(
      `UPDATE usuarios
       SET tenant_id = $1
       WHERE id = $2
         AND lower(trim(coalesce(rol,''))) IN ('admin','administrador')
       RETURNING id, tenant_id`,
      [tid, uid]
    );
    if (!rUpd.rows.length) {
      return res.status(403).json({ error: "No se actualizó el tenant (¿rol administrador?)" });
    }
    const token = signToken({
      userId: uid,
      rol: req.user.rol,
      tenant_id: tid,
    });
    return res.json({
      ok: true,
      tenant_id: tid,
      cliente: rC.rows[0],
      token,
      message: `Usuario vinculado al tenant ${tid} (${String(rC.rows[0].nombre || "").trim() || "sin nombre"}). Guardá el token en el cliente y recargá o cerrá sesión si hace falta.`,
    });
  } catch (e) {
    console.error("[setup/technician/attach-tenant]", e);
    return res.status(500).json({ error: "No se pudo vincular el tenant", detail: e.message });
  }
});

router.use(authWithTenantHost, adminOnly);

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

/** Claves en `clientes.configuracion` que enlazan el webhook Meta / envíos al tenant (ver metaTenantWhatsapp.js). */
const META_WA_CFG_KEYS = ["meta_phone_id", "meta_phone_number_id", "meta_access_token", "META_ACCESS_TOKEN"];

function extractMetaWhatsappConfigPatch(cfgRaw) {
  const o = parseConfiguracionDb(cfgRaw);
  const patch = {};
  for (const k of META_WA_CFG_KEYS) {
    const v = o[k];
    if (v != null && String(v).trim()) patch[k] = String(v).trim();
  }
  return patch;
}

/** Tabla o vista inexistente (Neon sin migración multitenant). */
function isMissingRelationError(e) {
  const c = String(e?.code || "");
  if (c === "42P01") return true;
  const m = String(e?.message || "").toLowerCase();
  return m.includes("does not exist") && (m.includes("relation") || m.includes("table"));
}

/**
 * ¿Existe la relación en public? (Fuera de transacción: dentro de BEGIN un fallo aborta el bloque
 * aunque se capture en Node — hay que no ejecutar SQL que pueda fallar por tabla ausente.)
 */
async function tableExistsInPublic(tableName) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [String(tableName)]
  );
  return r.rows.length > 0;
}

async function loadActiveBusinessTypeForTenant(tenantId) {
  try {
    const t = await query(`SELECT active_business_type FROM tenant_active_business WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    const v = String(t.rows?.[0]?.active_business_type || "").trim();
    if (v) return normalizeBusinessTypeInput(v);
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
  }
  if (await tableHasColumn("clientes", "active_business_type")) {
    const c = await query(`SELECT active_business_type, tipo FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    const row = c.rows?.[0];
    const ab = normalizeBusinessTypeInput(row?.active_business_type);
    if (ab) return ab;
    const rub = normalizarRubroCliente(row?.tipo);
    return rub ? rubroNormToBusinessType(rub) : null;
  }
  const c = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
  const rub = normalizarRubroCliente(c.rows?.[0]?.tipo);
  return rub ? rubroNormToBusinessType(rub) : null;
}

async function pairKeyForTenant(tenantId) {
  const r = await query(`SELECT nombre, configuracion FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
  if (!r.rows.length) return null;
  const nombre = String(r.rows[0].nombre || "");
  const cfg = parseConfiguracionDb(r.rows[0].configuracion);
  const btRaw = await loadActiveBusinessTypeForTenant(tenantId);
  const bt = btRaw || "electricidad";
  return { pairKey: tenantIdentityPairKey(nombre, bt), setupDone: !!cfg.setup_wizard_completado, nombre, businessType: bt };
}

/**
 * Si ya existe otro `clientes` con el mismo par (nombre normalizado + negocio activo), devuelve su id
 * (el menor id que coincida) para no crear un duplicado al rehacer el wizard.
 */
async function findExistingTenantIdForIdentityPair(pairTarget, excludeTenantId) {
  const ex = Number(excludeTenantId);
  let r;
  try {
    r = await query(`SELECT id FROM clientes WHERE COALESCE(activo, TRUE) ORDER BY id ASC`);
  } catch {
    r = await query(`SELECT id FROM clientes ORDER BY id ASC`);
  }
  for (const row of r.rows || []) {
    const tid = Number(row.id);
    if (!Number.isFinite(tid) || tid === ex) continue;
    let st;
    try {
      st = await pairKeyForTenant(tid);
    } catch {
      continue;
    }
    if (st && st.pairKey === pairTarget) return tid;
  }
  return null;
}

async function upsertTenantBusiness(client, tenantId, businessType, hasTable) {
  if (!hasTable) {
    console.warn("[setup/wizard] tenant_businesses: tabla ausente, se omite INSERT");
    return;
  }
  await client.query(
    `INSERT INTO tenant_businesses(tenant_id, business_type, active)
     VALUES($1,$2,TRUE)
     ON CONFLICT (tenant_id, business_type)
     DO UPDATE SET active = TRUE`,
    [tenantId, businessType]
  );
}

async function upsertActiveBusiness(client, tenantId, businessType, hasClientesAbt, hasTenantActiveTbl, hasAuditTbl) {
  let previousBusinessType = null;
  if (hasTenantActiveTbl) {
    const prev = await client.query(
      `SELECT active_business_type FROM tenant_active_business WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    previousBusinessType = String(prev.rows?.[0]?.active_business_type || "").trim() || null;
    await client.query(
      `INSERT INTO tenant_active_business(tenant_id, active_business_type, updated_at)
       VALUES($1,$2,NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET active_business_type = EXCLUDED.active_business_type,
                     updated_at = NOW()`,
      [tenantId, businessType]
    );
    if (hasAuditTbl) {
      await client.query(
        `INSERT INTO tenant_business_audit(
        tenant_id, previous_business_type, new_business_type, changed_by_user_id, source
      ) VALUES($1,$2,$3,$4,'wizard')`,
        [tenantId, previousBusinessType, businessType, null]
      );
    }
  }
  if (hasClientesAbt) {
    await client.query(`UPDATE clientes SET active_business_type = $2, fecha_actualizacion = NOW() WHERE id = $1`, [
      tenantId,
      businessType,
    ]);
  }
}

async function ensureGlobalAdminForTenant({ tenantId, adminEmail, adminPassword, fallbackUserId }) {
  if (!(await tableHasColumn("usuarios", "business_type"))) return;
  if (fallbackUserId) {
    await query(`UPDATE usuarios SET business_type = NULL WHERE id = $1 AND tenant_id = $2`, [fallbackUserId, tenantId]);
  }
  if (!adminEmail || !adminPassword) return;
  const r = await query(
    `SELECT id FROM usuarios
     WHERE tenant_id = $1 AND lower(email) = lower($2) AND (business_type IS NULL OR rol = 'admin')
     LIMIT 1`,
    [tenantId, adminEmail]
  );
  if (r.rows.length) return;
  const hash = await bcrypt.hash(String(adminPassword), 10);
  await query(
    `INSERT INTO usuarios(tenant_id, business_type, nombre, email, password_hash, rol, activo)
     VALUES($1,NULL,'Administrador',$2,$3,'admin',TRUE)`,
    [tenantId, adminEmail, hash]
  );
}

async function contarDatos(tenantId, businessType) {
  const tables = ["pedidos", "socios_catalogo", "usuarios"];
  let total = 0;
  for (const t of tables) {
    const hasTenant = await tableHasColumn(t, "tenant_id");
    if (!hasTenant) continue;
    const hasBt = await tableHasColumn(t, "business_type");
    const params = [tenantId];
    let where = "tenant_id = $1";
    if (hasBt && t !== "usuarios") {
      params.push(businessType);
      where += ` AND business_type = $${params.length}`;
    } else if (hasBt && t === "usuarios") {
      params.push(businessType);
      where += ` AND (business_type = $${params.length} OR rol = 'admin' OR business_type IS NULL)`;
    }
    const r = await query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE ${where}`, params);
    total += Number(r.rows?.[0]?.c || 0);
  }
  return total;
}

router.post("/wizard", async (req, res) => {
  try {
    const tenantIdOld = Number(req.tenantId);
    const tenantNombreRaw = String(req.body?.tenant_nombre || req.body?.nombre || "").trim();
    const businessType = normalizeBusinessTypeInput(req.body?.business_type || req.body?.tipo);
    if (!businessType) {
      return res.status(400).json({ error: "business_type inválido", permitidos: ["electricidad", "agua", "municipio"] });
    }

    const state = await pairKeyForTenant(tenantIdOld);
    if (!state) return res.status(404).json({ error: "Tenant no encontrado" });

    const nombreWizard = tenantNombreRaw || state.nombre;
    const pairNew = tenantIdentityPairKey(nombreWizard, businessType);
    const pairOld = tenantIdentityPairKey(state.nombre, state.businessType);

    const debeNuevaInstancia = state.setupDone && pairNew !== pairOld;

    const hasClientesAbt = await tableHasColumn("clientes", "active_business_type");
    const hasTenantBusinessesTbl = await tableExistsInPublic("tenant_businesses");
    const hasTenantActiveTbl = await tableExistsInPublic("tenant_active_business");
    const hasTenantAuditTbl = await tableExistsInPublic("tenant_business_audit");

    if (!debeNuevaInstancia) {
      let datosExistentes = false;
      if (hasTenantBusinessesTbl) {
        const rb = await query(
          `SELECT id FROM tenant_businesses WHERE tenant_id = $1 AND business_type = $2 LIMIT 1`,
          [tenantIdOld, businessType]
        );
        datosExistentes = !!rb.rows.length;
      }

      await withTransaction(async (client) => {
        await upsertTenantBusiness(client, tenantIdOld, businessType, hasTenantBusinessesTbl);
        await upsertActiveBusiness(
          client,
          tenantIdOld,
          businessType,
          hasClientesAbt,
          hasTenantActiveTbl,
          hasTenantAuditTbl
        );
      });

      await ensureGlobalAdminForTenant({
        tenantId: tenantIdOld,
        adminEmail: String(req.body?.admin_email || "").trim() || null,
        adminPassword: String(req.body?.admin_password || "").trim() || null,
        fallbackUserId: req.user?.id ?? null,
      });

      const total = await contarDatos(tenantIdOld, businessType);
      return res.json({
        ok: true,
        tenant_id: tenantIdOld,
        business_type: businessType,
        datos_existentes: datosExistentes,
        total_registros: total,
        nueva_instancia: false,
        message: datosExistentes
          ? `Bienvenido de nuevo. Se cargaron ${total} registros del negocio ${businessType}.`
          : `Nuevo negocio ${businessType} configurado para el tenant. Inicia desde cero.`,
      });
    }

    const rubroNuevo = businessTypeToRubroParaTipos(businessType);
    const nombreInsert = normalizeCompanyNameKey(nombreWizard) ? nombreWizard : `Organización ${Date.now()}`;

    const rOldCfg = await query(`SELECT configuracion FROM clientes WHERE id = $1 LIMIT 1`, [tenantIdOld]);
    const metaWaPatch = extractMetaWhatsappConfigPatch(rOldCfg.rows?.[0]?.configuracion);

    const existingTargetId = await findExistingTenantIdForIdentityPair(pairNew, tenantIdOld);
    if (existingTargetId != null && existingTargetId !== tenantIdOld) {
      await withTransaction(async (client) => {
        if (Object.keys(metaWaPatch).length) {
          await client.query(`UPDATE clientes SET configuracion = COALESCE(configuracion, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [
            existingTargetId,
            JSON.stringify(metaWaPatch),
          ]);
          const oldCfgAfter = { ...parseConfiguracionDb(rOldCfg.rows?.[0]?.configuracion) };
          for (const k of Object.keys(metaWaPatch)) delete oldCfgAfter[k];
          await client.query(`UPDATE clientes SET configuracion = $2::jsonb WHERE id = $1`, [tenantIdOld, JSON.stringify(oldCfgAfter)]);
        }

        await upsertTenantBusiness(client, existingTargetId, businessType, hasTenantBusinessesTbl);
        await upsertActiveBusiness(
          client,
          existingTargetId,
          businessType,
          hasClientesAbt,
          hasTenantActiveTbl,
          hasTenantAuditTbl
        );

        const uid = Number(req.user.id);
        const rUp = await client.query(
          `UPDATE usuarios SET tenant_id = $1
           WHERE id = $2 AND tenant_id = $3
             AND (lower(rol) = 'admin' OR lower(rol) = 'administrador')
           RETURNING id`,
          [existingTargetId, uid, tenantIdOld]
        );
        if (!rUp.rows.length) {
          throw new Error("solo_admin_puede_crear_instancia");
        }
      });

      await ensureGlobalAdminForTenant({
        tenantId: existingTargetId,
        adminEmail: String(req.body?.admin_email || "").trim() || null,
        adminPassword: String(req.body?.admin_password || "").trim() || null,
        fallbackUserId: req.user?.id ?? null,
      });

      const token = signToken({
        userId: req.user.id,
        rol: req.user.rol,
        tenant_id: existingTargetId,
      });

      const total = await contarDatos(existingTargetId, businessType);
      return res.json({
        ok: true,
        tenant_id: existingTargetId,
        tenant_id_anterior: tenantIdOld,
        tenant_recuperado: true,
        business_type: businessType,
        datos_existentes: total > 0,
        total_registros: total,
        nueva_instancia: false,
        require_logout_reload: true,
        token,
        message: `Ya existía un tenant con el mismo nombre y tipo de negocio (id ${existingTargetId}). Se reutilizó ese registro en lugar de crear uno nuevo. El cliente id ${tenantIdOld} puede quedar huérfano: revisá usuarios y borrálo en Neon si no lo necesitás.`,
      });
    }

    const result = await withTransaction(async (client) => {
      const rIns = hasClientesAbt
        ? await client.query(
            `INSERT INTO clientes (nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion, active_business_type)
             VALUES ($1,$2,'basico',TRUE,'{}'::jsonb,NOW(),NOW(),$3)
             RETURNING id`,
            [nombreInsert, rubroNuevo, businessType]
          )
        : await client.query(
            `INSERT INTO clientes (nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion)
             VALUES ($1,$2,'basico',TRUE,'{}'::jsonb,NOW(),NOW())
             RETURNING id`,
            [nombreInsert, rubroNuevo]
          );
      const newId = Number(rIns.rows[0].id);
      if (!Number.isFinite(newId)) throw new Error("insert_cliente");

      try {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('clientes', 'id'), (SELECT COALESCE(MAX(id), 1) FROM clientes))`
        );
      } catch (e) {
        console.warn("[setup/wizard] setval clientes_id_seq omitido", e?.message || e);
      }

      if (Object.keys(metaWaPatch).length) {
        await client.query(`UPDATE clientes SET configuracion = COALESCE(configuracion, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [
          newId,
          JSON.stringify(metaWaPatch),
        ]);
        const oldCfgAfter = { ...parseConfiguracionDb(rOldCfg.rows?.[0]?.configuracion) };
        for (const k of Object.keys(metaWaPatch)) delete oldCfgAfter[k];
        await client.query(`UPDATE clientes SET configuracion = $2::jsonb WHERE id = $1`, [tenantIdOld, JSON.stringify(oldCfgAfter)]);
      }

      await upsertTenantBusiness(client, newId, businessType, hasTenantBusinessesTbl);
      await upsertActiveBusiness(client, newId, businessType, hasClientesAbt, hasTenantActiveTbl, hasTenantAuditTbl);

      const uid = Number(req.user.id);
      const rUp = await client.query(
        `UPDATE usuarios SET tenant_id = $1
         WHERE id = $2 AND tenant_id = $3
           AND (lower(rol) = 'admin' OR lower(rol) = 'administrador')
         RETURNING id`,
        [newId, uid, tenantIdOld]
      );
      if (!rUp.rows.length) {
        throw new Error("solo_admin_puede_crear_instancia");
      }

      return { newId };
    });

    const newTenantId = result.newId;

    await ensureGlobalAdminForTenant({
      tenantId: newTenantId,
      adminEmail: String(req.body?.admin_email || "").trim() || null,
      adminPassword: String(req.body?.admin_password || "").trim() || null,
      fallbackUserId: req.user?.id ?? null,
    });

    const token = signToken({
      userId: req.user.id,
      rol: req.user.rol,
      tenant_id: newTenantId,
    });

    const total = await contarDatos(newTenantId, businessType);
    return res.json({
      ok: true,
      tenant_id: newTenantId,
      tenant_id_anterior: tenantIdOld,
      business_type: businessType,
      datos_existentes: false,
      total_registros: total,
      nueva_instancia: true,
      require_logout_reload: true,
      token,
      message:
        "Se creó una nueva instancia (nuevo tenant). Cerrá sesión en todos los dispositivos si hace falta; ya recibís un token para el nuevo tenant.",
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg === "solo_admin_puede_crear_instancia") {
      return res.status(403).json({
        error: "Solo el administrador autenticado en el tenant anterior puede crear una nueva instancia.",
      });
    }
    console.error("[setup/wizard]", e);
    return res.status(500).json({ error: "No se pudo completar setup wizard", detail: e.message });
  }
});

export default router;
