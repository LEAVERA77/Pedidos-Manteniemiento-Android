/**
 * Diagnóstico de despliegue (commit, heurísticas sobre código WA INSERT).
 * GET /api/debug/version — comparar con `git rev-parse HEAD` local / GitHub.
 * GET /api/debug/nominatim-test — probar geocodificación (desactivar con ALLOW_DEBUG_NOMINATIM=0).
 * GET /api/debug/nominatim-raw — fetch directo a Nominatim (diagnóstico rate limit / política).
 * GET /api/debug/pedido-last-coords — últimos pedidos WhatsApp con lat/lng (Neon).
 * GET /api/debug/pedido/:id/coords — una fila: lat/lng persistidos vs pin en geocode_log_whatsapp (diagnóstico mapa).
 * GET /api/debug/pedido-last-raw — mismo + columnas opcionales latitud/longitud si existen (diagnóstico esquema).
 * GET /api/debug/centro-calle-test — probar buscarCentroDeCalle (?calle=&localidad=&provincia=).
 * GET /api/debug/direccion-resolver-test — pipeline completo + Georef + corrección BD (?calle=&numero=&localidad=&provincia=&tenant_id=).
 * GET /api/debug/interpolacion-test — solo PASO 3e interpolación geometría Overpass (?calle=&localidad=&numero=&provincia=).
 *
 * Snippet de código: puede desactivarse en producción con ALLOW_DEBUG_VERSION=0.
 *
 * **Producción:** todo `/api/debug/*` responde 404 salvo `ALLOW_DEBUG_ENDPOINTS=true`.
 * Los flags `ALLOW_DEBUG_NOMINATIM`, `ALLOW_DEBUG_VERSION`, etc. siguen acotando rutas puntuales cuando el router está habilitado.
 * made by leavera77
 */
import express from "express";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { query } from "../db/neon.js";
import { buscarCentroDeCalle } from "../services/nominatimClient.js";
import { coordsValidasWgs84 } from "../services/whatsappGeolocalizacionGarantizada.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiRoot = join(__dirname, "..");
const botPath = join(apiRoot, "services", "pedidoWhatsappBot.js");
const geoPath = join(apiRoot, "services", "whatsappGeolocalizacionGarantizada.js");

