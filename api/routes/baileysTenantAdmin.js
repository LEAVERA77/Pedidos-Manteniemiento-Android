/** Panel experimental, bloqueado por defecto. Nunca permite elegir otro tenant. */
import express from 'express';
import rateLimit from 'express-rate-limit';
import {authWithTenantHost,adminOnly} from '../middleware/auth.js';
import {withTransaction} from '../db/neon.js';
import {changeWarmupState} from '../services/baileysWarmup.js';
import {createBaileysTenantSafety} from '../services/baileysTenantSafety.js';
import {createBaileysTrustedContacts} from '../services/baileysTrustedContacts.js';

export function createBaileysTenantAdminRouter({enforcementReady=false,runtime=null}={}) {
const router=express.Router();
router.use((req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!enforcementReady||process.env.BAILEYS_MULTITENANT_ENABLED!=='true'||process.env.SQL_GATEWAY_DISABLED!=='true')
  return res.status(503).json({error:'Baileys multi-tenant no está habilitado de forma segura.'});
 return next();
});
router.use(authWithTenantHost,adminOnly);
router.use(rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}));
const actions={activate:'activate',pause:'pause',resume:'resume','force-ready':'force_ready'};
function verifiedTransaction(req,auditAction){
 const user=Number(req.user?.id),tenant=Number(req.tenantId);
 if(!Number.isSafeInteger(user)||user<1||!Number.isSafeInteger(tenant)||tenant<1||req.jwtTenantClaimStale)
  throw Object.assign(Error('La sesión no coincide con la entidad.'),{status:403});
 return fn=>withTransaction(async db=>{
  const r=await db.query(`SELECT u.rol,u.activo AS u_activo,c.activo AS c_activo,
    COALESCE(to_jsonb(u)->>'tenant_id',to_jsonb(u)->>'cliente_id') AS usuario_tenant
    FROM usuarios u JOIN clientes c ON c.id=$2 WHERE u.id=$1 FOR SHARE OF u,c`,[user,tenant]);
  const row=r.rows[0];
  if(!row || row.u_activo!==true || row.c_activo===false || Number(row.usuario_tenant)!==tenant ||
    !['admin','administrador'].includes(String(row.rol||'').trim().toLowerCase()))
   throw Object.assign(Error('La cuenta ya no administra esta entidad.'),{status:403});
  const result=await fn(db);
  if(auditAction)await db.query('INSERT INTO baileys_admin_audit(tenant_id,usuario_id,action) VALUES($1,$2,$3)',[tenant,user,auditAction]);
  return result;
 });
}
async function handle(req,res,action){
 try{
  if(Object.keys(req.query||{}).length || Object.keys(req.body||{}).some(k=>k!=='confirmar'))return res.status(400).json({error:'Parámetros inválidos.'});
  if(action==='force_ready' && req.body?.confirmar!==true)return res.status(400).json({error:'Confirmá explícitamente el paso a READY.'});
  const status=await changeWarmupState(Number(req.tenantId),action,{transaction:verifiedTransaction(req,action==='status'?null:action)});
  return res.json({ok:true,tenant_id:Number(req.tenantId),warmup:status});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  if(/No hay warm-up activo|ya está iniciado/.test(e.message))return res.status(409).json({error:e.message});
  console.error('[baileys-admin] fallo de operación',e.code||'error');
  return res.status(503).json({error:'No se pudo verificar o modificar el estado.'});
 }
}
// QR y control aislados por tenant. Solo recibe un runtime interno, nunca del HTTP.
function runtimeAvailable(){return runtime && ['status','start','stop'].every(k=>typeof runtime[k]==='function');}
router.get('/connection',async(req,res)=>{
 try{
  if(Object.keys(req.query||{}).length)return res.status(400).json({error:'Parámetros inválidos.'});
  if(!runtimeAvailable())return res.status(503).json({error:'Motor Baileys no disponible.'});
  const tenant=Number(req.tenantId);
  const state=await verifiedTransaction(req,null)(async()=>runtime.status(tenant));
  if(!state || state.tenant_id!==tenant || typeof state.status!=='string')throw Error('Estado inválido');
  const qr=state.status==='qr_ready' && typeof state.qr==='string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(state.qr) && state.qr.length<=100000 ? state.qr : null;
  return res.json({ok:true,tenant_id:tenant,connection:{status:state.status,qr}});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  return res.status(503).json({error:'No se pudo verificar la sesión de la entidad.'});
 }
});
router.post('/connection/:action',async(req,res)=>{
 try{
  if(!['start','stop'].includes(req.params.action))return res.status(404).json({error:'Acción desconocida.'});
  if(Object.keys(req.query||{}).length||Object.keys(req.body||{}).length)return res.status(400).json({error:'Parámetros inválidos.'});
  if(!runtimeAvailable())return res.status(503).json({error:'Motor Baileys no disponible.'});
  const tenant=Number(req.tenantId),action=req.params.action;
  // Auditoría de la SOLICITUD antes de actuar: no certifica que el socket conectó.
  await verifiedTransaction(req,null)(db=>db.query('INSERT INTO baileys_session_admin_audit(tenant_id,usuario_id,action) VALUES($1,$2,$3)',
   [tenant,Number(req.user.id),`${action}_request`]));
  const state=await runtime[action](tenant);
  if(!state || state.tenant_id!==tenant || typeof state.status!=='string')throw Error('Estado inválido');
  return res.json({ok:true,tenant_id:tenant,connection:{status:state.status}});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  return res.status(503).json({error:'No se pudo ejecutar la solicitud de sesión.'});
 }
});
// El router montado real sigue bloqueado hasta que el enforcement esté integrado.
router.get('/safety',async(req,res)=>{
 try{
  if(Object.keys(req.query||{}).length)return res.status(400).json({error:'Parámetros inválidos.'});
  const tenantId=Number(req.tenantId),safety=createBaileysTenantSafety();
  const state=await verifiedTransaction(req,null)(db=>safety.status(tenantId,{query:(...args)=>db.query(...args)}));
  return res.json({ok:true,tenant_id:tenantId,safety:state});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  return res.status(503).json({error:'No se pudo verificar la pausa de seguridad.'});
 }
});
router.post('/safety/resume',async(req,res)=>{
 try{
  const keys=Object.keys(req.body||{});
  if(Object.keys(req.query||{}).length||keys.some(k=>!['confirmar_revision','motivo_actual'].includes(k))||
     req.body?.confirmar_revision!==true||!['unresolved_stop','stop_unverified'].includes(req.body?.motivo_actual))
   return res.status(400).json({error:'Confirmá la revisión e indicá el motivo actual.'});
  const tenantId=Number(req.tenantId),safety=createBaileysTenantSafety();
  const state=await safety.resumeTenant({tenantId,actorUserId:Number(req.user?.id),expectedReason:req.body.motivo_actual,
   transaction:verifiedTransaction(req,null)});
  return res.json({ok:true,tenant_id:tenantId,safety:state});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  if(['SAFETY_NOT_PAUSED','SAFETY_REASON_CHANGED'].includes(e.code))return res.status(409).json({error:e.message});
  return res.status(503).json({error:'No se pudo reanudar la seguridad.'});
 }
});
router.post('/trusted-contacts/:action',async(req,res)=>{
 try{
  const action=req.params.action;
  if(!['add','remove'].includes(action))return res.status(404).json({error:'Acción desconocida.'});
  if(Object.keys(req.query||{}).length||Object.keys(req.body||{}).some(k=>!['telefono','confirmar'].includes(k))||
     req.body?.confirmar!==true||typeof req.body.telefono!=='string'||!/^\d{8,22}$/.test(req.body.telefono))
   return res.status(400).json({error:'Ingresá el teléfono en dígitos y confirmá la acción.'});
  const tenantId=Number(req.tenantId),contacts=createBaileysTrustedContacts();
  const result=await contacts.change({tenantId,jid:`${req.body.telefono}@s.whatsapp.net`,actorUserId:Number(req.user?.id),action,
   transaction:verifiedTransaction(req,null)});
  return res.json({ok:true,tenant_id:tenantId,...result});
 }catch(e){
  if(e.status===403)return res.status(403).json({error:e.message});
  return res.status(503).json({error:'No se pudo actualizar el contacto de confianza.'});
 }
});
router.get('/warmup',(req,res)=>handle(req,res,'status'));
router.post('/warmup/:action',(req,res)=>{
 const action=actions[req.params.action];if(!action)return res.status(404).json({error:'Acción desconocida.'});
 return handle(req,res,action);
});
return router;
}
// No cambiar hasta que el ruteo de TODAS las vías Baileys use las guardas.
export default createBaileysTenantAdminRouter();
