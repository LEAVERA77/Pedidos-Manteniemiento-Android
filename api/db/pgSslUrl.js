/**
 * Normaliza URLs PostgreSQL (Neon / Render) que traen `sslmode=require|prefer|verify-ca`
 * sin `uselibpqcompat`, evitando el SECURITY WARNING de `pg-connection-string` v2.x
 * y manteniendo la semántica libpq (`rejectUnauthorized: false` cuando no hay `sslrootcert`).
 */
export function normalizePgConnectionString(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const sslmode = (u.searchParams.get("sslmode") || "").trim().toLowerCase();
    const hasCompat = u.searchParams.has("uselibpqcompat");
    const hasRootCert = u.searchParams.has("sslrootcert");
    if (
      !hasCompat &&
      !hasRootCert &&
      (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca")
    ) {
      u.searchParams.set("uselibpqcompat", "true");
      return u.toString();
    }
  } catch {
    // Si no es una URL estándar, devolver sin cambios.
  }
  return s;
}