function tryGit(cwd, cmd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function isDebugEndpointsEnabled() {
  if (process.env.NODE_ENV === "production") {
    return process.env.ALLOW_DEBUG_ENDPOINTS === "true";
  }
  return process.env.ALLOW_DEBUG_ENDPOINTS !== "false";
}

function requireDebugEndpointsEnabled(_req, res, next) {
  if (!isDebugEndpointsEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}

router.use(requireDebugEndpointsEnabled);

router.get("/version", (_req, res) => {
  const envCommit =
    process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || null;
  let commitHash = envCommit || "unknown";
  let commitDate = "unknown";
  if (!envCommit) {
    const h = tryGit(apiRoot, "git rev-parse HEAD");
    const d = tryGit(apiRoot, "git log -1 --format=%cd");
    if (h) commitHash = h;
    if (d) commitDate = d;
    if (commitHash === "unknown") {
      commitHash = "no_git_en_runtime_render_tipico";
    }
  } else {
    const d = tryGit(apiRoot, "git log -1 --format=%cd");
    if (d) commitDate = d;
  }

  const deployTime = process.env.DEPLOY_TIME || process.env.BUILD_TIME || "no_registrado";

  let hasForLoopBot = false;
  let hasForLoopGeo = false;
  let hasEnsure = false;
  let hasPreInsertCheck = false;
  let hasFinalize = false;
  let hasPreInsertStrict = false;
  let fragmentoCodigo = "";

  const allowSnippet =
    process.env.ALLOW_DEBUG_VERSION !== "0" &&
    (process.env.ALLOW_DEBUG_VERSION === "1" || process.env.NODE_ENV !== "production");

  if (existsSync(botPath)) {
    const content = readFileSync(botPath, "utf8");
    hasEnsure = content.includes("ensureWhatsappPedidoCoordsForDb");
    hasPreInsertCheck = content.includes("parLatLngPasaCheckWhatsappDb");
    hasFinalize = content.includes("finalizePedidoWaInsertCoordinates");
    hasForLoopBot =
      content.includes("for (let i = 0; i < cols.length; i++)") && content.includes('cols[i] === "lat"');
    const lines = content.split("\n");
    fragmentoCodigo = lines.slice(149, 220).join("\n");
    if (fragmentoCodigo.length > 6000) fragmentoCodigo = `${fragmentoCodigo.slice(0, 6000)}\n…(truncado)`;
  }

  if (existsSync(geoPath)) {
    const geo = readFileSync(geoPath, "utf8");
    hasForLoopGeo =
      geo.includes("for (let i = 0; i < cols.length; i++)") && geo.includes('cols[i] === "lat"');
    hasPreInsertStrict = geo.includes("preInsertWhatsappPedidoCoordsStrict");
  }

  const payload = {
    service: "GestorNova API",
    timestamp: new Date().toISOString(),
    commit: { hash: commitHash, date: commitDate },
    deploy_time: deployTime,
    env_git: envCommit,
    nominatim_env: {
      NOMINATIM_WHATSAPP_SEARCH_MODE: process.env.NOMINATIM_WHATSAPP_SEARCH_MODE ?? null,
      NOMINATIM_BASE_URL: process.env.NOMINATIM_BASE_URL ?? null,
      NOMINATIM_FETCH_TIMEOUT_MS: process.env.NOMINATIM_FETCH_TIMEOUT_MS ?? null,
      DEBUG_NOMINATIM: process.env.DEBUG_NOMINATIM ?? null,
      hint: "NOMINATIM_WHATSAPP_SEARCH_MODE debe ser free-form para el pipeline WhatsApp Simple-q.",
    },
    features: {
      for_loop_sync_pedido_bot: hasForLoopBot,
      for_loop_sync_geo_module: hasForLoopGeo,
      ensure_coords: hasEnsure,
      pre_insert_check_par: hasPreInsertCheck,
      finalize_pedido_wa_insert: hasFinalize,
      pre_insert_strict_barrier: hasPreInsertStrict,
    },
    node_version: process.version,
    environment: process.env.NODE_ENV || "unknown",
    hint: "Comparar commit.hash con GitHub main; si no coincide, Render puede estar en build viejo.",
  };

  if (allowSnippet) {
    payload.code_snippet_pedidoWhatsappBot_L150_220 = fragmentoCodigo;
  } else {
    payload.code_snippet_omitido =
      "Establecer ALLOW_DEBUG_VERSION=1 para incluir fragmento (solo si aceptás exponer código).";
  }

  res.json(payload);
});

/**
 * GET /api/debug/nominatim-test
 * - ?q=Sarmiento+202+Cerrito — búsqueda libre (smoke)
 * - ?calle=Sarmiento&numero=202&localidad=Cerrito&provincia=Entre+Ríos — mismo path que WhatsApp (geocodeDomicilioSimpleQArgentina)
 * Desactivar abuso: ALLOW_DEBUG_NOMINATIM=0
 */
router.get("/nominatim-test", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "nominatim_test_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  const qRaw = req.query.q != null ? String(req.query.q).trim() : "";
  const calle = req.query.calle != null ? String(req.query.calle).trim() : "";
  const numero = req.query.numero != null ? String(req.query.numero).trim() : "";
  const localidad = req.query.localidad != null ? String(req.query.localidad).trim() : "";
  const provincia =
    req.query.provincia != null
      ? String(req.query.provincia).trim()
      : req.query.state != null
        ? String(req.query.state).trim()
        : "";
  const postalRaw = req.query.postalCode ?? req.query.cp ?? "";
  const postal = String(postalRaw || "")
    .trim()
    .replace(/\D/g, "");

  const {
    geocodeDomicilioSimpleQArgentina,
    nominatimSearchFreeForm,
    geocodeAddressArgentina,
    pickFreeFormHitForWhatsapp,
  } = await import("../services/nominatimClient.js");

  const t0 = Date.now();
  try {
    let audit = null;
    let lat = null;
    let lng = null;
    let displayName = null;
    /** @type {{ omit_cc?: number, with_cc?: number } | null} */
    let qPathHits = null;

    if (qRaw.length >= 3) {
      const hitsOmit = await nominatimSearchFreeForm(qRaw, { limit: 8, omitCountryCodes: true, addressdetails: true });
      const hitsCc = await nominatimSearchFreeForm(qRaw, { limit: 8, omitCountryCodes: false, addressdetails: true });
      qPathHits = { omit_cc: hitsOmit.length, with_cc: hitsCc.length };
      const tryPick = (arr) => (arr.length ? pickFreeFormHitForWhatsapp(arr, {}) || arr[0] : null);
      let hit = tryPick(hitsOmit) || tryPick(hitsCc);
      if (hit) {
        lat = Number(hit.lat);
        lng = Number(hit.lon);
        displayName = String(hit.display_name || "").trim();
        audit = { source: "nominatimSearchFreeForm_q", q: qRaw };
      } else {
        const g = await geocodeAddressArgentina(qRaw, { nominatimLimit: 8, skipStateFilter: true });
        if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
          lat = g.lat;
          lng = g.lng;
          displayName = g.displayName;
          audit = { source: "geocodeAddressArgentina_q_fallback", q: qRaw };
        }
      }
    } else if (calle.length >= 2 && localidad.length >= 2) {
      const r = await geocodeDomicilioSimpleQArgentina({
        calle,
        numero,
        localidad,
        stateOrProvince: provincia,
        postalCode: postal.length >= 4 ? postal : "",
      });
      if (r && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
        lat = r.lat;
        lng = r.lng;
        displayName = r.displayName;
        audit = r.audit || { source: "geocodeDomicilioSimpleQArgentina" };
      }
    } else {
      return res.status(400).json({
        error: "parametros_invalidos",
        hint: "Usar ?q=texto (min 3 chars) o ?calle=&localidad= con opcional numero, provincia, postalCode",
      });
    }

    const ms = Date.now() - t0;
    const hitOk = Number.isFinite(lat) && Number.isFinite(lng);
    return res.json({
      success: true,
      ms,
      hit: hitOk,
      coordinates: hitOk ? { lat, lng } : null,
      display_name: displayName,
      audit,
      nominatim_hits_counts: qPathHits,
      hint:
        !hitOk && qPathHits && qPathHits.omit_cc === 0 && qPathHits.with_cc === 0
          ? "Nominatim devolvió 0 filas (429/rate limit, IP bloqueada o timeout). Probar GET /api/debug/nominatim-raw?q=… y NOMINATIM_BASE_URL propio."
          : !hitOk
            ? "Si nominatim-raw tiene resultados y esto no, revisar filtros pickFreeForm / pipeline."
            : null,
      search_mode: process.env.NOMINATIM_WHATSAPP_SEARCH_MODE ?? null,
      debug_nominatim: process.env.DEBUG_NOMINATIM ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      ms: Date.now() - t0,
      error: String(err?.message || err),
      search_mode: process.env.NOMINATIM_WHATSAPP_SEARCH_MODE ?? null,
    });
  }
});

