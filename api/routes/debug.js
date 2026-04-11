/**
 * Diagnóstico de despliegue (commit, heurísticas sobre código WA INSERT).
 * GET /api/debug/version — comparar con `git rev-parse HEAD` local / GitHub.
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

export default router;
