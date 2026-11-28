/** Pipeline de medios experimental; NO está conectado al servidor. */
import {extractMessageContent,normalizeMessageContent} from '@whiskeysockets/baileys';
import {buildTenantBotPayload} from './baileysTenantPayload.js';
import {fetchAuthenticatedTenantImage} from './baileysTenantMediaHttp.js';
import {sanitizeTenantImage} from './baileysTenantMediaSanitize.js';

/** Dependencias inyectables SOLO en el backend; nunca desde la entrada HTTP. */
export function createExperimentalSecureTenantPayload({fetchImage=fetchAuthenticatedTenantImage,sanitize=sanitizeTenantImage,maxActive=4}={}){
 if(typeof fetchImage!=='function'||typeof sanitize!=='function'||!Number.isSafeInteger(maxActive)||maxActive<1||maxActive>4)
  throw Error('Dependencias de medios inválidas');
 const tenants=new Set();let active=0;
 return args=>buildTenantBotPayload({...args,downloadImage:async message=>{
  const tenantId=args?.tenantId;
  if(!Number.isSafeInteger(tenantId)||tenantId<1)throw Error('Tenant inválido');
  if(tenants.has(tenantId)||active>=maxActive)throw Error('Descarga de imagen ocupada');
  const content=extractMessageContent(message?.message)||normalizeMessageContent(message?.message)||message?.message||{};
  if(!content.imageMessage)throw Error('Imagen no disponible');
  tenants.add(tenantId);active++;
  try{return await sanitize(await fetchImage(content.imageMessage));}
  finally{active--;tenants.delete(tenantId);}
 }});
}
