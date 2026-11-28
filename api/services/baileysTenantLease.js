/** Propietario exclusivo por tenant (borrador; aún no integrado al socket). */
import pg from 'pg';
import { normalizePgConnectionString } from '../db/pgSslUrl.js';
export async function acquireBaileysTenantLease(tenantId,{
  connectionString=process.env.BAILEYS_COORDINATOR_DATABASE_URL,
  onLost=()=>{}, Client=pg.Client,
}={}) {
  if(!Number.isSafeInteger(tenantId)||tenantId<1||tenantId>2147483647)throw new Error('Tenant de Baileys inválido');
  let url;try{url=new URL(connectionString)}catch(_){throw new Error('Falta BAILEYS_COORDINATOR_DATABASE_URL directa a PostgreSQL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname.toLowerCase().includes('-pooler'))
    throw new Error('El coordinador necesita conexión PostgreSQL directa, no pooler transaccional');
  if(typeof onLost!=='function')throw new Error('Falta manejador de pérdida de coordinación');
  const client=new Client({connectionString:normalizePgConnectionString(connectionString),application_name:'gestornova-baileys-coordinator'});
  let state='connecting',notified=false;
  const lost=()=>{
    if(state==='releasing'||state==='closed'||state==='lost')return;
    state='lost';
    if(!notified){notified=true;try{onLost()}catch(_){}}
    void client.end().catch(()=>{});
  };
  client.on('error',lost);client.on('end',lost);
  try {
    await client.connect();
    const r=await client.query("SELECT pg_try_advisory_lock(hashtext('gestornova_baileys'),$1::integer) AS locked",[tenantId]);
    if(!r.rows[0]?.locked){state='releasing';await client.end();state='closed';return null;}
    if(state==='lost')throw new Error('Se perdió la coordinación de Baileys');
    state='held';
  } catch(e) {
    if(state!=='lost')state='releasing';await client.end().catch(()=>{});state='closed';throw e;
  }
  return {
    async assertHeld(){
      if(state!=='held')throw new Error('Se perdió la coordinación de Baileys');
      try {
        const r=await client.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted
          AND classid::bigint=(hashtext('gestornova_baileys')::bigint & 4294967295) AND objid::bigint=$1 AND objsubid=2) AS held`,[tenantId]);
        if(state!=='held'||!r.rows[0]?.held){lost();throw new Error('Se perdió la coordinación de Baileys');}
      } catch(e){lost();throw new Error('No se pudo verificar la coordinación de Baileys',{cause:e});}
    },
    async release(){
      if(state==='closed'||state==='releasing')return;
      if(state==='lost'){state='closed';return;}
      state='releasing';
      try{await client.query("SELECT pg_advisory_unlock(hashtext('gestornova_baileys'),$1::integer)",[tenantId]);}
      finally{await client.end().catch(()=>{});state='closed';}
    },
  };
}
