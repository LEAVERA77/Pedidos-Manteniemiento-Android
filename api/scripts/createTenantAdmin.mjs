/**
 * Crea un usuario administrador en un tenant (clientes.id).
 *
 * Uso (desde carpeta api, con .env o DATABASE_URL):
 *   node scripts/createTenantAdmin.mjs --tenant-id=1 --email=admin@miempresa.com --password=MiClaveSegura
 *
 * Opcional: --nombre="Administrador"
 *
 * made by leavera77
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { query, pool } from "../db/neon.js";
import { tableHasColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";

function parseArgs() {
  const out = { tenantId: null, email: "", password: "", nombre: "Administrador" };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--tenant-id=")) out.tenantId = Number(a.split("=")[1]);
    else if (a.startsWith("--email=")) out.email = String(a.split("=").slice(1).join("=")).trim();
    else if (a.startsWith("--password=")) out.password = String(a.split("=").slice(1).join("="));
    else if (a.startsWith("--nombre=")) out.nombre = String(a.split("=").slice(1).join("=")).trim() || "Administrador";
  }
  return out;
}

async function main() {
  const { tenantId, email, password, nombre } = parseArgs();
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    console.error("Falta o es inválido --tenant-id=N (ej. --tenant-id=1)");
    process.exit(1);
  }
  const loginTrim = email.trim().toLowerCase();
  if (!loginTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginTrim)) {
    console.error("Indicá un --email= válido (se usa como login en el panel).");
    process.exit(1);
  }
  const pwStr = String(password || "").trim();
  if (pwStr.length < 4) {
    console.error("La contraseña debe tener al menos 4 caracteres (--password=...).");
    process.exit(1);
  }

  const rC = await query(`SELECT id, nombre FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
  if (!rC.rows.length) {
    console.error(`No existe cliente/tenant con id=${tenantId} en clientes.`);
    process.exit(1);
  }

  const col = await usuariosTenantColumnName();
  if (!col) {
    console.error("La tabla usuarios no tiene tenant_id ni cliente_id.");
    process.exit(1);
  }

  const hasBt = await tableHasColumn("usuarios", "business_type");

  const dup = await query(
    `SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND ${col} = $2 LIMIT 1`,
    [loginTrim, tenantId]
  );
  if (dup.rows.length) {
    console.error(`Ya existe un usuario con ese email en el tenant ${tenantId} (id usuario ${dup.rows[0].id}).`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(pwStr, 10);
  const rol = "admin";

  let insSql;
  const insParams = [loginTrim, nombre, rol, hash, tenantId];
  if (hasBt) {
    insSql = `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type)
              VALUES ($1,$2,$3,$4,TRUE,$5,NULL)
              RETURNING id, email, nombre, rol, activo, ${col}::int AS tenant_id`;
  } else {
    insSql = `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col})
              VALUES ($1,$2,$3,$4,TRUE,$5)
              RETURNING id, email, nombre, rol, activo, ${col}::int AS tenant_id`;
  }
  const r = await query(insSql, insParams);
  const row = r.rows[0];

  console.log(JSON.stringify({ ok: true, tenant_id: tenantId, cliente: rC.rows[0], user: row }, null, 2));
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(() => pool.end());