/**
 * GET /api/debug/nominatim-raw?q=...&bare=1
 * Llamada HTTP mínima a /search (sin pick ni pipeline). bare=1 → User-Agent mínimo (comparar política OSM).
 */
router.get("/nominatim-raw", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({ error: "nominatim_raw_disabled" });
  }
  const q = req.query.q != null ? String(req.query.q).trim() : "";
  if (q.length < 1) {
    return res.status(400).json({ error: "q_required", hint: "?q=Sarmiento+202+Cerrito" });
  }
  const bare = req.query.bare === "1";
  const limit = req.query.limit != null ? String(req.query.limit) : "1";
  const { getNominatimBaseUrl, nominatimHeaders, nominatimFetchTimeoutMs } = await import("../services/nominatimClient.js");
  const base = getNominatimBaseUrl();
  const p = new URLSearchParams({ q, format: "json", limit, "accept-language": "es" });
  if (!bare) {
    const email = process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "";
    if (email) p.set("email", email);
  }
  const url = `${base}/search?${p.toString()}`;
  const t0 = Date.now();
  try {
    const headers = bare
      ? {
          Accept: "application/json",
          "User-Agent":
            "GestorNova-RawDiagnostic/1.0 (bare; +https://github.com/LEAVERA77/Pedidos-MG)",
        }
      : nominatimHeaders();
    const msTimeout = nominatimFetchTimeoutMs();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), msTimeout);
    let response;
    try {
      response = await fetch(url, { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }
    const text = await response.text();
    let data;
    let parseOk = false;
    try {
      data = JSON.parse(text);
      parseOk = true;
    } catch {
      data = { _raw_text: text.slice(0, 800) };
    }
    const arr = parseOk && Array.isArray(data) ? data : null;
    return res.json({
      ms: Date.now() - t0,
      http_status: response.status,
      retry_after: response.headers.get("retry-after") || null,
      nominatim_base: base,
      url_preview: url.length > 600 ? `${url.slice(0, 600)}…` : url,
      url_length: url.length,
      bare,
      headers_mode: bare ? "bare_user_agent_only" : "nominatimHeaders_user_agent_from",
      result_count: arr ? arr.length : null,
      first_result:
        arr && arr[0]
          ? {
              lat: arr[0].lat,
              lon: arr[0].lon,
              display_name: arr[0].display_name,
              importance: arr[0].importance,
            }
          : null,
      body_is_json_array: !!arr,
      note:
        "429 + Retry-After → rate limit OSM. 200 y result_count 0 → query o datos. Si raw tiene hits y nominatim-test no, fallo en pick/filtros.",
    });
  } catch (err) {
    return res.status(500).json({
      ms: Date.now() - t0,
      error: String(err?.message || err),
      code: err?.code || null,
      url_preview: url.slice(0, 400),
    });
  }
});

