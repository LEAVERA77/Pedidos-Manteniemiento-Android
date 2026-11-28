/** Límite gradual para respuestas reales. No inicia mensajes ni genera diálogos. */
import {withTransaction} from '../db/neon.js';
export const WARMUP_DAILY_CAPS=Object.freeze([5,7,10,15,20,25,30,40,45,50,55,60,70,80]);
const zone='America/Argentina/Buenos_Aires';
const dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
function localDay(date){
 const d=new Date(date);if(!Number.isFinite(d.getTime()))throw Error('Fecha warm-up inválida');
 const parts=Object.fromEntries(dateFmt.formatToParts(d).map(x=>[x.type,x.value]));
 return {number:Math.floor(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/86400000),iso:`${parts.year}-${parts.month}-${parts.day}`};
}
export function warmupStatus(row,at){
 const current=localDay(at), enabled=row?.warmup_enabled===true, started=row?.warmup_started_at;
 const elapsed=started?current.number-localDay(started).number:0;
 if(elapsed<0)throw Error('El inicio de warm-up está en el futuro');
 const days=started?elapsed+1:null;
 const ready=!!row?.warmup_forced_ready || (enabled && !row.warmup_paused && days>14);
 const state=ready?'READY':enabled?(row.warmup_paused?'PAUSED':'WARMING'):'NOT_CONFIGURED';
 const sent=String(row?.warmup_count_date||'').slice(0,10)===current.iso?Number(row?.warmup_daily_sent||0):0;
 return {state,day:days && !ready?days:null,daily_limit:(state==='WARMING'||state==='PAUSED') && days<=14?WARMUP_DAILY_CAPS[days-1]:null,
  daily_sent:sent,local_date:current.iso};
}
function validId(id){if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw Error('Tenant inválido');}
async function locked(db,tenantId){
 await db.query('INSERT INTO baileys_warmup_state(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
 const r=await db.query('SELECT *,warmup_count_date::text AS warmup_count_date FROM baileys_warmup_state WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
 if(!r.rows[0])throw Error('No se pudo verificar warm-up');
 const clock=await db.query('SELECT clock_timestamp() AS server_now');
 return {...r.rows[0],server_now:clock.rows[0].server_now};
}
/** El cliente no debe controlar isTrusted: resolver desde lista validada de la entidad. */
export async function reserveWarmupAttempt(tenantId,{isTrusted=false,transaction=withTransaction}={}){
 validId(tenantId);
 return transaction(async db=>{
  const row=await locked(db,tenantId),status=warmupStatus(row,row.server_now);
  if(status.state==='NOT_CONFIGURED'||status.state==='PAUSED')return {...status,allowed:false,error:'warmup_not_active'};
  if(status.state==='READY'){
   if(row.warmup_enabled)await db.query('UPDATE baileys_warmup_state SET warmup_enabled=FALSE,warmup_forced_ready=TRUE,updated_at=NOW() WHERE tenant_id=$1',[tenantId]);
   return {...status,allowed:true};
  }
  if(status.day<=3&&isTrusted!==true)return {...status,allowed:false,error:'trusted_contacts_only'};
  if(status.daily_sent>=status.daily_limit)return {...status,allowed:false,error:'warmup_daily_limit'};
  await db.query('UPDATE baileys_warmup_state SET warmup_count_date=$2::date,warmup_daily_sent=$3,updated_at=NOW() WHERE tenant_id=$1',
   [tenantId,status.local_date,status.daily_sent+1]);
  return {...status,daily_sent:status.daily_sent+1,allowed:true};
 });
}
/** Acciones para invocar solo desde un controlador que revalide administrador y tenant. */
export async function changeWarmupState(tenantId,action,{transaction=withTransaction}={}){
 validId(tenantId);if(!['activate','pause','resume','force_ready','status'].includes(action))throw Error('Acción inválida');
 return transaction(async db=>{
  let row=await locked(db,tenantId),status=warmupStatus(row,row.server_now);
  if(action==='activate'){
   if(status.state==='WARMING'||status.state==='PAUSED')throw Error('El warm-up ya está iniciado; usá reanudar');
   await db.query(`UPDATE baileys_warmup_state SET warmup_enabled=TRUE,warmup_paused=FALSE,warmup_forced_ready=FALSE,
    warmup_started_at=NOW(),warmup_count_date=NULL,warmup_daily_sent=0,updated_at=NOW() WHERE tenant_id=$1`,[tenantId]);
  }else if(action==='pause'||action==='resume'){
   if(!['WARMING','PAUSED'].includes(status.state))throw Error('No hay warm-up activo para pausar o reanudar');
   await db.query('UPDATE baileys_warmup_state SET warmup_paused=$2,updated_at=NOW() WHERE tenant_id=$1',[tenantId,action==='pause']);
  }else if(action==='force_ready'||(action==='status'&&status.state==='READY'&&row.warmup_enabled)){
   await db.query('UPDATE baileys_warmup_state SET warmup_enabled=FALSE,warmup_paused=FALSE,warmup_forced_ready=TRUE,updated_at=NOW() WHERE tenant_id=$1',[tenantId]);
  }
  row=await locked(db,tenantId);return warmupStatus(row,row.server_now);
 });
}
