/**
 * Distancia en metros entre dos puntos WGS84 (Haversine).
 */
const R = 6371000;

export function distanciaMetrosHaversine(lat1, lng1, lat2, lng2) {
  const a1 = (Number(lat1) * Math.PI) / 180;
  const a2 = (Number(lat2) * Math.PI) / 180;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLng = ((Number(lng2) - Number(lng1)) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a1) * Math.cos(a2) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}
