import {beforeEach, describe, expect, it, vi} from 'vitest';
import express from 'express';
import request from 'supertest';
const st=vi.hoisted(()=>({user:{id:1,rol:'admin'}, usuarios:[], pedidos:[], notifs:[], failNotif:false, auditable:true}));
vi.mock('../services/fcmPush.js',()=>({sendFcmToUsuario:vi.fn(async()=>({sent:1})),upsertFcmToken:vi.fn()}));
vi.mock('../middleware/auth.js',()=>({authWithTenantHost:(req,_res,next)=>{req.user=st.user;req.tenantId=1;req.businessTypeFilterEnabled=true;req.activeBusinessType='electricidad';next();},adminOnly:(req,res,next)=>req.user.rol==='admin'?next():res.status(403).json({error:'Requiere rol administrador'})}));
vi.mock('../utils/tenantScope.js',()=>({pedidosTableHasTenantIdColumn:async()=>true,usuariosTenantColumnName:async()=> 'tenant_id',tableHasColumn:async(_t,col)=>col==='asignado_por_id'&&st.auditable}));
vi.mock('../utils/businessScope.js',()=>({pushPedidoBusinessFilter:async(req,p)=>{p.push(req.activeBusinessType);return ` AND (business_type = $${p.length} OR business_type IS NULL)`},rubroEfectivoParaTipos:()=>'',pedidosHasBusinessTypeColumn:async()=>true}));
vi.mock('../db/neon.js',()=>({query:vi.fn(async()=>({rows:[]})), pool:{},withTransaction:async fn=>{
 const backup={pedidos:structuredClone(st.pedidos),notifs:structuredClone(st.notifs)};
 const db={query:async(sql,p)=>{
  if(sql.startsWith('SELECT id, rol, activo FROM usuarios'))return {rows:st.usuarios.filter(u=>u.id===p[0]&&u.tenant_id===p[1]&&u.activo).map(u=>({...u}))};
  if(sql.startsWith('SELECT id, numero_pedido FROM pedidos'))return {rows:st.pedidos.filter(x=>p[0].includes(x.id)&&x.tenant_id===p[1]&&x.estado==='Pendiente'&&x.tecnico_asignado_id==null&&(!x.business_type||x.business_type===p[2])).map(x=>({...x}))};
  if(sql.startsWith('UPDATE pedidos SET tecnico_asignado_id')){const bt=p.at(-1),rows=st.pedidos.filter(x=>p[0].includes(x.id)&&x.tenant_id===p[1]&&x.estado==='Pendiente'&&x.tecnico_asignado_id==null&&(!x.business_type||x.business_type===bt));for(const x of rows){x.tecnico_asignado_id=p[2];x.estado='Asignado'}return {rows:rows.map(x=>({...x}))};}
  if(sql.startsWith('INSERT INTO notificaciones_movil')){if(st.failNotif)throw Error('fallo');st.notifs.push({usuario_id:p[0],titulo:p[1],cuerpo:p[2]});return {rows:[{id:100}]};}
  throw Error('SQL no previsto');
 }};
 try{return await fn(db)}catch(e){st.pedidos=backup.pedidos;st.notifs=backup.notifs;throw e;}
}}));
import router from '../routes/pedidos.js';
import {sendFcmToUsuario} from '../services/fcmPush.js';
const app=()=>{const a=express();a.use(express.json());a.use('/pedidos',router);return a};
const post=body=>request(app()).post('/pedidos/asignacion-masiva').send(body);
beforeEach(()=>{vi.clearAllMocks();st.user={id:1,rol:'admin'};st.failNotif=false;st.auditable=true;
 st.usuarios=[{id:5,tenant_id:1,rol:'supervisor',activo:true},{id:6,tenant_id:2,rol:'tecnico',activo:true},{id:7,tenant_id:1,rol:'admin',activo:true},{id:8,tenant_id:1,rol:'tecnico',activo:false}];
 st.pedidos=[{id:10,numero_pedido:'PM-10',tenant_id:1,estado:'Pendiente',tecnico_asignado_id:null,business_type:'electricidad'},{id:11,numero_pedido:'PM-11',tenant_id:1,estado:'Pendiente',tecnico_asignado_id:null,business_type:null},{id:12,numero_pedido:'PM-12',tenant_id:2,estado:'Pendiente',tecnico_asignado_id:null},{id:13,numero_pedido:'PM-13',tenant_id:1,estado:'Cerrado',tecnico_asignado_id:null},{id:14,numero_pedido:'PM-14',tenant_id:1,estado:'Pendiente',tecnico_asignado_id:null,business_type:'agua'}];st.notifs=[];});
describe('asignación masiva transaccional',()=>{
 it('el alta interna rechaza roles ajenos a administradores y técnicos',async()=>{st.user.rol='cliente';await request(app()).post('/pedidos/mantenimiento-interno').send({descripcion:'Trabajo',lat:-31,lng:-60}).expect(403)});
 it('asigna todos y crea un único aviso resumen',async()=>{const r=await post({pedido_ids:[10,11],tecnico_asignado_id:5}).expect(200);expect(r.body.cantidad).toBe(2);expect(st.pedidos.slice(0,2).every(x=>x.estado==='Asignado'&&x.tecnico_asignado_id===5)).toBe(true);expect(st.notifs).toHaveLength(1);expect(st.notifs[0].cuerpo).toContain('PM-10');expect(st.notifs[0].cuerpo).toContain('PM-11');expect(sendFcmToUsuario).toHaveBeenCalledTimes(1);expect(sendFcmToUsuario).toHaveBeenCalledWith(5,{tipo:'asignacion_masiva',notificacionId:100,cantidad:2})});
 it('deniega rol técnico y usuarios de otros tenants, inactivos o administradores',async()=>{st.user.rol='tecnico';await post({pedido_ids:[10],tecnico_asignado_id:5}).expect(403);st.user.rol='admin';for(const t of [6,7,8])await post({pedido_ids:[10],tecnico_asignado_id:t}).expect(400);expect(st.pedidos[0].estado).toBe('Pendiente');expect(st.notifs).toHaveLength(0)});
 it('si uno cambió o pertenece a otro tenant o rubro no asigna ninguno',async()=>{for(const bad of [12,13,14,999])await post({pedido_ids:[10,bad],tecnico_asignado_id:5}).expect(409);expect(st.pedidos[0].estado).toBe('Pendiente');expect(st.notifs).toHaveLength(0)});
 it('si falla el aviso revierte las asignaciones',async()=>{st.failNotif=true;await post({pedido_ids:[10,11],tecnico_asignado_id:5}).expect(500);expect(st.pedidos[0].estado).toBe('Pendiente');expect(st.notifs).toHaveLength(0);expect(sendFcmToUsuario).not.toHaveBeenCalled()});
 it('rechaza duplicados, inválidos y lotes grandes y no duplica avisos al reintentar',async()=>{for(const ids of [[],[10,10],['10'],[0],Array.from({length:101},(_,i)=>i+1)])await post({pedido_ids:ids,tecnico_asignado_id:5}).expect(400);await post({pedido_ids:[10,11],tecnico_asignado_id:5}).expect(200);await post({pedido_ids:[10,11],tecnico_asignado_id:5}).expect(409);expect(st.notifs).toHaveLength(1)});
 it('funciona sin columna opcional de auditoría',async()=>{st.auditable=false;await post({pedido_ids:[10],tecnico_asignado_id:5}).expect(200)});
});
