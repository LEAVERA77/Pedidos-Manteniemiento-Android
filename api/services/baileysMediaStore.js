/** Almacenes efímeros de imágenes entrantes. El legacy no queda ligado a tenant. */
const inboundMediaBuffers = new Map();
const tenantMediaBuffers = new Map();
const MEDIA_BUFFER_TTL_MS = 5 * 60 * 1000;
const MAX_MEDIA_BUFFERS = 50;
const TENANT_MAX_ENTRIES = 4;
const TENANT_MAX_BYTES = 16 * 1024 * 1024;
const TOTAL_TENANT_MAX_ENTRIES = 48;
const TOTAL_TENANT_MAX_BYTES = 48 * 1024 * 1024;

function pruneLegacy() {
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
function deleteTenant(key) {
  const entry=tenantMediaBuffers.get(key);
  if(!entry)return;
  clearTimeout(entry.timer);
  tenantMediaBuffers.delete(key);
}
function pruneTenants() {
  const now=Date.now();
  for(const [key,entry] of tenantMediaBuffers)if(entry.expiresAt<=now)deleteTenant(key);
}
export function storeBaileysMediaBuffer(mediaId, buffer, mimeType = "image/jpeg", { tenantId = null } = {}) {
  if (!mediaId || !Buffer.isBuffer(buffer) || buffer.length === 0) return;
  const key=String(mediaId);
  const isV2=key.startsWith("baileys-media:v2:");
  if(isV2 && tenantId == null)throw new Error("Medio tenant sin entidad");
  if(tenantId != null){
    if(!isV2 || !Number.isSafeInteger(tenantId) || tenantId<1 || buffer.length>8*1024*1024)throw new Error("Medio tenant inválido");
    pruneTenants();
    if(tenantMediaBuffers.has(key))throw new Error("Identificador de medio duplicado");
    let total=0,tenantBytes=0,tenantCount=0;
    for(const entry of tenantMediaBuffers.values()){
      total+=entry.buffer.length;
      if(entry.tenantId===tenantId){tenantBytes+=entry.buffer.length;tenantCount++;}
    }
    if(tenantCount>=TENANT_MAX_ENTRIES || tenantBytes+buffer.length>TENANT_MAX_BYTES ||
       tenantMediaBuffers.size>=TOTAL_TENANT_MAX_ENTRIES || total+buffer.length>TOTAL_TENANT_MAX_BYTES)
      throw new Error("Cupo de medios agotado");
    const entry={buffer,mimeType,tenantId,expiresAt:Date.now()+MEDIA_BUFFER_TTL_MS,timer:null};
    entry.timer=setTimeout(()=>deleteTenant(key),MEDIA_BUFFER_TTL_MS);
    entry.timer.unref?.();
    tenantMediaBuffers.set(key,entry);
    return;
  }
  pruneLegacy();
  inboundMediaBuffers.set(key,{buffer,mimeType,tenantId:null,expiresAt:Date.now()+MEDIA_BUFFER_TTL_MS});
  pruneLegacy();
}

export function consumeBaileysMediaBuffer(mediaId, { tenantId = null } = {}) {
  const key=String(mediaId||"").trim();
  if(key.startsWith("baileys-media:v2:")){
    pruneTenants();
    const entry=tenantMediaBuffers.get(key);
    if(!entry || entry.tenantId!==tenantId)return null;
    deleteTenant(key);
    return {buffer:entry.buffer,mimeType:entry.mimeType,tenantId:entry.tenantId,expiresAt:entry.expiresAt};
  }
  pruneLegacy();
  const entry=inboundMediaBuffers.get(key);
  if(!entry)return null;
  inboundMediaBuffers.delete(key);
  return entry;
}
