import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

/** Timeout HTTP subidas (ms). */
const CLOUDINARY_UPLOAD_TIMEOUT_MS = 30000;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    timeout: CLOUDINARY_UPLOAD_TIMEOUT_MS,
  });
}

/** Redimensiona solo si excede; calidad y formato en ingest (menos peso / créditos). */
const UPLOAD_TRANSFORMATION_PEDIDOS = [
  { width: 1600, height: 1600, crop: "limit", quality: "auto", fetch_format: "auto" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cloudinaryConfigured() {
  return Boolean(cloudName && apiKey && apiSecret);
}

function uploadOptions(folder, withTransformation) {
  const o = {
    folder,
    resource_type: "image",
  };
  if (withTransformation) {
    o.transformation = UPLOAD_TRANSFORMATION_PEDIDOS;
  }
  return o;
}

/**
 * Subida con 2 intentos optimizados (separados 2 s) y último recurso sin transformation.
 * @returns {{ secureUrl: string|null, usedFallback: boolean, error?: string }}
 */
async function uploadDataUriResilient(dataUri, folder = "pedidos-mg/pedidos") {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(dataUri, uploadOptions(folder, true));
      return { secureUrl: result.secure_url, usedFallback: false };
    } catch (e) {
      lastErr = e;
      console.warn(
        `[cloudinary] upload optimizado intento ${attempt + 1}/2`,
        folder,
        e?.message || e
      );
      if (attempt === 0) await sleep(2000);
    }
  }
  try {
    const result = await cloudinary.uploader.upload(dataUri, uploadOptions(folder, false));
    console.warn("[cloudinary] subida sin transformation (fallback tras reintentos)", lastErr?.message || lastErr);
    return { secureUrl: result.secure_url, usedFallback: true };
  } catch (e2) {
    console.warn("[cloudinary] subida fallida tras fallback", e2?.message || e2);
    return { secureUrl: null, usedFallback: false, error: String(e2?.message || e2) };
  }
}

export async function uploadBase64Image(base64, folder = "pedidos-mg/pedidos") {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no configurado en variables de entorno");
  }
  const dataUri = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  const { secureUrl, error } = await uploadDataUriResilient(dataUri, folder);
  if (!secureUrl) {
    throw new Error(error || "Cloudinary upload failed");
  }
  return secureUrl;
}

/**
 * Varias fotos: no corta el flujo si una falla (omite esa URL).
 * @param {string[]} list
 * @param {string} [folder]
 * @returns {Promise<string[]>}
 */
export async function uploadManyBase64(list = [], folder = "pedidos-mg/pedidos") {
  const items = (list || []).filter(Boolean);
  if (!items.length) return [];
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no configurado en variables de entorno");
  }
  const urls = [];
  for (const item of items) {
    try {
      const url = await uploadBase64Image(item, folder);
      urls.push(url);
    } catch (e) {
      console.warn("[cloudinary] uploadManyBase64 omitió una imagen", e?.message || e);
    }
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
 * WhatsApp / buffers: misma cadena optimizada + reintentos que uploadBase64Image.
 * @returns {{ secureUrl: string|null, usedFallback: boolean, error?: string }}
 */
export async function uploadPedidoImageBufferWithFallback(buffer, folder = "pedidos-mg/pedidos") {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no configurado en variables de entorno");
  }
  const dataUri = bufferToImageDataUri(buffer);
  return uploadDataUriResilient(dataUri, folder);
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
