/**
 * Importación supervisada y transaccional del estado legado a un solo tenant.
 * NO inicia sockets ni modifica/elimina el origen. El operador debe haber detenido
 * TODOS los procesos que usan la sesión global y conservar un respaldo protegido.
 * Este servicio aún no está conectado a un endpoint ni a un comando de producción.
 */
import { BufferJSON, jidNormalizedUser, proto } from '@whiskeysockets/baileys';
import { withTransaction } from '../db/neon.js';
import { acquireBaileysTenantLease } from './baileysTenantLease.js';
import { usePostgresTenantAuthState } from './baileysTenantAuthPostgres.js';

// La representación legada concatena categoría-id sin escapar. Lista ligada a
// la versión instalada de Baileys; categorías desconocidas detienen la migración.
const categories=Object.freeze([
 'sender-key-memory','app-state-sync-version','app-state-sync-key',
 'lid-mapping','device-list','identity-key','sender-key','pre-key','session','tctoken',
]);
function accountJid(jid){
 if(typeof jid!=='string')return null;
 const n=jidNormalizedUser(jid);
 return /^\d{8,22}@s\.whatsapp\.net$/.test(n||'')?n:null;
}
function parseKey(raw){
 for(const c of categories){
  if(raw.startsWith(c+'-') && raw.length>c.length+1){
   const id=raw.slice(c.length+1);
   if(id.length>512)throw Error('Llave legada inválida');
   return {category:c,id};
  }
 }
 throw Error('Categoría legada desconocida: revisar la versión antes de migrar');
}
function parseValue(raw){
 if(typeof raw!=='string'||!raw.length)throw Error('Estado legado vacío o ilegible');
 try{return JSON.parse(raw,BufferJSON.reviver)}catch(_){throw Error('Estado legado ilegible; no se importó')}
}
export async function migrateLegacyBaileysSession({tenantId,sessionId,expectedAccountJid,confirmLegacyStopped,confirmBackup},
 {transaction=withTransaction,acquireLease=acquireBaileysTenantLease,useAuth=usePostgresTenantAuthState}={}){
 if(!Number.isSafeInteger(tenantId)||tenantId<1||tenantId>2147483647)throw Error('Tenant inválido');
 if(typeof sessionId!=='string'||!sessionId.trim()||sessionId!==sessionId.trim()||sessionId.length>200)throw Error('Sesión legada inválida');
 const expected=accountJid(expectedAccountJid);
 if(!expected||confirmLegacyStopped!==true||confirmBackup!==true)throw Error('Falta confirmar cuenta, parada de procesos o respaldo');
 const lease=await acquireLease(tenantId);
 if(!lease)throw Error('El tenant tiene una sesión activa');
 try {
  await lease.assertHeld();
  return await transaction(async db=>{
   const tenant=await db.query('SELECT id FROM clientes WHERE id=$1 FOR UPDATE',[tenantId]);
   if(!tenant.rows.length)throw Error('Tenant inexistente');
   // No reemplazar nunca un estado nuevo ni crear un destino sobre otro parcial.
   const present=await db.query('SELECT 1 FROM baileys_tenant_auth WHERE tenant_id=$1 LIMIT 1',[tenantId]);
   if(present.rows.length)throw Error('El tenant ya tiene estado Baileys; no se sobrescribe');
   const ownership=await db.query(`INSERT INTO baileys_legacy_imports (legacy_session_id,tenant_id)
    VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING tenant_id`,[sessionId,tenantId]);
   if(!ownership.rows.length)throw Error('La sesión legada o el tenant ya fueron importados; revisión requerida');
   // Bloquea escrituras de cualquier sesión legada durante la copia: puede bloquear
   // otros tenants y no sustituye la parada de sockets ANTES y DESPUÉS de importar.
   await db.query("SET LOCAL lock_timeout = '5s'");
   await db.query('LOCK TABLE baileys_auth_state IN SHARE MODE');
   const rows=(await db.query('SELECT key_id,data_json FROM baileys_auth_state WHERE session_id=$1 ORDER BY key_id LIMIT 20001',[sessionId])).rows;
   if(rows.length===0||rows.length>20000)throw Error('Estado legado inexistente o demasiado grande');
   let size=0,creds=null;const groups=Object.create(null);
   for(const row of rows){
    size+=Buffer.byteLength(String(row.data_json||''));
    if(size>20*1024*1024)throw Error('Estado legado demasiado grande');
    const value=parseValue(row.data_json);
    if(row.key_id==='creds'){creds=value;continue;}
    const {category,id}=parseKey(row.key_id);
    if(value==null)throw Error('Llave legada vacía');
    groups[category] ||= Object.create(null);
    Object.defineProperty(groups[category],id,{value,enumerable:true,writable:true,configurable:true});
   }
   if(!creds||typeof creds!=='object'||Array.isArray(creds)||creds.registered!==true||accountJid(creds.me?.id)!==expected ||
      !creds.noiseKey?.private||!creds.noiseKey?.public||!creds.signedIdentityKey?.private||!creds.signedIdentityKey?.public||
      !creds.signedPreKey?.keyPair||!Number.isSafeInteger(creds.registrationId)||typeof creds.advSecretKey!=='string')
    throw Error('Credenciales inválidas o no coinciden con la cuenta confirmada');
   await lease.assertHeld();
   const query=(...args)=>db.query(...args),sameTransaction=fn=>fn(db);
   const dest=await useAuth(tenantId,{query,transaction:sameTransaction});
   for(const key of Object.keys(dest.state.creds))delete dest.state.creds[key];
   for(const [key,value] of Object.entries(creds))Object.defineProperty(dest.state.creds,key,{value,enumerable:true,writable:true,configurable:true});
   await dest.saveCreds();
   if(Object.keys(groups).length)await dest.state.keys.set(groups);
   await dest.flush();
   // Verificar que descifra y que se insertó exactamente el mismo número de filas.
   const restored=await useAuth(tenantId,{query,transaction:sameTransaction});
   if(accountJid(restored.state.creds.me?.id)!==expected ||
      JSON.stringify(restored.state.creds,BufferJSON.replacer)!==JSON.stringify(creds,BufferJSON.replacer))
    throw Error('Verificación de credenciales importadas falló');
   const count=Number((await db.query('SELECT count(*)::int AS n FROM baileys_tenant_auth WHERE tenant_id=$1',[tenantId])).rows[0].n);
   if(count!==rows.length)throw Error('Verificación de cantidad de llaves falló');
   for(const [category,bucket] of Object.entries(groups)){
    const ids=Object.keys(bucket),loaded=await restored.state.keys.get(category,ids);
    for(const id of ids){
     const expectedValue=category==='app-state-sync-key'?proto.Message.AppStateSyncKeyData.fromObject(bucket[id]):bucket[id];
     if(loaded[id]==null || JSON.stringify(loaded[id],BufferJSON.replacer)!==JSON.stringify(expectedValue,BufferJSON.replacer))
      throw Error('Verificación de lectura de llaves falló');
    }
   }
   await lease.assertHeld();
   return {ok:true,tenantId,rows:count};
  });
 } finally {await lease.release();}
}
