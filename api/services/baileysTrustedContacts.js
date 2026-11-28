/** Contactos de confianza hashados por tenant. No autoriza envíos por sí solo. */
import {createHmac} from 'node:crypto';
import {rawQuery,withTransaction} from '../db/neon.js';
import {canonicalBaileysPhone} from './baileysTenantSafety.js';
function validTenant(id){if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw Error('Tenant inválido');}
export function createBaileysTrustedContacts({keyBase64=process.env.BAILEYS_GUARD_HASH_KEY,query=rawQuery,transaction=withTransaction}={}){
 if(typeof keyBase64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyBase64)||Buffer.from(keyBase64,'base64').toString('base64')!==keyBase64)
  throw Error('BAILEYS_GUARD_HASH_KEY debe ser base64 de 32 bytes');
 const key=Buffer.from(keyBase64,'base64');
 const contact=(tenantId,jid)=>{validTenant(tenantId);return createHmac('sha256',key).update(JSON.stringify(['baileys-trusted-v1',tenantId,canonicalBaileysPhone(jid)])).digest()};
 async function isTrusted({tenantId,jid,transaction:runTransaction}={}){
  const digest=contact(tenantId,jid);
  if(runTransaction){
   return runTransaction(async db=>{
    const r=await db.query('SELECT 1 FROM baileys_trusted_contacts WHERE tenant_id=$1 AND contact_hmac=$2 FOR SHARE',[tenantId,digest]);
    return r.rows.length>0;
   });
  }
  const r=await query('SELECT 1 FROM baileys_trusted_contacts WHERE tenant_id=$1 AND contact_hmac=$2',[tenantId,digest]);
  return r.rows.length>0;
 }
 // El controlador debe verificar el rol del usuario dentro de esta misma transacción.
 async function change({tenantId,jid,actorUserId,action,transaction:runTransaction=transaction}){
  const digest=contact(tenantId,jid);
  if(!Number.isSafeInteger(actorUserId)||actorUserId<1||!['add','remove'].includes(action))throw Error('Acción inválida');
  return runTransaction(async db=>{
   const result=action==='add'
    ?await db.query('INSERT INTO baileys_trusted_contacts(tenant_id,contact_hmac) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1',[tenantId,digest])
    :await db.query('DELETE FROM baileys_trusted_contacts WHERE tenant_id=$1 AND contact_hmac=$2 RETURNING 1',[tenantId,digest]);
   if(result.rows.length)await db.query('INSERT INTO baileys_trusted_contacts_audit(tenant_id,usuario_id,contact_hmac,action) VALUES($1,$2,$3,$4)',[tenantId,actorUserId,digest,action]);
   return {changed:result.rows.length>0,trusted:action==='add'};
  });
 }
 return {isTrusted,change};
}
