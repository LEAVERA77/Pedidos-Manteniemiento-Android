/**
 * Cola y mensajes para derivación «Otros» → atención humana por WhatsApp (Meta).
 * Fuente de verdad en Neon; la sesión en memoria del bot solo referencia session_id.
 */

import { query } from "../db/neon.js";

let _tablesReady = false;

export async function ensureHumanChatTables() {
  if (_tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_human_chat_session (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      phone_canonical VARCHAR(40) NOT NULL,
      contact_name TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'queued',
      assigned_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_human_chat_message (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES whatsapp_human_chat_session(id) ON DELETE CASCADE,
      direction VARCHAR(10) NOT NULL,
      body TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_hcs_tenant_estado
    ON whatsapp_human_chat_session (tenant_id, estado)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_hcs_updated
    ON whatsapp_human_chat_session (tenant_id, updated_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_hcm_session
    ON whatsapp_human_chat_message (session_id, created_at)
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_human_chat_one_open_per_phone
    ON whatsapp_human_chat_session (tenant_id, phone_canonical)
    WHERE (estado IN ('queued', 'active'))
  `);
  _tablesReady = true;
}

/**
 * Obtiene o crea sesión abierta (queued|active) para teléfono+tenant.
 * @returns {Promise<{ id: number, isNew: boolean }>}
 */
/**
 * Sesión humana abierta (cola o activa) para un teléfono en el tenant.
 * @returns {Promise<{ id: number } | null>}
 */
export async function humanChatFindOpenSessionForPhone(tenantId, phoneCanonical) {
  await ensureHumanChatTables();
  const tid = Number(tenantId);
  const phone = String(phoneCanonical || "").replace(/\D/g, "");
  if (!Number.isFinite(tid) || tid < 1 || phone.length < 8) return null;
  const r = await query(
    `SELECT id FROM whatsapp_human_chat_session
     WHERE tenant_id = $1 AND phone_canonical = $2 AND estado IN ('queued', 'active')
     LIMIT 1`,
    [tid, phone]
  );
  const id = r.rows?.[0]?.id;
  return id != null ? { id: Number(id) } : null;
}

export async function humanChatOpenOrGetSession(tenantId, phoneCanonical, contactName) {
  await ensureHumanChatTables();
  const tid = Number(tenantId);
  const phone = String(phoneCanonical || "").replace(/\D/g, "");
  if (!Number.isFinite(tid) || tid < 1 || phone.length < 8) {
    throw new Error("invalid_tenant_or_phone");
  }
  const cn = contactName != null ? String(contactName).trim().slice(0, 200) : null;
  const ex = await query(
    `SELECT id FROM whatsapp_human_chat_session
     WHERE tenant_id = $1 AND phone_canonical = $2 AND estado IN ('queued', 'active')
     LIMIT 1`,
    [tid, phone]
  );
  if (ex.rows?.[0]) {
    const id = Number(ex.rows[0].id);
    await query(
      `UPDATE whatsapp_human_chat_session
       SET contact_name = COALESCE($2, contact_name), updated_at = NOW()
       WHERE id = $1`,
      [id, cn || null]
    );
    return { id, isNew: false };
  }
  const ins = await query(
    `INSERT INTO whatsapp_human_chat_session (tenant_id, phone_canonical, contact_name, estado)
     VALUES ($1, $2, $3, 'queued')
     RETURNING id`,
    [tid, phone, cn]
  );
  return { id: Number(ins.rows[0].id), isNew: true };
}

/**
 * @returns {Promise<{ position: number, totalOpen: number, otherActive: boolean, activeSessionId: number|null }>}
 */
export async function humanChatQueueSnapshot(tenantId, sessionId) {
  await ensureHumanChatTables();
  const tid = Number(tenantId);
  const sid = Number(sessionId);
  const list = await query(
    `SELECT id, estado FROM whatsapp_human_chat_session
     WHERE tenant_id = $1 AND estado IN ('queued', 'active')
     ORDER BY created_at ASC`,
    [tid]
  );
  const rows = list.rows || [];
  const idx = rows.findIndex((r) => Number(r.id) === sid);
  const position = idx >= 0 ? idx + 1 : rows.length;
  const otherActive = rows.some((r) => r.estado === "active" && Number(r.id) !== sid);
  const activeRow = rows.find((r) => r.estado === "active");
  return {
    position,
    totalOpen: rows.length,
    otherActive,
    activeSessionId: activeRow ? Number(activeRow.id) : null,
  };
}

export async function humanChatAppendInbound(sessionId, body) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  const b = String(body || "").trim().slice(0, 4000);
  if (!Number.isFinite(sid) || sid < 1 || !b) return;
  const open = await query(
    `SELECT 1 FROM whatsapp_human_chat_session WHERE id = $1 AND estado IN ('queued','active') LIMIT 1`,
    [sid]
  );
  if (!open.rows?.length) {
    const err = new Error("human_chat_session_closed");
    err.code = "HUMAN_CHAT_CLOSED";
    throw err;
  }
  await query(
    `INSERT INTO whatsapp_human_chat_message (session_id, direction, body) VALUES ($1, 'in', $2)`,
    [sid, b]
  );
  await query(
    `UPDATE whatsapp_human_chat_session SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [sid]
  );
}

export async function humanChatAppendOutbound(sessionId, body, meta = null) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  const b = String(body || "").trim().slice(0, 4000);
  if (!Number.isFinite(sid) || sid < 1 || !b) return;
  if (meta && typeof meta === "object") {
    await query(
      `INSERT INTO whatsapp_human_chat_message (session_id, direction, body, meta) VALUES ($1, 'out', $2, $3::jsonb)`,
      [sid, b, JSON.stringify(meta)]
    );
  } else {
    await query(
      `INSERT INTO whatsapp_human_chat_message (session_id, direction, body) VALUES ($1, 'out', $2)`,
      [sid, b]
    );
  }
  await query(
    `UPDATE whatsapp_human_chat_session SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [sid]
  );
}

export async function humanChatCloseBySessionId(sessionId) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  if (!Number.isFinite(sid) || sid < 1) return;
  await query(
    `UPDATE whatsapp_human_chat_session SET estado = 'closed', updated_at = NOW() WHERE id = $1 AND estado IN ('queued','active')`,
    [sid]
  );
}

export async function humanChatCloseOpenForPhone(tenantId, phoneCanonical) {
  await ensureHumanChatTables();
  const tid = Number(tenantId);
  const phone = String(phoneCanonical || "").replace(/\D/g, "");
  if (!Number.isFinite(tid) || tid < 1 || !phone) return;
  await query(
    `UPDATE whatsapp_human_chat_session SET estado = 'closed', updated_at = NOW()
     WHERE tenant_id = $1 AND phone_canonical = $2 AND estado IN ('queued','active')`,
    [tid, phone]
  );
}

export async function humanChatListOpenSessions(tenantId, updatedSince = null) {
  await ensureHumanChatTables();
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const params = [tid];
  let sql = `
    SELECT s.id, s.tenant_id, s.phone_canonical, s.contact_name, s.estado, s.assigned_user_id,
           s.created_at, s.updated_at, s.last_message_at,
           (SELECT COUNT(*)::int FROM whatsapp_human_chat_message m WHERE m.session_id = s.id) AS message_count
    FROM whatsapp_human_chat_session s
    WHERE s.tenant_id = $1 AND s.estado IN ('queued', 'active')`;
  if (updatedSince instanceof Date && !Number.isNaN(updatedSince.getTime())) {
    sql += ` AND s.updated_at > $2`;
    params.push(updatedSince.toISOString());
  }
  sql += ` ORDER BY s.updated_at DESC`;
  const r = await query(sql, params);
  return r.rows || [];
}

export async function humanChatGetSessionForTenant(sessionId, tenantId) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  const tid = Number(tenantId);
  const r = await query(
    `SELECT * FROM whatsapp_human_chat_session WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [sid, tid]
  );
  return r.rows?.[0] || null;
}

export async function humanChatGetMessages(sessionId, tenantId) {
  const s = await humanChatGetSessionForTenant(sessionId, tenantId);
  if (!s) return [];
  const r = await query(
    `SELECT id, direction, body, created_at FROM whatsapp_human_chat_message
     WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return r.rows || [];
}

/** Solo una sesión `active` por tenant: las demás activas pasan a `queued`. */
export async function humanChatActivateSession(sessionId, tenantId, userId) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;
  const row = await humanChatGetSessionForTenant(sid, tid);
  if (!row) {
    throw new Error("session_not_open");
  }
  // Desde el admin: reabrir sesión cerrada (p. ej. el cliente escribió "Hola" y el bot la cerraba por error).
  if (row.estado === "closed") {
    await query(
      `UPDATE whatsapp_human_chat_session SET estado = 'queued', assigned_user_id = NULL, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [sid, tid]
    );
  }
  const row2 = await humanChatGetSessionForTenant(sid, tid);
  if (!row2 || !["queued", "active"].includes(row2.estado)) {
    throw new Error("session_not_open");
  }
  await query(
    `UPDATE whatsapp_human_chat_session SET estado = 'queued', updated_at = NOW()
     WHERE tenant_id = $1 AND estado = 'active' AND id <> $2`,
    [tid, sid]
  );
  await query(
    `UPDATE whatsapp_human_chat_session
     SET estado = 'active', assigned_user_id = $2, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $3`,
    [sid, Number.isFinite(uid) && uid >= 1 ? uid : null, tid]
  );
  return humanChatGetSessionForTenant(sid, tid);
}

export async function humanChatCloseSessionAdmin(sessionId, tenantId) {
  await ensureHumanChatTables();
  const sid = Number(sessionId);
  const tid = Number(tenantId);
  await query(
    `UPDATE whatsapp_human_chat_session SET estado = 'closed', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND estado IN ('queued','active')`,
    [sid, tid]
  );
}
