import { beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const st = vi.hoisted(()=>({ pedido:null, user:{id:7,rol:'tecnico'}, queries:[], simularCarrera:false }));
vi.mock('../middleware/auth.js',()=>({
  authWithTenantHost:(_req,_res,next)=>{_req.user=st.user;_req.tenantId=1;next();},
  adminOnly:(_req,_res,next)=>next(),
}));
vi.mock('../db/neon.js',()=>({
  pool:{}, withTransaction: async(fn)=>fn({query:(...args)=>query(...args)}),
  query:vi.fn(async(sql, params=[])=>{
    st.queries.push({sql:String(sql),params});
    if(String(sql).startsWith('SELECT * FROM pedidos WHERE id = $1'))return {rows:st.pedido?[{...st.pedido}]:[]};
    if(String(sql).includes('UPDATE pedidos SET\n         estado = COALESCE')){
      if(st.simularCarrera)return {rows:[]};
      return {rows:[{...st.pedido,estado:params[1]||st.pedido.estado, avance:params[2]||0}]};
    }
    return {rows:[]};
  }),
}));
vi.mock('../utils/tenantScope.js',()=>({
  pedidosTableHasTenantIdColumn: async()=>true,
  tableHasColumn:async()=>false,
  usuariosTenantColumnName:async()=>null,
}));
vi.mock('../utils/businessScope.js',()=>({
  pushPedidoBusinessFilter:async()=>'', rubroEfectivoParaTipos:()=>'', pedidosHasBusinessTypeColumn:async()=>false,
}));
import router from '../routes/pedidos.js';
function app(){const a=express();a.use(express.json());a.use('/pedidos',router);return a;}
beforeEach(()=>{st.user={id:7,rol:'tecnico'};st.pedido={id:42,tenant_id:1,tecnico_asignado_id:7,estado:'Asignado',avance:10};st.queries=[];st.simularCarrera=false;});
describe('cierre condicionado solicitado por Android en API PUT',()=>{
 it('rechaza asignado antes de escribir y de procesar fotos',async()=>{
   const r=await request(app()).put('/pedidos/42').send({estado:'Cerrado',cierre_requiere_ejecucion:true}).expect(409);
   expect(r.body.code).toBe('cierre_requiere_ejecucion');
   expect(st.queries.some(x=>x.sql.includes('UPDATE pedidos SET'))).toBe(false);
 });
 it('comprueba el estado original también en UPDATE ante carrera',async()=>{
   st.pedido.estado='En ejecución';st.simularCarrera=true;
   const r=await request(app()).put('/pedidos/42').send({estado:'Cerrado',cierre_requiere_ejecucion:true}).expect(409);
   expect(r.body.code).toBe('cierre_estado_cambio');
   const q=st.queries.find(x=>x.sql.includes('UPDATE pedidos SET\n         estado = COALESCE'));
   expect(q.sql).toContain('estado IS NOT DISTINCT FROM $17::text');
   expect(q.params[16]).toBe('En ejecución');
 });
 it('permite cerrar en ejecución y exige la condición atómica',async()=>{
   st.pedido.estado='En ejecución';
   const r=await request(app()).put('/pedidos/42').send({estado:'Cerrado',cierre_requiere_ejecucion:true}).expect(200);
   expect(r.body.estado).toBe('Cerrado');
   const q=st.queries.find(x=>x.sql.includes('UPDATE pedidos SET\n         estado = COALESCE'));
   expect(q.sql).toContain('estado IS NOT DISTINCT FROM $17::text');
 });
 it('no impone la condición al administrador ni a llamadas existentes sin bandera',async()=>{
   await request(app()).put('/pedidos/42').send({estado:'Cerrado'}).expect(200);
   let q=st.queries.find(x=>x.sql.includes('UPDATE pedidos SET\n         estado = COALESCE'));
   expect(q).toBeTruthy();expect(q.sql).not.toContain('estado IS NOT DISTINCT FROM $17::text');
   st.queries=[];st.user={id:7,rol:'admin'};
   await request(app()).put('/pedidos/42').send({estado:'Cerrado',cierre_requiere_ejecucion:true}).expect(200);
   q=st.queries.find(x=>x.sql.includes('UPDATE pedidos SET\n         estado = COALESCE'));
   expect(q).toBeTruthy();expect(q.sql).not.toContain('estado IS NOT DISTINCT FROM $17::text');
 });
});
