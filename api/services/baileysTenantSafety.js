/** Bajas y cuarentena durables; la reactivación requiere validación externa de administrador. */
import {createHmac} from 'node:crypto';
import {rawQuery,withTransaction} from '../db/neon.js';

function validTenant(t){if(!Number.isSafeInteger(t)||t<1||t>2147483647)throw Error('Tenant inválido');}
export function canonicalBaileysPhone(jid){
 if(typeof jid!=='string'||!/^\d{8,22}@s\.whatsapp\.net$/.test(jid))throw Error('Teléfono no verificable');
 let digits=jid.split('@')[0];
 if(digits.startsWith('54')&&digits.length>=11&&digits.length<=13&&digits[2]!=='9')digits=`549${digits.slice(2)}`;
 return digits;
}
export function createBaileysTenantSafety({keyBase64=process.env.BAILEYS_GUARD_HASH_KEY,query=rawQuery,transaction=withTransaction}={}){
 if(typeof keyBase64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyBase64)||Buffer.from(keyBase64,'base64').toString('base64')!==keyBase64)
  throw Error('BAILEYS_GUARD_HASH_KEY debe ser base64 de 32 bytes');
 const key=Buffer.from(keyBase64,'base64');
 const contact=(tenantId,jid)=>{validTenant(tenantId);return createHmac('sha256',key).update(JSON.stringify(['baileys-optout-v1',tenantId,canonicalBaileysPhone(jid)])).digest()};
 async function lock(db,tenantId){
  validTenant(tenantId);
  // Orden común con la reserva de cuotas; evita intercalar la escritura del STOP.
  await db.query('INSERT INTO baileys_guard_limits(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
  await db.query('SELECT tenant_id FROM baileys_guard_limits WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
 }
 async function recordStop({tenantId,jid}){
  const digest=contact(tenantId,jid);
  return transaction(async db=>{
   await lock(db,tenantId);
   await db.query('INSERT INTO baileys_tenant_optout(tenant_id,contact_hmac) VALUES($1,$2) ON CONFLICT DO NOTHING',[tenantId,digest]);
  });
 }
 async function pauseTenant({tenantId,reason}){
  validTenant(tenantId);if(!['unresolved_stop','stop_unverified'].includes(reason))throw Error('Motivo de pausa inválido');
  return transaction(async db=>{
   await lock(db,tenantId);
   await db.query(`INSERT INTO baileys_tenant_safety(tenant_id,paused,reason,revision) VALUES($1,TRUE,$2,1)
    ON CONFLICT(tenant_id) DO UPDATE SET paused=TRUE,reason=EXCLUDED.reason,
     revision=baileys_tenant_safety.revision+1,updated_at=clock_timestamp()`,[tenantId,reason]);
  });
 }
 // El controlador debe revalidar rol y tenant DENTRO de la misma transacción.
 async function resumeTenant({tenantId,actorUserId,expectedReason,expectedRevision,transaction:runTransaction=transaction}){
  validTenant(tenantId);
  if(!Number.isSafeInteger(actorUserId)||actorUserId<1||!['unresolved_stop','stop_unverified'].includes(expectedReason)||typeof expectedRevision!=='string'||! /^(0|[1-9]\d{0,18})$/.test(expectedRevision))
   throw Error('Confirmación de revisión inválida');
  return runTransaction(async db=>{
   await lock(db,tenantId);
   const row=(await db.query('SELECT paused,reason,revision::text AS revision FROM baileys_tenant_safety WHERE tenant_id=$1 FOR UPDATE',[tenantId])).rows[0];
   if(!row?.paused)throw Object.assign(Error('No hay pausa de seguridad'),{code:'SAFETY_NOT_PAUSED'});
   if(row.reason!==expectedReason || row.revision!==expectedRevision)throw Object.assign(Error('La causa de la pausa cambió'),{code:'SAFETY_REASON_CHANGED'});
   await db.query('UPDATE baileys_tenant_safety SET paused=FALSE,reason=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1',[tenantId]);
   await db.query("INSERT INTO baileys_tenant_safety_audit(tenant_id,usuario_id,action,previous_reason) VALUES($1,$2,'resume',$3)",[tenantId,actorUserId,expectedReason]);
   return {paused:false};
  });
 }
 async function checkForSend({tenantId,jid,transaction:runTransaction=transaction}){
  const digest=contact(tenantId,jid);
  return runTransaction(async db=>{
   await lock(db,tenantId);
   const r=await db.query(`SELECT
    EXISTS(SELECT 1 FROM baileys_tenant_safety WHERE tenant_id=$1 AND paused) AS paused,
    EXISTS(SELECT 1 FROM baileys_tenant_optout WHERE tenant_id=$1 AND contact_hmac=$2) AS opted_out`,[tenantId,digest]);
   if(r.rows[0]?.paused)return {allowed:false,error:'tenant_safety_paused'};
   if(r.rows[0]?.opted_out)return {allowed:false,error:'contact_opted_out'};
   if(!r.rows[0])throw Error('No se pudo verificar la baja');
   return {allowed:true};
  });
 }
 async function status(tenantId,{query:runQuery=query}={}){
  validTenant(tenantId);
  const r=await runQuery('SELECT paused,reason,revision::text AS revision,updated_at FROM baileys_tenant_safety WHERE tenant_id=$1',[tenantId]);
  return r.rows[0]||{paused:false,reason:null,revision:null,updated_at:null};
 }
 return {recordStop,pauseTenant,resumeTenant,checkForSend,status};
}
