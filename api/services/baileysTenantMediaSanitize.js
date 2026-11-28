/** Validación/re-encoding experimental. No sustituye aislamiento de procesos. */
const MAX_BYTES=8*1024*1024, MAX_PIXELS=16_000_000, MAX_ACTIVE=4;
let active=0;
/**
 * Rechaza formatos y tamaños no esperados, decodifica, limita píxeles y
 * re-codifica a JPEG sin metadatos. Sharp es dependencia opcional aquí: si no
 * está instalada o falla, el medio se rechaza. No llamada desde el runtime.
 */
export async function sanitizeTenantImage(input){
 if(!Buffer.isBuffer(input)||input.length<1||input.length>MAX_BYTES)throw Error('Imagen demasiado grande o inválida');
 if(active>=MAX_ACTIVE)throw Error('Límite de procesamiento de imágenes');
 active++;
 try{
  let sharp;try{sharp=(await import('sharp')).default}catch(_){throw Error('Procesador de imágenes no disponible');}
  const options={limitInputPixels:MAX_PIXELS,failOn:'warning',sequentialRead:true};
  const info=await sharp(input,options).metadata();
  if(!['jpeg','png','webp'].includes(info.format)||!Number.isSafeInteger(info.width)||!Number.isSafeInteger(info.height)||
     info.width<1||info.height<1||info.width*info.height>MAX_PIXELS||(info.pages??1)!==1)
   throw Error('Formato o dimensiones de imagen no permitidos');
  const output=await sharp(input,options).rotate().jpeg({quality:85}).timeout({seconds:10}).toBuffer();
  if(output.length<3||output.length>MAX_BYTES||output[0]!==0xff||output[1]!==0xd8||output[2]!==0xff)
   throw Error('Imagen procesada inválida');
  return {buffer:output,mimeType:'image/jpeg'};
 }finally{active--;}
}
