/**
 * Reservas combinadas para el futuro motor Baileys. No conecta ni activa el bot.
 * Ambos límites se confirman juntos; ante cualquier rechazo o error se revierten.
 * La confianza es resuelta por el servidor, jamás por parámetros del cliente.
 */
import {withTransaction} from '../db/neon.js';
import {reserveWarmupAttempt} from './baileysWarmup.js';

export function createBaileysPolicy({guard,safety,resolveTrusted,transaction=withTransaction,warmup=reserveWarmupAttempt}={}) {
 if(!guard || typeof guard.checkAndReserve!=='function' || !safety || typeof safety.checkForSend!=='function' || typeof resolveTrusted!=='function' ||
    typeof transaction!=='function' || typeof warmup!=='function') throw Error('Dependencias de política incompletas');
 class Denied extends Error {
  constructor(result){super('Reserva denegada');this.result=result;}
 }
 async function checkAndReserve({tenantId,jid,automatic=true}) {
  try {
   return await transaction(async db=>{
    const sameTransaction=fn=>fn(db);
    const limit=await guard.checkAndReserve({tenantId,jid,automatic,transaction:sameTransaction});
    if(!limit?.allowed)throw new Denied(limit || {allowed:false,error:'guard_unavailable'});
    const safe=await safety.checkForSend({tenantId,jid,transaction:sameTransaction});
    if(!safe?.allowed)throw new Denied(safe || {allowed:false,error:'safety_unavailable'});
    // La baja de confianza no debe intercalarse con la reserva del warm-up.
    const trusted=await resolveTrusted({tenantId,jid,transaction:sameTransaction});
    if(typeof trusted!=='boolean')throw Error('No se pudo verificar la confianza');
    const ramp=await warmup(tenantId,{isTrusted:trusted,transaction:sameTransaction});
    if(!ramp?.allowed)throw new Denied(ramp || {allowed:false,error:'warmup_unavailable'});
    return {allowed:true,warmup:ramp};
   });
  } catch(e) {
   if(e instanceof Denied)return e.result;
   throw e;
  }
 }
 return {checkAndReserve};
}