/**
 * GET /api/debug/nominatim-health — ping mínimo a la instancia configurada (search?q=test).
 */
router.get("/nominatim-health", async (_req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({ error: "nominatim_health_disabled" });
  }
  const {
    getNominatimBaseUrl,
    getNominatimPublicFallbackBaseUrl,
    nominatimHeaders,
    nominatimFetchTimeoutMs,
  } = await import("../services/nominatimClient.js");
  const base = getNominatimBaseUrl();
  const pub = getNominatimPublicFallbackBaseUrl();
  const hp = new URLSearchParams({ q: "Rosario Argentina", format: "json", limit: "1", "accept-language": "es" });
  const em = process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM || "";
  if (em) hp.set("email", em);
  const url = `${base}/search?${hp.toString()}`;
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), nominatimFetchTimeoutMs());
    let response;
    try {
      response = await fetch(url, { headers: nominatimHeaders(), signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }
    const ms = Date.now() - t0;
    let resultCount = null;
    if (response.ok) {
      try {
        const j = await response.json();
        resultCount = Array.isArray(j) ? j.length : null;
      } catch {
        resultCount = null;
      }
    }
    const healthy = response.ok && (resultCount == null || resultCount >= 0);
    return res.json({
      status: healthy ? "healthy" : "unhealthy",
      ms,
      http_status: response.status,
      nominatim_base: base,
      public_fallback_url: pub,
      result_count: resultCount,
      timeout_ms: nominatimFetchTimeoutMs(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      status: "error",
      ms: Date.now() - t0,
      error: String(err?.message || err),
      nominatim_base: base,
      public_fallback_url: pub,
    });
  }
});

/**
 * GET /api/debug/pedido-last-coords — últimos 5 pedidos con origen WhatsApp (lat/lng en columnas canónicas).
 * Desactivar abuso: ALLOW_DEBUG_NOMINATIM=0
 */
router.get("/pedido-last-coords", async (_req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "pedido_last_coords_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  try {
    const r = await query(
      `SELECT id, numero_pedido, lat, lng, origen_reclamo, fecha_creacion
       FROM pedidos
       WHERE origen_reclamo = 'whatsapp'
       ORDER BY fecha_creacion DESC NULLS LAST
       LIMIT 5`
    );
    return res.json({ rows: r.rows || [], count: r.rowCount ?? (r.rows || []).length });
  } catch (err) {
    return res.status(500).json({
      error: String(err?.message || err),
      code: err?.code || null,
    });
  }
});

/**
 * GET /api/debug/pedido/:id/coords — verificar persistencia de pin (lat/lng columnas vs log WA).
 */
