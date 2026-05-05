import { downloadWhatsAppMediaById } from "./metaWhatsapp.js";
import { downloadWhapiMediaBuffer } from "./whapiWhatsapp.js";
import {
  destroyCloudinaryImageBySecureUrl,
  uploadPedidoImageBufferWithFallback,
} from "./cloudinary.js";

/** IDs de botones Cloud API (reply). */
export const WA_PEDIDO_FOTO_BTN_GALERIA = "wa_pedido_foto_gal";
export const WA_PEDIDO_FOTO_BTN_CAMARA = "wa_pedido_foto_cam";
export const WA_PEDIDO_FOTO_BTN_OMITIR = "wa_pedido_foto_skip";

function whatsappProviderEnv() {
  return String(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase().trim();
}

/** IDs de medio Whapi (p. ej. jpeg-…-…) vs numéricos Meta Graph. */
function looksLikeWhapiMediaId(id) {
  const s = String(id || "");
  return /^(jpeg|jpg|png|webp|gif|image)-/i.test(s) || /^[a-z]{2,12}-[a-f0-9]{8,}-/i.test(s);
}

/**
 * @param {string} mediaId
 * @param {string} accessToken — Graph API (Meta); ignorado en Whapi / URL directa
 * @param {{ directUrl?: string }} [opts] — enlace público si Whapi tiene Auto Download
 */
export async function whatsappPedidoSubirFotoDesdeMediaId(mediaId, accessToken, opts = {}) {
  const directUrl = opts.directUrl ? String(opts.directUrl).trim() : "";
  const mid = mediaId ? String(mediaId).trim() : "";
  if (!directUrl && !mid) {
    throw new Error("missing_media_reference");
  }

  const prov = whatsappProviderEnv();
  let buffer;

  if (directUrl && /^https:\/\//i.test(directUrl)) {
    const r = await fetch(directUrl, { redirect: "follow" });
    if (!r.ok) throw new Error(`foto_direct_url_${r.status}`);
    buffer = Buffer.from(await r.arrayBuffer());
  } else if (prov === "whapi" || looksLikeWhapiMediaId(mid)) {
    const { buffer: b } = await downloadWhapiMediaBuffer(mid);
    buffer = b;
  } else {
    const tok = String(accessToken || "").trim();
    if (!tok) throw new Error("missing_meta_token_for_media");
    const { buffer: b } = await downloadWhatsAppMediaById(mid, tok);
    buffer = b;
  }

  return uploadPedidoImageBufferWithFallback(buffer);
}

export { destroyCloudinaryImageBySecureUrl };

// made by leavera77
