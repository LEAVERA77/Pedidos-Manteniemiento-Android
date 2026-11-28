/** Estado durable de la ventana de respuesta y cuotas, aún sin integrar al flujo. */
import {createHmac,randomInt} from 'node:crypto';
import {rawQuery,withTransaction} from '../db/neon.js';
function validTenant(t){if(!Number.isSafeInteger(t)||t<1||t>2147483647)throw Error('Tenant inválido');}
function validJid(j){if(typeof j!=='string'||!/^\d{8,22}@(s\.whatsapp\.net|lid)$/.test(j))throw Error('JID privado inválido');}
export function createBaileysGuardPostgres({keyBase64=process.env.BAILEYS_GUARD_HASH_KEY,query=rawQuery,transaction=withTransaction,perMinute=12,perHour=120,enforceSpacing=false,nextGapMs=()=>randomInt(2500,5501)}={}){
 if(typeof keyBase64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyBase64)||Buffer.from(keyBase64,'base64').toString('base64')!==keyBase64)throw Error('BAILEYS_GUARD_HASH_KEY debe ser base64 de 32 bytes');
 if(!Number.isSafeInteger(perMinute)||perMinute<1||perMinute>12||!Number.isSafeInteger(perHour)||perHour<1||perHour>720)throw Error('Cuotas Baileys inválidas');
 if(typeof enforceSpacing!=='boolean'||typeof nextGapMs!=='function')throw Error('Espaciado Baileys inválido');
 const key=Buffer.from(keyBase64,'base64');
 const mac=(purpose,tenant,val)=>createHmac('sha256',key).update(JSON.stringify([purpose,tenant,val])).digest();
 const contact=(t,j)=>{validTenant(t);validJid(j);return mac('contact',t,j)};
 async function recordInbound({tenantId,jid,messageId,text='',messageTimestamp}){
  const c=contact(tenantId,jid);
  if(typeof messageId!=='string'||!messageId||messageId.length>512||typeof text!=='string'||text.length>10000)throw Error('Mensaje inválido');
  const ms=Number(messageTimestamp);if(!Number.isFinite(ms)||ms<=0)throw Error('Fecha de mensaje inválida');
  return transaction(async db=>{
   // El mismo candado serializa entradas y reservas por tenant, también entre réplicas.
   await db.query('INSERT INTO baileys_guard_limits(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
   await db.query('SELECT tenant_id FROM baileys_guard_limits WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
   let time=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
   const delta=new Date(time).getTime()-ms;
   // No convertir mensajes históricos o de reloj sospechoso en permiso para envío.
   if(delta>5*60000||delta< -60000)return {accepted:false,reason:'stale_message'};
   const inserted=await db.query('INSERT INTO baileys_guard_inbound_ids(tenant_id,message_hmac) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1',[tenantId,mac('msg',tenantId,[jid,messageId])]);
   if(!inserted.rows.length)return {accepted:false,reason:'duplicate_event'};
   // Nunca extender la ventana usando la hora de recepción si el evento venía retrasado.
   const inboundAt=new Date(Math.min(ms,new Date(time).getTime()));
   await db.query(`INSERT INTO baileys_guard_contacts(tenant_id,contact_hmac,last_message_at) VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING`,[tenantId,c,inboundAt]);
   const old=(await db.query('SELECT *,clock_timestamp() AS guard_now FROM baileys_guard_contacts WHERE tenant_id=$1 AND contact_hmac=$2 FOR UPDATE',[tenantId,c])).rows[0];
   time=old.guard_now;
   if(new Date(time).getTime()-ms>5*60000)return {accepted:false,reason:'stale_message'};
   const th=text?mac('text',tenantId,text):null;
   const same=th && old.repeat_hmac && th.equals(old.repeat_hmac) && old.repeat_started_at && (new Date(time)-old.repeat_started_at)<120000;
   const count=same?old.repeat_count+1:(th?1:0);
   const first=same?old.repeat_started_at:(th?time:null);
   const muted=old.muted_until && new Date(old.muted_until)>new Date(time);
   const muteUntil=count>=3 && !muted?new Date(new Date(time).getTime()+900000):old.muted_until;
   await db.query(`UPDATE baileys_guard_contacts SET last_message_at=GREATEST(last_message_at,$3),repeat_hmac=$4,repeat_started_at=$5,
     repeat_count=$6,muted_until=$7 WHERE tenant_id=$1 AND contact_hmac=$2`,[tenantId,c,inboundAt,th,first,count,muteUntil]);
   const n=(await db.query("SELECT count(*)::int AS n FROM baileys_guard_contacts WHERE tenant_id=$1 AND last_message_at>=$2::timestamptz-INTERVAL '1 minute'",[tenantId,time])).rows[0].n;
   return {accepted:true,respond:!muted&&count<2,muted:!!muted||count>=3,storm:n>25};
  });
 }
 async function isReplyWindowOpen({tenantId,jid,automatic=true}){
  const c=contact(tenantId,jid);
  const r=await query(`SELECT 1 FROM baileys_guard_contacts WHERE tenant_id=$1 AND contact_hmac=$2
   AND last_message_at>=clock_timestamp()-INTERVAL '24 hours' AND (muted_until IS NULL OR muted_until<=clock_timestamp())`,[tenantId,c]);
  return !!r.rows.length;
 }
 async function checkAndReserve({tenantId,jid,automatic=true,transaction:runTransaction=transaction}){
  const c=contact(tenantId,jid);
  return runTransaction(async db=>{
   await db.query('INSERT INTO baileys_guard_limits(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
   await db.query('SELECT tenant_id FROM baileys_guard_limits WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
   // Reserva durable de la separación entre intentos: coordinada por el mismo
   // candado de cuotas, también después de un reinicio de proceso.
   if(enforceSpacing){
    const remaining=await db.query(`SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM
     (next_attempt_at-clock_timestamp()))*1000))::bigint::text AS ms
     FROM baileys_guard_limits WHERE tenant_id=$1`,[tenantId]);
    const ms=Number(remaining.rows[0]?.ms||0);
    if(!Number.isSafeInteger(ms)||ms<0)throw Error('Espaciado no verificable');
    if(ms>0)return {allowed:false,error:'spacing_wait',retry_after_ms:ms};
   }
   const check=await db.query(`SELECT 1 FROM baileys_guard_contacts WHERE tenant_id=$1 AND contact_hmac=$2
    AND last_message_at>=clock_timestamp()-INTERVAL '24 hours' AND (muted_until IS NULL OR muted_until<=clock_timestamp()) FOR SHARE`,[tenantId,c]);
   if(!check.rows.length)return {allowed:false,error:'outside_reply_window_or_muted'};
   const r=await db.query(`SELECT count(*) FILTER(WHERE attempted_at>=clock_timestamp()-INTERVAL '1 minute')::int AS minute,
    count(*)::int AS hour FROM baileys_guard_attempts WHERE tenant_id=$1 AND attempted_at>=clock_timestamp()-INTERVAL '1 hour'`,[tenantId]);
   if(r.rows[0].minute>=perMinute||r.rows[0].hour>=perHour)return {allowed:false,error:'rate_limit'};
   await db.query('INSERT INTO baileys_guard_attempts(tenant_id,attempted_at) VALUES($1,clock_timestamp())',[tenantId]);
   if(enforceSpacing){
    const gap=nextGapMs();
    if(!Number.isSafeInteger(gap)||gap<2500||gap>5500)throw Error('Jitter Baileys inválido');
    await db.query(`UPDATE baileys_guard_limits SET next_attempt_at=clock_timestamp()+$2*INTERVAL '1 millisecond'
     WHERE tenant_id=$1`,[tenantId,gap]);
   }
   return {allowed:true};
  });
 }
 /** Retención acotada por entidad. Nunca borra bajas, pausas, confianza ni cuotas actuales. */
 async function cleanupTenant({tenantId,batchSize=500}={}){
  validTenant(tenantId);
  if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>1000)throw Error('Lote inválido');
  return transaction(async db=>{
   await db.query('INSERT INTO baileys_guard_limits(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
   await db.query('SELECT tenant_id FROM baileys_guard_limits WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
   const contacts=await db.query(`DELETE FROM baileys_guard_contacts WHERE ctid IN (
    SELECT ctid FROM baileys_guard_contacts WHERE tenant_id=$1
     AND last_message_at < clock_timestamp()-INTERVAL '25 hours'
     AND (muted_until IS NULL OR muted_until < clock_timestamp())
     ORDER BY last_message_at LIMIT $2 FOR UPDATE SKIP LOCKED)`,[tenantId,batchSize]);
   const messages=await db.query(`DELETE FROM baileys_guard_inbound_ids WHERE ctid IN (
    SELECT ctid FROM baileys_guard_inbound_ids WHERE tenant_id=$1
     AND created_at < clock_timestamp()-INTERVAL '2 days'
     ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)`,[tenantId,batchSize]);
   const attempts=await db.query(`DELETE FROM baileys_guard_attempts WHERE ctid IN (
    SELECT ctid FROM baileys_guard_attempts WHERE tenant_id=$1
     AND attempted_at < clock_timestamp()-INTERVAL '2 hours'
     ORDER BY attempted_at LIMIT $2 FOR UPDATE SKIP LOCKED)`,[tenantId,batchSize]);
   return {contacts:contacts.rowCount,messages:messages.rowCount,attempts:attempts.rowCount};
  });
 }
 return {recordInbound,isReplyWindowOpen,checkAndReserve,cleanupTenant};
}
