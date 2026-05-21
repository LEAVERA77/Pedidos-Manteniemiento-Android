/**
 * Inferencia y confirmación de domicilio desde GPS (reverse Nominatim).
 * made by leavera77
 */

/**
 * @param {import('./nominatimClient.js').reverseGeocodeArgentina extends Function ? Awaited<ReturnType<import('./nominatimClient.js').reverseGeocodeArgentina>> : any} rev
 * @param {number} lat
 * @param {number} lng
 * @param {(stateRaw: string) => string|null} mapProvincia
 */
export function construirInferenciaUbicacionDesdeReverse(rev, lat, lng, mapProvincia) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;

  const displayName = rev?.displayName ? String(rev.displayName).trim() : "";
  let ciudad = "";
  let calle = "";
  let numero = "0";
  let provincia = null;

  if (rev?.address && typeof rev.address === "object") {
    const a = rev.address;
    ciudad = String(
      a.city || a.town || a.village || a.municipality || a.city_district || a.county || a.state_district || ""
    ).trim();
    calle = String(a.road || a.pedestrian || a.path || a.footway || a.residential || a.street || "").trim();
    const hn = String(a.house_number || "").trim();
    if (hn.length) {
      const d = hn.replace(/\D/g, "").slice(0, 6);
      numero = d.length ? d : "0";
    }
    if (a.state && mapProvincia) {
      provincia = mapProvincia(String(a.state).trim());
    }
  }

  if (!calle.length && displayName.length >= 12) {
    const partes = displayName.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2 && !ciudad.length) {
      ciudad = partes[Math.min(1, partes.length - 1)] || partes[0];
    }
    if (!calle.length && partes[0] && partes[0].length >= 3) {
      calle = partes[0];
    }
  }

  if (!calle.length && ciudad.length >= 2) {
    calle = "Ubicación GPS";
  }

  return {
    lat: la,
    lng: lo,
    displayName,
    ciudad,
    calle,
    numero,
    provincia,
    barrio: rev?.barrio ? String(rev.barrio).trim() : null,
  };
}

/** @param {ReturnType<typeof construirInferenciaUbicacionDesdeReverse>} inf */
export function esInferenciaUbicacionSuficienteParaConfirmar(inf) {
  if (!inf) return false;
  const ciudad = String(inf.ciudad || "").trim();
  if (ciudad.length < 2) return false;
  const calle = String(inf.calle || "").trim();
  const dn = String(inf.displayName || "").trim();
  return calle.length >= 2 || dn.length >= 12;
}

/**
 * @param {ReturnType<typeof construirInferenciaUbicacionDesdeReverse>} inf
 */
export function msgConfirmarUbicacionGpsInferida(inf) {
  const esc = (s) => String(s || "").replace(/\*/g, "·");
  const lineas = [];
  if (inf.displayName) lineas.push(`📍 *${esc(inf.displayName)}*`);
  const det = [
    inf.provincia ? `Provincia: *${esc(inf.provincia)}*` : null,
    inf.ciudad ? `Localidad: *${esc(inf.ciudad)}*` : null,
    inf.calle && inf.calle !== "Ubicación GPS" ? `Calle: *${esc(inf.calle)}*` : null,
    inf.numero && inf.numero !== "0" ? `Número: *${esc(inf.numero)}*` : null,
  ].filter(Boolean);
  if (det.length) lineas.push(det.join("\n"));
  const cuerpo = lineas.length ? lineas.join("\n") : "📍 Ubicación inferida desde tu celular.";
  return (
    `${cuerpo}\n\n` +
    "¿Usamos *esta ubicación* para el reclamo en el mapa?\n\n" +
    "*1* — Sí, es correcta\n" +
    "*2* — No, cargar domicilio manualmente (provincia, ciudad, calle y número)\n\n" +
    "_Podés reenviar otra *ubicación GPS* si no coincide._"
  );
}

export const MSG_INTRO_DIRECCION_CON_GPS_RAPIDO =
  "Para ubicar el reclamo tenés dos caminos:\n\n" +
  "• *Rápido:* enviá *ubicación GPS* (📎 → *Ubicación*). Inferimos la dirección y te pedimos confirmar.\n" +
  "• *Manual:* elegí la *provincia* con un número del *1* al *24* (después ciudad, calle y número).\n\n";
