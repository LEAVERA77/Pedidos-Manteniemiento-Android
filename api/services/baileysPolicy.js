/**
 * Reservas combinadas para el futuro motor Baileys. No conecta ni activa el bot.
 * Ambos límites se confirman juntos; ante cualquier rechazo o error se revierten.
 * La confianza es resuelta por el servidor, jamás por parámetros del cliente.
 */
import {withTransaction} from '../db/neon.js';
import {reserveWarmupAttempt} from './baileysWarmup.js';

export function createBaileysPolicy({guard,resolveTrusted,transaction=withTransaction,warmup=reserveWarmupAttempt}={}) {
 if(!guard || typeof guard.checkAndReserve!=='function' || typeof resolveTrusted!=='function' ||
    typeof transaction!=='function' || typeof warmup!=='function') throw Error('Dependencias de política incompletas');
 class Denied extends Error {
  constructor(result){super('Reserva denegada');this.result=result;}
 }
 async function checkAndReserve({tenantId,jid,automatic=true}) {
  // Una falla en resolución de confianza debe impedir el envío, no elevar privilegios.
  const trusted=await resolveTrusted({tenantId,jid});
  if(typeof trusted!=='boolean')throw Error('No se pudo verificar la confianza');
  try {
   return await transaction(async db=>{
    const sameTransaction=fn=>fn(db);
    const limit=await guard.checkAndReserve({tenantId,jid,automatic,transaction:sameTransaction});
    if(!limit?.allowed)throw new Denied(limit || {allowed:false,error:'guard_unavailable'});
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
