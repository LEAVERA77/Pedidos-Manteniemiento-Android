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

export function storeBaileysMediaBuffer(mediaId, buffer, mimeType = "image/jpeg") {
  pruneInboundMediaBuffers();
  if (!mediaId || !Buffer.isBuffer(buffer) || buffer.length === 0) return;
  inboundMediaBuffers.set(String(mediaId), {
    buffer,
    mimeType,
    expiresAt: Date.now() + MEDIA_BUFFER_TTL_MS,
  });
}

export function consumeBaileysMediaBuffer(mediaId) {
  pruneInboundMediaBuffers();
  const key = String(mediaId || "").trim();
  const entry = inboundMediaBuffers.get(key);
  if (!entry) return null;
  inboundMediaBuffers.delete(key);
  return entry;
}
