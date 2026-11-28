/** Panel experimental, bloqueado por defecto. Nunca permite elegir otro tenant. */
import express from 'express';
import rateLimit from 'express-rate-limit';
import {authWithTenantHost,adminOnly} from '../middleware/auth.js';
import {withTransaction} from '../db/neon.js';
import {changeWarmupState} from '../services/baileysWarmup.js';

export function createBaileysTenantAdminRouter({enforcementReady=false}={}) {
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
router.get('/warmup',(req,res)=>handle(req,res,'status'));
router.post('/warmup/:action',(req,res)=>{
 const action=actions[req.params.action];if(!action)return res.status(404).json({error:'Acción desconocida.'});
 return handle(req,res,action);
});
return router;
}
// No cambiar hasta que el ruteo de TODAS las vías Baileys use las guardas.
export default createBaileysTenantAdminRouter();
