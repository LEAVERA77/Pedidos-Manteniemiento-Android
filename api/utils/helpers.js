export function parsePeriod(period) {
  const p = String(period || "mes");
  if (p === "mes") return "NOW() - INTERVAL '1 month'";
  if (p === "3meses") return "NOW() - INTERVAL '3 months'";
  if (p === "anio") return "NOW() - INTERVAL '1 year'";
  return "TIMESTAMP '2000-01-01'";
}

export function normalizePhone(raw) {
  let t = String(raw || "").trim();
  if (!t) return "";
  t = t.replace(/[^\d+]/g, "");
  if (t.startsWith("00")) t = `+${t.slice(2)}`;
  if (!t.startsWith("+")) t = `+${t}`;
  return t;
}

export function parseFotosBase64(payload = {}) {
  if (Array.isArray(payload.fotos_base64)) {
    return payload.fotos_base64.filter(Boolean).map((x) => String(x).trim());
  }
  if (typeof payload.foto_base64 === "string" && payload.foto_base64.trim()) {
    return payload.foto_base64
      .split("||")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

export function toJoinedUrls(urls = []) {
  return urls.filter(Boolean).join("||");
}

export function splitUrls(raw = "") {
  return String(raw || "")
    .split("||")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function boolFrom(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  return ["1", "true", "si", "sí", "yes"].includes(String(value).toLowerCase());
}

