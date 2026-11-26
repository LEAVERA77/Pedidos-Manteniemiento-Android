import { beforeEach,describe,it,expect,vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const state=vi.hoisted(()=>({role:'tecnico',tenant:2,uid:5,business:'agua',enabled:true,settings:{habilitada:true,radio_metros:120},failed:false}));
vi.mock('../middleware/auth.js',()=>({authWithTenantHost:(req,_res,next)=>{req.user={id:state.uid,rol:state.role};req.tenantId=state.tenant;req.activeBusinessType=state.business;req.businessTypeFilterEnabled=state.enabled;next()},adminOnly:(_req,_res,next)=>next()}));
vi.mock('../db/neon.js',()=>({query:vi.fn(async sql=>{if(state.failed)throw Error('db');if(sql.includes('to_regclass'))return {rows:[{nombre:'tenant_geocerca_settings'}]};if(sql.includes('SELECT habilitada, radio_metros'))return {rows:[state.settings]};return {rows:[]}})}));
vi.mock('../services/tenantZonaServicio.js',()=>({getZonaServicioTenant:vi.fn(),verificarCoordenadasZonaServicio:vi.fn()}));
import router from '../routes/tenantOperativaSettings.js';
const app=()=>{const a=express();a.use(router);return a};
beforeEach(()=>{state.role='tecnico';state.tenant=2;state.uid=5;state.business='agua';state.enabled=true;state.failed=false;state.settings={habilitada:true,radio_metros:120}});
describe('configuración de geocerca para offline',()=>{
 it('devuelve únicamente datos del contexto autenticado y sin caché HTTP',async()=>{const r=await request(app()).get('/geocerca-offline').expect(200);expect(r.body).toEqual({usuario_id:5,tenant_id:2,business_type:'agua',habilitada:true,radio_metros:120});expect(r.headers['cache-control']).toBe('no-store')});
 it('rechaza clientes y contextos sin aislamiento',async()=>{state.role='cliente';await request(app()).get('/geocerca-offline').expect(403);state.role='tecnico';state.enabled=false;await request(app()).get('/geocerca-offline').expect(503)});
 it('no inventa configuración si la base da error',async()=>{state.failed=true;await request(app()).get('/geocerca-offline').expect(503)});
 it('admite técnico acentuado y limita el radio',async()=>{state.role='técnico';state.settings.radio_metros=9999;const r=await request(app()).get('/geocerca-offline').expect(200);expect(r.body.radio_metros).toBe(5000)});
});