router.get("/pedido/:id/coords", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "pedido_coords_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "id_invalido" });
  }
  try {
    const meta = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pedidos'`
    );
    const cn = new Set((meta.rows || []).map((r) => r.column_name));
    const fields = ["id", "numero_pedido", "lat", "lng", "origen_reclamo"];
    const orderDate = cn.has("fecha_creacion") ? "fecha_creacion" : cn.has("created_at") ? "created_at" : null;
    if (orderDate) fields.push(orderDate);
    if (cn.has("latitud")) fields.push("latitud");
    if (cn.has("longitud")) fields.push("longitud");
    if (cn.has("geocode_log_whatsapp")) fields.push("geocode_log_whatsapp");
    const r = await query(`SELECT ${fields.join(", ")} FROM pedidos WHERE id = $1 LIMIT 1`, [id]);
    const row = r.rows?.[0];
    if (!row) {
      return res.status(404).json({ error: "pedido_no_encontrado" });
    }
    const numLat = (v) => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    let la = numLat(row.lat);
    let ln = numLat(row.lng);
    if (la == null && row.latitud != null) la = numLat(row.latitud);
    if (ln == null && row.longitud != null) ln = numLat(row.longitud);
    let wLog = null;
    let wLat = null;
    let wLng = null;
    if (row.geocode_log_whatsapp != null) {
      try {
        wLog =
          typeof row.geocode_log_whatsapp === "object"
            ? row.geocode_log_whatsapp
            : JSON.parse(String(row.geocode_log_whatsapp));
        wLat = numLat(wLog?.lat);
        wLng = numLat(wLog?.lng);
      } catch {
        wLog = null;
      }
    }
    const hasPinCols = coordsValidasWgs84(la, ln);
    const hasPinWgeo =
      wLog &&
      (wLog.pin_ok === true || wLog.success === true) &&
      coordsValidasWgs84(wLat, wLng);
    return res.json({
      pedido: {
        id: row.id,
        numero_pedido: row.numero_pedido,
        origen_reclamo: row.origen_reclamo,
        lat: la,
        lng: ln,
        latitud: row.latitud ?? null,
        longitud: row.longitud ?? null,
        fecha: orderDate ? row[orderDate] ?? null : null,
      },
      geocode_log_whatsapp: wLog
        ? {
            pin_ok: wLog.pin_ok,
            success: wLog.success,
            lat: wLat,
            lng: wLng,
            fuente: wLog.fuente_final ?? wLog.fuente ?? null,
          }
        : null,
      has_pin_columnas: hasPinCols,
      has_pin_desde_log: hasPinWgeo,
      warning: hasPinCols
        ? "OK: lat/lng en columnas del pedido (mapa puede usar GET /api/pedidos/:id)."
        : hasPinWgeo
          ? "Parcial: hay pin en geocode_log_whatsapp pero columnas lat/lng vacías o inválidas — revisá INSERT/triggers."
          : "Sin pin útil: ni columnas ni log WA con coordenadas válidas.",
    });
  } catch (err) {
    return res.status(500).json({
      error: String(err?.message || err),
      code: err?.code || null,
    });
  }
});

/**
 * GET /api/debug/pedido-last-raw — últimos 5 pedidos WhatsApp; incluye `latitud`/`longitud` solo si existen en `pedidos`.
 * Desactivar abuso: ALLOW_DEBUG_NOMINATIM=0
 */
router.get("/pedido-last-raw", async (_req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "pedido_last_raw_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  try {
    const meta = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pedidos'`
    );
    const cn = new Set((meta.rows || []).map((r) => r.column_name));
    const fields = ["id", "numero_pedido", "lat", "lng"];
    if (cn.has("latitud")) fields.push("latitud");
    if (cn.has("longitud")) fields.push("longitud");
    fields.push("origen_reclamo");
    const orderCol = cn.has("fecha_creacion") ? "fecha_creacion" : cn.has("created_at") ? "created_at" : "id";
    const sql = `SELECT ${fields.join(", ")} FROM pedidos
       WHERE origen_reclamo = 'whatsapp'
       ORDER BY ${orderCol} DESC NULLS LAST
       LIMIT 5`;
    const r = await query(sql);
    return res.json({
      rows: r.rows || [],
      count: r.rowCount ?? (r.rows || []).length,
      hint:
        "Si lat/lng son NULL pero latitud/longitud tienen valores, puede haber desalineación de columnas o triggers.",
      columns_detected: {
        latitud: cn.has("latitud"),
        longitud: cn.has("longitud"),
        orden: orderCol,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: String(err?.message || err),
      code: err?.code || null,
    });
  }
});

/**
 * GET /api/debug/centro-calle-test?calle=…&localidad=…&provincia=… (provincia opcional)
 */
