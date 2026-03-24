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

