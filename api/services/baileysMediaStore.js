/**
 * Almacén efímero en memoria para buffers de imágenes entrantes descargadas vía Baileys (TTL 5 min).
 */
const inboundMediaBuffers = new Map();
const MEDIA_BUFFER_TTL_MS = 5 * 60 * 1000;
const MAX_MEDIA_BUFFERS = 50;

function pruneInboundMediaBuffers() {
  const now = Date.now();
  for (const [k, v] of inboundMediaBuffers.entries()) {
    if (!v || v.expiresAt <= now) inboundMediaBuffers.delete(k);
  }
  while (inboundMediaBuffers.size > MAX_MEDIA_BUFFERS) {
    const oldest = inboundMediaBuffers.keys().next().value;
    if (!oldest) break;
    inboundMediaBuffers.delete(oldest);
  }
}

export function storeBaileysMediaBuffer(mediaId, buffer, mimeType = "image/jpeg", { tenantId = null } = {}) {
  pruneInboundMediaBuffers();
  if (!mediaId || !Buffer.isBuffer(buffer) || buffer.length === 0) return;
  if (String(mediaId).startsWith("baileys-media:v2:") && tenantId == null) throw new Error("Medio tenant sin entidad");
  if (tenantId != null && (!Number.isSafeInteger(tenantId) || tenantId < 1 || buffer.length > 8 * 1024 * 1024)) throw new Error("Medio tenant inválido");
  inboundMediaBuffers.set(String(mediaId), {
    buffer,
    mimeType,
    tenantId,
    expiresAt: Date.now() + MEDIA_BUFFER_TTL_MS,
  });
  pruneInboundMediaBuffers();
}

export function consumeBaileysMediaBuffer(mediaId, { tenantId = null } = {}) {
  pruneInboundMediaBuffers();
  const key = String(mediaId || "").trim();
  const entry = inboundMediaBuffers.get(key);
  if (!entry) return null;
  // Medios v2 requieren el tenant que originó la entrada. Un intento de otro tenant no los consume.
  if (entry.tenantId != null && entry.tenantId !== tenantId) return null;
  inboundMediaBuffers.delete(key);
  return entry;
}
