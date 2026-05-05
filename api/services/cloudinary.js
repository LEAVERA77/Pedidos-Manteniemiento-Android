import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

export function cloudinaryConfigured() {
  return Boolean(cloudName && apiKey && apiSecret);
}

export async function uploadBase64Image(base64, folder = "pedidos-mg/pedidos") {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no configurado en variables de entorno");
  }
  const dataUri = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    transformation: [{ width: 1024, crop: "limit", quality: "auto:good", fetch_format: "auto" }],
  });
  return result.secure_url;
}

export async function uploadManyBase64(list = [], folder = "pedidos-mg/pedidos") {
  const urls = [];
  for (const item of list) {
    if (!item) continue;
    const url = await uploadBase64Image(item, folder);
    urls.push(url);
  }
  return urls;
}

/** Detecta MIME mínimo para armar data URI (WhatsApp / buffers binarios). */
export function bufferToImageDataUri(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let mime = "image/jpeg";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = "image/jpeg";
  else if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
  else if (b.length >= 12 && b.toString("ascii", 8, 12) === "WEBP") mime = "image/webp";
  return `data:${mime};base64,${b.toString("base64")}`;
}

/**
 * Misma optimización que `uploadBase64Image` (límite 1024, calidad auto).
 * Si falla (p. ej. formato raro), reintenta subida sin transformation.
 * @returns {{ secureUrl: string, usedFallback: boolean }}
 */
export async function uploadPedidoImageBufferWithFallback(buffer, folder = "pedidos-mg/pedidos") {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no configurado en variables de entorno");
  }
  const dataUri = bufferToImageDataUri(buffer);
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      transformation: [{ width: 1024, crop: "limit", quality: "auto:good", fetch_format: "auto" }],
    });
    return { secureUrl: result.secure_url, usedFallback: false };
  } catch (e) {
    console.warn("[cloudinary] uploadPedidoImageBuffer optimizado falló, reintento sin transformation", e?.message || e);
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
    });
    return { secureUrl: result.secure_url, usedFallback: true };
  }
}

/** Extrae public_id desde una secure_url típica de imagen subida (sin transformation en path). */
export function cloudinaryPublicIdFromSecureUrl(secureUrl) {
  const u = String(secureUrl || "").trim();
  if (!u.includes("res.cloudinary.com")) return null;
  const m = u.match(/\/upload\/(?:v\d+\/)?([^?]+)$/);
  if (!m) return null;
  let path = m[1];
  path = path.replace(/\.(jpg|jpeg|png|gif|webp|bmp)$/i, "");
  return path || null;
}

/** Elimina asset en Cloudinary si la URL es reconocible; ignora errores (no bloquea flujo). */
export async function destroyCloudinaryImageBySecureUrl(secureUrl) {
  if (!cloudinaryConfigured()) return { ok: false, skipped: true };
  const publicId = cloudinaryPublicIdFromSecureUrl(secureUrl);
  if (!publicId) return { ok: false, skipped: true };
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    return { ok: true, publicId };
  } catch (e) {
    console.warn("[cloudinary] destroy falló", publicId, e?.message || e);
    return { ok: false, publicId, error: String(e?.message || e) };
  }
}

