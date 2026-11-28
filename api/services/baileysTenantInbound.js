/**
 * Adaptador experimental socket -> bot. No se instala en server.js.
 * Solo acepta JID telefónico privado directo: no supone que un LID sea un teléfono.
 * El llamador debe proveer recordStop durable por tenant; si falla se detiene el socket.
 */
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { normalizeWhatsAppRecipientForMeta } from './metaWhatsapp.js';

export function createBaileysTenantInbound({manager,guardStore,queue,handleBot,buildPayload,extractText,isStop,recordStop,pauseTenant}={}){
 if(!manager || !guardStore || !queue || [manager.socketFor,manager.assertHeld,manager.stop,
  guardStore.recordInbound,queue.enqueue,handleBot,buildPayload,extractText,isStop,recordStop,pauseTenant].some(x=>typeof x!=='function'))
  throw Error('Dependencias de entrada Baileys incompletas');
 async function quarantine(tenantId,reason){
  let persisted=false;
  try{await pauseTenant({tenantId,reason});persisted=true;}catch(_){}
  // Aun si la DB está caída, invalidar inmediatamente el socket de este proceso.
  await manager.stop(tenantId);
  return persisted;
 }
 async function onInbound({tenantId,socket,message}){
  if(!Number.isSafeInteger(tenantId)||tenantId<1||tenantId>2147483647||!socket||manager.socketFor(tenantId)!==socket||message?.key?.fromMe)
   return {accepted:false,reason:'invalid_context'};
  const raw=String(message?.key?.remoteJid||'');
  const phoneJid=/^\d{8,22}(?::\d{1,3})?@s\.whatsapp\.net$/.test(raw);
  const lidJid=/^\d{8,22}(?::\d{1,3})?@lid$/.test(raw);
  if(!phoneJid&&!lidJid)return {accepted:false,reason:'unresolved_sender'};
  const jid=jidNormalizedUser(raw),sender=jid.split('@')[0];
  let text;
  try{text=extractText(message)}catch(_){return {accepted:false,reason:'invalid_message'}}
  if(typeof text!=='string'||text.length>10000)return {accepted:false,reason:'invalid_message'};
  text=text.trim();
  try{
   const stopRequested=isStop(text);
   try{await manager.assertHeld(tenantId)}catch(e){
    // Si no podemos registrar una baja, al menos detener la instancia local.
    if(stopRequested)await quarantine(tenantId,'stop_unverified');
    throw e;
   }
   if(manager.socketFor(tenantId)!==socket)return {accepted:false,reason:'socket_changed'};
   // Una baja no debe ser descartada por falta de timestamp, ID, spam o mute.
   if(stopRequested){
    // Sin teléfono verificable no se puede registrar una baja segura: cerrar.
    if(lidJid){const persisted=await quarantine(tenantId,'unresolved_stop');return {accepted:false,reason:persisted?'unresolved_stop':'pause_unavailable'};}
    try{await recordStop({tenantId,jid});}
    catch(_){const persisted=await quarantine(tenantId,'stop_unverified');return {accepted:false,reason:persisted?'stop_persistence_failed':'pause_unavailable'};}
    return {accepted:true,reason:'stop_recorded'};
   }
   if(!phoneJid||!/^\d{8,22}@s\.whatsapp\.net$/.test(jid))return {accepted:false,reason:'unresolved_sender'};
   const messageId=message?.key?.id;
   if(typeof messageId!=='string'||!messageId||messageId.length>512)return {accepted:false,reason:'invalid_message'};
   const timestamp=Number(message?.messageTimestamp)*1000;
   if(!Number.isFinite(timestamp)||timestamp<=0)return {accepted:false,reason:'invalid_message'};
   const inbound=await guardStore.recordInbound({tenantId,jid,messageId,text,messageTimestamp:timestamp});
   if(!inbound?.accepted)return {accepted:false,reason:inbound?.reason||'guard_denied'};
   if(!inbound.respond)return {accepted:true,reason:'suppressed'};
   const getSocket=()=>manager.socketFor(tenantId)===socket?socket:null;
   const enqueue=text=>queue.enqueue({tenantId,jid,text,getSocket,messageKey:message.key,automatic:true});
   if(inbound.storm){
    const result=await enqueue('Recibimos tu mensaje. Estamos atendiendo muchas consultas; intentá de nuevo más tarde.');
    return {accepted:true,reason:'storm',result};
   }
   const payload=await buildPayload({tenantId,socket,message,jid,senderDigits:sender});
   if(!getSocket())return {accepted:false,reason:'socket_changed'};
   const canonicalSender=normalizeWhatsAppRecipientForMeta(sender);
   const sendReply=({tenantId:replyTenant,toDigits,bodyText})=>{
    if(replyTenant!==tenantId || !/^\d{8,22}$/.test(String(toDigits||'')) ||
       normalizeWhatsAppRecipientForMeta(toDigits)!==canonicalSender)
     return Promise.resolve({ok:false,error:'recipient_context_mismatch'});
    return enqueue(bodyText);
   };
   await handleBot(payload,tenantId,{sendReply,senderDigits:sender});
   return {accepted:true,reason:'handled'};
  }catch(_){return {accepted:false,reason:'processing_unavailable'};}
 }
 return {onInbound};
}
