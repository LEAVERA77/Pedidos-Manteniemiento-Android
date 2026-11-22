import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import { query } from "../db/neon.js";

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS baileys_auth_state (
      session_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, key_id)
    )
  `);
  tableEnsured = true;
}

function parseStoredJson(rawJson) {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson, BufferJSON.reviver);
  } catch {
    return null;
  }
}

async function readData(sessionId, keyId) {
  await ensureTable();
  const res = await query(
    "SELECT data_json FROM baileys_auth_state WHERE session_id = $1 AND key_id = $2 LIMIT 1",
    [sessionId, keyId]
  );
  if (!res.rows || res.rows.length === 0) return null;
  return parseStoredJson(res.rows[0].data_json);
}

async function readManyData(sessionId, keyIds) {
  await ensureTable();
  if (!Array.isArray(keyIds) || keyIds.length === 0) return new Map();
  const uniqueKeys = [...new Set(keyIds)];
  const res = await query(
    "SELECT key_id, data_json FROM baileys_auth_state WHERE session_id = $1 AND key_id = ANY($2::text[])",
    [sessionId, uniqueKeys]
  );
  const out = new Map();
  for (const row of res.rows || []) {
    out.set(row.key_id, parseStoredJson(row.data_json));
  }
  return out;
}

async function writeData(sessionId, keyId, data) {
  await ensureTable();
  const serialized = JSON.stringify(data, BufferJSON.replacer);
  await query(
    `INSERT INTO baileys_auth_state (session_id, key_id, data_json, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (session_id, key_id)
     DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()`,
    [sessionId, keyId, serialized]
  );
}

async function writeAndDeleteBatch(sessionId, upsertMap, deleteSet) {
  await ensureTable();
  const ops = [];
  if (upsertMap.size > 0) {
    const keys = [];
    const vals = [];
    for (const [k, v] of upsertMap.entries()) {
      keys.push(k);
      vals.push(v);
    }
    ops.push(
      query(
        `INSERT INTO baileys_auth_state (session_id, key_id, data_json, updated_at)
         SELECT $1, k, v, NOW()
         FROM UNNEST($2::text[], $3::text[]) AS t(k, v)
         ON CONFLICT (session_id, key_id)
         DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()`,
        [sessionId, keys, vals]
      )
    );
  }
  if (deleteSet.size > 0) {
    ops.push(
      query(
        "DELETE FROM baileys_auth_state WHERE session_id = $1 AND key_id = ANY($2::text[])",
        [sessionId, [...deleteSet]]
      )
    );
  }
  if (ops.length > 0) {
    await Promise.all(ops);
  }
}

export async function clearPostgresAuthState(sessionId = "default") {
  await ensureTable();
  await query("DELETE FROM baileys_auth_state WHERE session_id = $1", [sessionId]);
}

export async function usePostgresAuthState(sessionId = "default") {
  const creds = (await readData(sessionId, "creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          if (!Array.isArray(ids) || ids.length === 0) return data;
          const keyIds = ids.map((id) => `${type}-${id}`);
          const found = await readManyData(sessionId, keyIds);
          for (const id of ids) {
            let value = found.get(`${type}-${id}`) ?? null;
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const upsertMap = new Map();
          const deleteSet = new Set();
          for (const category in data) {
            const bucket = data[category];
            if (!bucket || typeof bucket !== "object") continue;
            for (const id in bucket) {
              const value = bucket[id];
              const key = `${category}-${id}`;
              if (value) {
                upsertMap.set(key, JSON.stringify(value, BufferJSON.replacer));
                deleteSet.delete(key);
              } else {
                upsertMap.delete(key);
                deleteSet.add(key);
              }
            }
          }
          await writeAndDeleteBatch(sessionId, upsertMap, deleteSet);
        },
      },
    },
    saveCreds: async () => {
      await writeData(sessionId, "creds", creds);
    },
  };
}
