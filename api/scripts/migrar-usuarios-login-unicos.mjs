#!/usr/bin/env node
/**
 * Lista logins duplicados en usuarios.email (global) antes de aplicar usuarios_login_global_unique.sql
 * made by leavera77
 */
import { query } from "../db/neon.js";

async function main() {
  const r = await query(
    `SELECT lower(btrim(email)) AS login, array_agg(id ORDER BY id) AS ids, count(*)::int AS n
     FROM usuarios
     WHERE btrim(coalesce(email,'')) <> ''
     GROUP BY lower(btrim(email))
     HAVING count(*) > 1
     ORDER BY n DESC, login`
  );
  if (!r.rows.length) {
    console.log("OK: no hay logins duplicados.");
    return;
  }
  console.log("Duplicados (resolver manualmente antes de la migración UNIQUE global):");
  for (const row of r.rows) {
    console.log(`  ${row.login}: ids=${JSON.stringify(row.ids)} (${row.n})`);
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