router.get("/centro-calle-test", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({ error: "centro_calle_test_disabled" });
  }
  const calle = req.query.calle != null ? String(req.query.calle).trim() : "";
  const localidad = req.query.localidad != null ? String(req.query.localidad).trim() : "";
  const provincia = req.query.provincia != null ? String(req.query.provincia).trim() : "";
  if (calle.length < 2 || localidad.length < 2) {
    return res.status(400).json({
      error: "Faltan parámetros: calle, localidad (provincia opcional)",
    });
  }
  try {
    const result = await buscarCentroDeCalle(calle, localidad, provincia);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

/**
 * GET /api/debug/direccion-resolver-test?calle=&numero=&localidad=&provincia=&tenant_id=1
 * Ejecuta el mismo pipeline que WhatsApp (Simple-q) y devuelve además Georef y fila de correcciones_direcciones.
 */
router.get("/direccion-resolver-test", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "direccion_resolver_test_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  const calle = req.query.calle != null ? String(req.query.calle).trim() : "";
  const numero = req.query.numero != null ? String(req.query.numero).trim() : "";
  const localidad = req.query.localidad != null ? String(req.query.localidad).trim() : "";
  const provincia = req.query.provincia != null ? String(req.query.provincia).trim() : "";
  const tenantId = Number(req.query.tenant_id ?? req.query.tenantId ?? "1");
  if (calle.length < 2 || localidad.length < 2) {
    return res.status(400).json({
      error: "calle_y_localidad_requeridos",
      ejemplo: "?calle=Avenida%20Argentina&numero=1162&localidad=Mar%C3%ADa%20Grande&provincia=Entre%20R%C3%ADos",
    });
  }
  try {
    const { ejecutarPipelineGeocodificacionDesdePedidoLike } = await import("../services/pipelineGeocodificacionPedido.js");
    const { geocodeDireccionGeorefAr } = await import("../services/georefClient.js");
    const { buscarCorreccionDireccionEnBd } = await import("../services/correccionesDirecciones.js");
    const log = [];
    const pedidoLike = {
      id: null,
      cliente_calle: calle,
      cliente_numero_puerta: numero || null,
      cliente_localidad: localidad,
      provincia: provincia || null,
      origen_reclamo: "whatsapp",
      lat: null,
      lng: null,
    };
    const [pipeline, georef, corr] = await Promise.all([
      ejecutarPipelineGeocodificacionDesdePedidoLike(pedidoLike, Number.isFinite(tenantId) ? tenantId : 1, {
        log,
        preferSimpleQNominatim: true,
      }),
      geocodeDireccionGeorefAr({
        calle,
        numero,
        localidad,
        provincia: provincia || "",
      }),
      buscarCorreccionDireccionEnBd({
        tenantId: Number.isFinite(tenantId) ? tenantId : 1,
        calle,
        numero,
        localidad,
        provincia: provincia || "",
      }),
    ]);
    return res.json({
      tenant_id: Number.isFinite(tenantId) ? tenantId : 1,
      pipeline_ok: pipeline.ok,
      lat: pipeline.ok ? pipeline.latFinal : null,
      lng: pipeline.ok ? pipeline.lngFinal : null,
      fuente: pipeline.ok ? pipeline.fuente : null,
      log_tail: (log || []).slice(-50),
      georef_directo: georef,
      correccion_bd_lookup: corr,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

/**
 * GET /api/debug/interpolacion-test?calle=&localidad=&numero=&provincia=
 */
router.get("/interpolacion-test", async (req, res) => {
  if (process.env.ALLOW_DEBUG_NOMINATIM === "0") {
    return res.status(403).json({
      error: "interpolacion_test_disabled",
      hint: "Quitar ALLOW_DEBUG_NOMINATIM=0 o no definirla para habilitar.",
    });
  }
  const calle = req.query.calle != null ? String(req.query.calle).trim() : "";
  const localidad = req.query.localidad != null ? String(req.query.localidad).trim() : "";
  const numeroRaw = req.query.numero != null ? String(req.query.numero).trim() : "";
  const provincia = req.query.provincia != null ? String(req.query.provincia).trim() : "";
  if (calle.length < 2 || localidad.length < 2 || !numeroRaw) {
    return res.status(400).json({
      error: "calle_localidad_numero_requeridos",
      ejemplo: "?calle=Avenida%20Argentina&localidad=Mar%C3%ADa%20Grande&numero=1162&provincia=Entre%20R%C3%ADos",
    });
  }
  try {
    const { interpolarPosicionEnCalle } = await import("../services/streetInterpolation.js");
    const resultado = await interpolarPosicionEnCalle(calle, localidad, numeroRaw, provincia);
    return res.json({
      direccion: `${calle} ${numeroRaw}, ${localidad}${provincia ? `, ${provincia}` : ""}`,
      resultado,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
