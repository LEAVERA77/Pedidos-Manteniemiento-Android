/** Conversión experimental de mensaje privado del socket a formato del bot. */
import {randomBytes} from 'node:crypto';
import {extractMessageContent,normalizeMessageContent} from '@whiskeysockets/baileys';
import {storeBaileysMediaBuffer} from './baileysMediaStore.js';
const MAX_IMAGE=8*1024*1024;
function content(msg){return extractMessageContent(msg?.message)||normalizeMessageContent(msg?.message)||msg?.message||{};}
export function tenantInboundText(msg){
 const m=content(msg);
 const candidates=[m.conversation,m.extendedTextMessage?.text,m.buttonsResponseMessage?.selectedDisplayText,
  m.templateButtonReplyMessage?.selectedDisplayText,m.listResponseMessage?.title,m.interactiveResponseMessage?.body?.text,
  m.videoMessage?.caption,m.documentMessage?.caption,m.imageMessage?.caption];
 return candidates.find(x=>typeof x==='string')||'';
}
function imageMime(buffer){
 if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
 throw Error('Imagen no reconocida');
}
function checkMediaAddress(img){
 const path=img?.directPath;
 if(path!=null && (typeof path!=='string'||!/^\/(?!\/)[^\r\n\\]*$/.test(path)))throw Error('Ruta de medio inválida');
 if(img?.url){
  let url;try{url=new URL(img.url)}catch(_){throw Error('URL de medio inválida')}
  const h=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(h==='whatsapp.net'||h.endsWith('.whatsapp.net')||h==='fbcdn.net'||h.endsWith('.fbcdn.net')))
   throw Error('Origen de medio no autorizado');
 }else if(!path)throw Error('Falta referencia del medio');
}
/** NO habilitar descargas reales: Baileys de esta versión sigue redirects,
 * ignora signal y no verifica MAC/hash al descargar. El inyector solo sirve para
 * ensayos; el stream limitado por sí solo NO es transporte seguro. */
export async function downloadTenantImage(message,{download,timeoutMs=15000}={}){
 if(typeof download !== 'function') throw Error('Descarga de imagen deshabilitada: transporte no verificado');
 const img=content(message).imageMessage;if(!img)throw Error('No es una imagen');
 checkMediaAddress(img);
 const declared=Number(img.fileLength||0);if(!Number.isFinite(declared)||declared<0||declared>MAX_IMAGE)throw Error('Imagen demasiado grande');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let stream;
 try{
  stream=await download(message,'stream',{options:{signal:controller.signal}});
  const chunks=[];let size=0;
  for await(const chunk of stream){
   if(controller.signal.aborted)throw Error('Tiempo de descarga agotado');
   const b=Buffer.from(chunk);size+=b.length;
   if(size>MAX_IMAGE){controller.abort();throw Error('Imagen demasiado grande');}
   chunks.push(b);
  }
  if(controller.signal.aborted)throw Error('Tiempo de descarga agotado');
  const buffer=Buffer.concat(chunks,size);return {buffer,mimeType:imageMime(buffer)};
 }finally{clearTimeout(timer);stream?.destroy?.();}
}
export async function buildTenantBotPayload({tenantId,message,senderDigits,downloadImage=downloadTenantImage,store=storeBaileysMediaBuffer}){
 if(!Number.isSafeInteger(tenantId)||tenantId<1||!/^\d{8,22}$/.test(String(senderDigits||''))||
    typeof message?.key?.id!=='string'||!message.key.id||!Number.isFinite(Number(message.messageTimestamp)))throw Error('Mensaje tenant inválido');
 const m=content(message),text=tenantInboundText(message).trim(),location=m.locationMessage||m.liveLocationMessage;
 const base={from:senderDigits,id:message.key.id,timestamp:String(Number(message.messageTimestamp))};let metaMessage;
 if(location){
  const latitude=Number(location.degreesLatitude),longitude=Number(location.degreesLongitude);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Ubicación inválida');
  metaMessage={...base,type:'location',location:{latitude,longitude}};
 }else if(m.imageMessage){
  const {buffer,mimeType}=await downloadImage(message);
  if(!Buffer.isBuffer(buffer)||buffer.length===0||buffer.length>MAX_IMAGE||imageMime(buffer)!==mimeType)throw Error('Imagen inválida');
  const mediaId=`baileys-media:v2:${randomBytes(18).toString('hex')}`;
  store(mediaId,buffer,mimeType,{tenantId});
  metaMessage={...base,type:'image',image:{id:mediaId,mime_type:mimeType}};
 }else if(text){metaMessage={...base,type:'text',text:{body:text}};}
 else throw Error('Tipo de mensaje no soportado');
 return {object:'whatsapp_business_account',entry:[{id:'baileys-tenant',changes:[{field:'messages',value:{
  messaging_product:'whatsapp',metadata:{phone_number_id:'baileys-bot'},
  contacts:[{wa_id:senderDigits,profile:{name:String(message.pushName||'').slice(0,100)}}],messages:[metaMessage],
 }}]}]};
}
