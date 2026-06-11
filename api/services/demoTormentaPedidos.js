/**
 * Demo: genera reclamos masivos simulando una tormenta (corte masivo).
 * Usa socios reales de socios_catalogo; pedidos marcados [DEMO-TORMENTA] en descripción.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, tableHasColumn } from "../utils/tenantScope.js";
import { sociosCatalogoWhereForApi } from "../utils/sociosCatalogScope.js";
import { allocarSiguienteNumeroPedido } from "./pedidoContador.js";

export const DEMO_TORMENTA_MARK = "[DEMO-TORMENTA]";

const TIPO_CORTE = "Corte de Energía";
const TIPOS_SUELTOS = [
  "Cables Caídos/Peligro",
  "Problemas de Tensión",
  "Poste Inclinado/Dañado",
  "Riesgo en la vía pública",
  "Alumbrado Público (Mantenimiento)",
];

const DESCRIPCIONES_CORTE = [
  "Sin luz en toda la cuadra tras la tormenta de anoche.",
  "Se cortó la energía con el viento fuerte, sigue sin volver.",
  "Corte total desde la tormenta, heladera sin funcionar.",
  "Vecinos de la zona sin suministro desde el temporal.",
  "Se fue la luz con los rayos y no volvió más.",
];

const DESCRIPCIONES_SUELTAS = [
  "Cable cortado colgando sobre la vereda después del temporal.",
  "Poste inclinado por el viento, riesgo de caída.",
  "La tensión sube y baja desde la tormenta, se queman lamparitas.",
  "Rama grande sobre las líneas tras el viento fuerte.",
  "Luminaria de la esquina rota por la tormenta.",
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function txt(v) {
  return v != null ? String(v).trim() : "";
}

/** Con coordenadas válidas el reclamo se ve en el mapa del técnico. */
function tieneCoords(s) {
  const lat = Number(s?.latitud);
  const lng = Number(s?.longitud);
  return Number.isFinite(lat) && lat !== 0 && Number.isFinite(lng) && lng !== 0;
}

/** Mezcla aleatoria pero priorizando socios con coordenadas (sort estable). */
function shufflePreferCoords(arr) {
  return shuffle(arr).sort((a, b) => Number(tieneCoords(b)) - Number(tieneCoords(a)));
}

/**
 * Inserta un pedido demo. Las columnas opcionales se agregan según el esquema.
 */
async function insertarPedidoDemo({ numero, socio, tipo, descripcion, prioridad, usuarioId, tenantId, hasT, hasBt, hasOrigen, businessType }) {
  const s = socio;
  const lat = Number(s.latitud);
  const lng = Number(s.longitud);
  const direccion = [txt(s.calle), txt(s.numero)].filter(Boolean).join(" ");

  const cols = [
    "numero_pedido", "distribuidor", "trafo", "cliente", "tipo_trabajo", "descripcion",
    "prioridad", "lat", "lng", "usuario_id", "usuario_creador_id",
    "telefono_contacto", "cliente_nombre", "nis", "medidor",
    "cliente_calle", "cliente_numero_puerta", "cliente_localidad", "cliente_direccion", "barrio",
  ];
  const vals = [
    numero,
    txt(s.distribuidor_codigo) || null,
    txt(s.transformador) || null,
    txt(s.nombre) || null,
    tipo,
    descripcion,
    prioridad,
    Number.isFinite(lat) && lat !== 0 ? lat : null,
    Number.isFinite(lng) && lng !== 0 ? lng : null,
    usuarioId,
    usuarioId,
    txt(s.telefono) || null,
    txt(s.nombre) || null,
    txt(s.nis) || txt(s.nis_medidor) || null,
    txt(s.medidor) || null,
    txt(s.calle) || null,
    txt(s.numero) || null,
    txt(s.localidad) || null,
    direccion || null,
    txt(s.barrio) || null,
  ];
  if (hasT) {
    cols.push("tenant_id");
    vals.push(tenantId);
  }
  if (hasBt) {
    cols.push("business_type");
    vals.push(businessType);
  }
  const ph = vals.map((_, i) => `$${i + 1}`);

  cols.push("estado", "avance", "fecha_creacion");
  ph.push("'Pendiente'", "0", "NOW() - (random() * INTERVAL '8 hours')");
  if (hasOrigen) {
    cols.push("origen_reclamo");
    ph.push("'demo'");
  }

  await query(`INSERT INTO pedidos (${cols.join(", ")}) VALUES (${ph.join(", ")})`, vals);
}

/**
 * @param {import('express').Request} req
 * @param {{ total?: number }} [opts]
 */
