/**
 * Diagnóstico de despliegue (commit, heurísticas sobre código WA INSERT).
 * GET /api/debug/version — comparar con `git rev-parse HEAD` local / GitHub.
 * GET /api/debug/nominatim-test — probar geocodificación (desactivar con ALLOW_DEBUG_NOMINATIM=0).
 *
 * Snippet de código: puede desactivarse en producción con ALLOW_DEBUG_VERSION=0.
 * made by leavera77
 */
import express from "express";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
  } = await import("../services/nominatimClient.js");

  const t0 = Date.now();
  try {
    let audit = null;
    let lat = null;
    let lng = null;
    let displayName = null;

    if (qRaw.length >= 3) {
      let hits = await nominatimSearchFreeForm(qRaw, { limit: 8, omitCountryCodes: true, addressdetails: true });
      let hit = hits[0] || null;
      if (!hit && qRaw.length >= 3) {
        hits = await nominatimSearchFreeForm(qRaw, { limit: 8, omitCountryCodes: false, addressdetails: true });
        hit = hits[0] || null;
      }
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

export default router;
