import { query } from "../db/neon.js";

/**
 * Sufijos de host donde el primer label del FQDN es el subdominio del tenant.
 * Ej: GESTORNOVA_TENANT_HOST_SUFFIXES=.gestornova.com,.gestornova.app
 */
function hostSuffixes() {
  return String(process.env.GESTORNOVA_TENANT_HOST_SUFFIXES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function extractSubdomain(hostname, suffixes) {
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (!h) return null;
  for (const suf of suffixes) {
    const s = suf.startsWith(".") ? suf.slice(1) : suf;
    if (!s) continue;
    if (h === s || h === `www.${s}`) return null;
    const needle = `.${s}`;
    if (h.endsWith(needle)) {
      const sub = h.slice(0, -needle.length).replace(/\.$/, "");
      const first = sub.split(".").filter(Boolean).pop();
      if (!first || first === "www") return null;
      return first;
    }
  }
  return null;
}

function hostnameCandidates(req) {
  const out = [];
  const push = (h) => {
    const v = String(h || "").trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  };
  const orig = req.get("Origin") || req.get("origin");
  if (orig) {
    try {
      push(new URL(orig).hostname);
    } catch (_) {}
  }
  const ref = req.get("Referer") || req.get("Referrer");
  if (ref) {
    try {
      push(new URL(ref).hostname);
    } catch (_) {}
  }
  const xh = req.get("X-Forwarded-Host") || req.get("X-GestorNova-Original-Host");
  push(xh);
  push(req.get("Host"));
  const subHdr = String(req.get("X-GestorNova-Subdomain") || "").trim().toLowerCase();
  if (subHdr) out.push(`__subdomain__:${subHdr}`);
  return out;
}

/**
 * Resuelve clientes.id a partir del slug en configuracion (subdominio o slug).
 */
export async function lookupClienteIdBySubdomainSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  const r = await query(
    `SELECT id FROM clientes
     WHERE activo = TRUE
       AND (
         LOWER(TRIM(configuracion->>'subdominio')) = $1
         OR LOWER(TRIM(configuracion->>'slug')) = $1
       )
     ORDER BY id ASC
     LIMIT 1`,
    [s]
  );
  const id = r.rows?.[0]?.id;
  return id != null && Number.isFinite(Number(id)) ? Number(id) : null;
}

/**
 * Intenta deducir el tenant (clientes.id) desde el request (Origin, Host, etc.).
 * Devuelve null si no aplica (p. ej. API en render.com sin subdominio configurado).
 */
export async function resolveTenantIdFromHostHeaders(req) {
  const suffixes = hostSuffixes();
  if (!suffixes.length) return null;

  for (const h of hostnameCandidates(req)) {
    let slug = null;
    if (h.startsWith("__subdomain__:")) {
      slug = h.slice("__subdomain__:".length).trim();
    } else {
      slug = extractSubdomain(h, suffixes);
    }
    if (!slug) continue;
    const tid = await lookupClienteIdBySubdomainSlug(slug);
    if (tid != null) return tid;
  }
  return null;
}

/**
 * Si ENFORCE_TENANT_HOST=true: el tenant deducido del host debe coincidir con req.tenantId (JWT).
 * Si no hay sufijos configurados o no se pudo deducir tenant desde el host, no bloquea (compat API única).
 */
export async function tenantHostMiddleware(req, res, next) {
  if (req.tenantId == null) {
    return res.status(401).json({ error: "Sesión sin tenant" });
  }
  const enforce = ["1", "true", "yes"].includes(String(process.env.ENFORCE_TENANT_HOST || "").toLowerCase());
  if (!enforce) return next();

  const suffixes = hostSuffixes();
  if (!suffixes.length) return next();

  try {
    const fromHost = await resolveTenantIdFromHostHeaders(req);
    if (fromHost == null) {
      const allow = String(process.env.TENANT_HOST_FALLBACK_ALLOW_HOSTS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const host = String(req.get("Host") || "")
        .toLowerCase()
        .split(":")[0];
      const okFallback = allow.some((pat) => host === pat || (pat.startsWith("*.") && host.endsWith(pat.slice(1))));
      if (okFallback) return next();
      return res.status(403).json({
        error: "No se pudo validar el tenant desde el host de la petición",
        hint: "Configurá subdominio en clientes.configuracion (subdominio o slug), Origin correcto, o TENANT_HOST_FALLBACK_ALLOW_HOSTS para el host de la API.",
      });
    }
    if (Number(fromHost) !== Number(req.tenantId)) {
      return res.status(403).json({ error: "El tenant del host no coincide con la sesión" });
    }
    return next();
  } catch (e) {
    console.error("[tenant-host]", e);
    return res.status(500).json({ error: "Error validando tenant por host" });
  }
}