export async function generarDemoTormenta(req, opts = {}) {
  const tenantId = req.tenantId;
  const usuarioId = req.user?.id || 1;
  const totalObjetivo = Math.max(20, Math.min(400, Number(opts.total) || 200));

  const { where, params } = await sociosCatalogoWhereForApi(req);
  const baseWhere = where || " WHERE TRUE";
  const r = await query(
    `SELECT id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, localidad,
            telefono, transformador, distribuidor_codigo, latitud, longitud
     FROM socios_catalogo${baseWhere}
       AND activo IS DISTINCT FROM FALSE
     LIMIT 6000`,
    params
  );
  const socios = (r.rows || []).filter((s) => txt(s.nombre));
  if (socios.length < 10) {
    return { ok: false, error: "Se necesitan al menos 10 socios activos en el padrón para la demo." };
  }

  const porTrafo = new Map();
  const porDist = new Map();
  for (const s of socios) {
    const tr = txt(s.transformador).toUpperCase();
    if (tr) {
      if (!porTrafo.has(tr)) porTrafo.set(tr, []);
      porTrafo.get(tr).push(s);
    }
    const dc = txt(s.distribuidor_codigo).toUpperCase();
    if (dc) {
      if (!porDist.has(dc)) porDist.set(dc, []);
      porDist.get(dc).push(s);
    }
  }

  /** Plan: ~70% agrupados por trafo, ~20% por distribuidor, resto sueltos */
  const plan = [];
  const cupoTrafos = Math.round(totalObjetivo * 0.7);
  const cupoDist = Math.round(totalObjetivo * 0.2);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  const trafosOrdenados = [...porTrafo.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  let usadosTrafo = 0;
  const trafosUsados = [];
  for (const [tr, list] of shuffle(trafosOrdenados.slice(0, 14))) {
    if (usadosTrafo >= cupoTrafos) break;
    const tomar = Math.min(list.length, 12 + Math.floor(Math.random() * 14), cupoTrafos - usadosTrafo);
    if (tomar < 3) continue;
    trafosUsados.push({ trafo: tr, reclamos: tomar });
    for (const s of shufflePreferCoords(list).slice(0, tomar)) {
      plan.push({ socio: s, tipo: TIPO_CORTE });
    }
    usadosTrafo += tomar;
  }

  const trafosSet = new Set(trafosUsados.map((x) => x.trafo));
  let usadosDist = 0;
  const distUsados = [];
  for (const [dc, list] of shuffle([...porDist.entries()].filter(([, l]) => l.length >= 4)).slice(0, 6)) {
    if (usadosDist >= cupoDist) break;
    const candidatos = list.filter((s) => !trafosSet.has(txt(s.transformador).toUpperCase()));
    const tomar = Math.min(candidatos.length, 8 + Math.floor(Math.random() * 8), cupoDist - usadosDist);
    if (tomar < 3) continue;
    distUsados.push({ distribuidor: dc, reclamos: tomar });
    for (const s of shufflePreferCoords(candidatos).slice(0, tomar)) {
      plan.push({ socio: s, tipo: TIPO_CORTE });
    }
    usadosDist += tomar;
  }

  const yaUsados = new Set(plan.map((p) => p.socio.id));
  // reverse: pop() saca primero los socios con coordenadas
  const restantes = shufflePreferCoords(socios.filter((s) => !yaUsados.has(s.id))).reverse();
  let sueltos = 0;
  while (plan.length < totalObjetivo && restantes.length) {
    const s = restantes.pop();
    plan.push({ socio: s, tipo: pick(TIPOS_SUELTOS), suelto: true });
    sueltos++;
  }

  const hasT = await pedidosTableHasTenantIdColumn();
  const hasBt = await tableHasColumn("pedidos", "business_type");
  const hasOrigen = await tableHasColumn("pedidos", "origen_reclamo");
  const businessType = req.activeBusinessType || "electricidad";

  let creados = 0;
  const errores = [];
  for (const item of shuffle(plan)) {
    try {
      const numero = await allocarSiguienteNumeroPedido(tenantId);
      const esCorte = item.tipo === TIPO_CORTE;
      const descripcion = `${DEMO_TORMENTA_MARK} ${esCorte ? pick(DESCRIPCIONES_CORTE) : pick(DESCRIPCIONES_SUELTAS)} (${stamp})`;
      await insertarPedidoDemo({
        numero,
        socio: item.socio,
        tipo: item.tipo,
        descripcion,
        prioridad: esCorte ? "Alta" : "Media",
        usuarioId,
        tenantId,
        hasT,
        hasBt,
        hasOrigen,
        businessType,
      });
      creados++;
    } catch (e) {
      errores.push(String(e?.message || e).slice(0, 200));
      if (errores.length > 5) break;
    }
  }

  return {
    ok: true,
    creados,
    objetivo: totalObjetivo,
    sueltos,
    trafos: trafosUsados,
    distribuidores: distUsados,
    errores: errores.slice(0, 5),
  };
}
