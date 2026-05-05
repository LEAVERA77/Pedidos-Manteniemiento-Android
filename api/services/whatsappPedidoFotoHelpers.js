import { downloadWhatsAppMediaById } from "./metaWhatsapp.js";
import {
  destroyCloudinaryImageBySecureUrl,
  uploadPedidoImageBufferWithFallback,
} from "./cloudinary.js";

/** IDs de botones Cloud API (reply). */
export const WA_PEDIDO_FOTO_BTN_GALERIA = "wa_pedido_foto_gal";
export const WA_PEDIDO_FOTO_BTN_CAMARA = "wa_pedido_foto_cam";
export const WA_PEDIDO_FOTO_BTN_OMITIR = "wa_pedido_foto_skip";

export async function whatsappPedidoSubirFotoDesdeMediaId(mediaId, accessToken) {
  const { buffer } = await downloadWhatsAppMediaById(mediaId, accessToken);
  return uploadPedidoImageBufferWithFallback(buffer);
}

export { destroyCloudinaryImageBySecureUrl };

// made by leavera77
