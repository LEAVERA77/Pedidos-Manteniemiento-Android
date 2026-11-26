import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const auth=vi.hoisted(()=>({uid:7,tenant:1,role:'tecnico',business:'electricidad',enabled:true}));
vi.mock('../middleware/auth.js',()=>({authWithTenantHost:(req,_res,next)=>{req.user={id:auth.uid,rol:auth.role};req.tenantId=auth.tenant;req.activeBusinessType=auth.business;req.businessTypeFilterEnabled=auth.enabled;next()},adminOnly:(_req,_res,next)=>next()}));
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { aplicarDiarioCampo,validarDiarioCampo } from '../services/trabajoCampoOffline.js';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
const ctx={usuarioId:7,tenantId:1,businessType:'electricidad'};
const payload=()=>{const t=Date.now()-10000,fecha=new Date(t).toISOString();return {
 tipo:'TRABAJO_CAMPO',congelado:true,usuario_id:7,tenant_id:1,pedido_id:10,business_type:'electricidad',operacion_id:randomUUID(),
 base:{estado:'Asignado',avance:0,tecnico_asignado_id:7,fecha_asignacion:'2026-01-01T00:00:00.000Z',fecha_avance:null,lat:-31.3,lng:-60.1,campos_cierre:{trabajo_realizado:null,tecnico_cierre:null,foto_cierre:null,firma_cliente:null,checklist_seguridad:null,telefono_contacto:''}},
 eventos:[{tipo:'inicio',fecha,gps:{lat:-31.3,lng:-60.1,accuracy:12,timestamp:t-1000,fuente:'gps'},fotos:['data:image/jpeg;base64,YWJj']},
 {tipo:'avance',fecha,avance:40},{tipo:'material',fecha,descripcion:'Cable',cantidad:2,unidad:'m'},
 {tipo:'cierre',fecha,campos:{trabajo_realizado:'Reparado',tecnico_cierre:'Equipo',foto_cierre:null,firma_cliente:null,checklist_seguridad:'{}',telefono_contacto:null}}]};};
describe.skipIf(!dsn)('sincronización de campo en PostgreSQL descartable',()=>{
 let pool, client, apiDb, app, owned=false;
 const apply=async (p,c=ctx)=>{const v=validarDiarioCampo(p,c);const db=await pool.connect();try{await db.query('BEGIN');const out=await aplicarDiarioCampo(db,p,c,v);await db.query('COMMIT');return out}catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}};
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});client=await pool.connect();
  const c=await client.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
  if(c.rows[0].n!==0)throw Error('La base descartable no está vacía');
  await client.query(`CREATE TABLE pedidos (id integer primary key,tenant_id int,business_type text,tipo_trabajo text,estado text,avance int,tecnico_asignado_id int,
    fecha_asignacion timestamptz,fecha_avance timestamptz,lat double precision,lng double precision,cliente text,
    usuario_inicio_id int,usuario_avance_id int,usuario_cierre_id int,foto_base64 text,trabajo_realizado text,tecnico_cierre text,
    fecha_cierre timestamptz,foto_cierre text,firma_cliente text,checklist_seguridad text,telefono_contacto text)`);
  await client.query('CREATE TABLE tenant_geocerca_settings (tenant_id integer primary key,habilitada boolean,radio_metros integer)');
  await client.query("CREATE TABLE pedido_materiales (id serial primary key,pedido_id int REFERENCES pedidos(id),descripcion text NOT NULL CHECK (descripcion <> 'fallar'),cantidad numeric,unidad text)");
  await client.query(readFileSync(new URL('../db/migrations/trabajo_campo_offline_operaciones.sql',import.meta.url),'utf8'));
  owned=true;
  process.env.DB_CONNECTION=dsn;
  apiDb=await import('../db/neon.js');
  const router=(await import('../routes/pedidos.js')).default;
  app=express();app.use(express.json({limit:'25mb'}));app.use('/pedidos',router);
 });
 beforeEach(async()=>{Object.assign(auth,{uid:7,tenant:1,role:'tecnico',business:'electricidad',enabled:true});await client.query('TRUNCATE trabajo_campo_offline_operaciones,pedido_materiales,pedidos,tenant_geocerca_settings RESTART IDENTITY');
  await client.query("INSERT INTO pedidos(id,tenant_id,business_type,estado,avance,tecnico_asignado_id,fecha_asignacion,lat,lng) VALUES(10,1,'electricidad','Asignado',0,7,'2026-01-01',-31.3,-60.1)");
  await client.query('INSERT INTO tenant_geocerca_settings VALUES(1,true,100)');});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await client.query('DROP TABLE trabajo_campo_offline_operaciones,pedido_materiales,tenant_geocerca_settings,pedidos');if(client)client.release();if(pool)await pool.end()});
 it('el endpoint HTTP mantiene la operación única y valida rol y contexto (autenticación simulada)',async()=>{
  const p=payload();const post=()=>request(app).post('/pedidos/10/trabajo-offline').send(p);
  auth.role='cliente';await post().expect(403);auth.role='tecnico';auth.enabled=false;await post().expect(503);auth.enabled=true;
  await request(app).post('/pedidos/11/trabajo-offline').send(p).expect(400);
  auth.tenant=2;await post().expect(400);auth.tenant=1;
  const [a,b]=await Promise.all([post(),post()]);expect([a.status,b.status].sort()).toEqual([200,201]);
  expect(a.body.ok).toBe(true);expect(b.body.ok).toBe(true);
  expect((await client.query('SELECT count(*)::int n FROM pedido_materiales')).rows[0].n).toBe(1);
 });
 it('cliente y endpoint real conservan operación al perder respuesta y reintentan sin duplicados',async()=>{
  const m=await import('../../app/src/main/assets/modules/offline-trabajo-campo-runtime.js');
  const state=new Map(),storage={getItem:k=>state.has(k)?state.get(k):null,setItem:(k,v)=>state.set(k,v)};
  const c={usuario_id:7,tenant_id:1,business_type:'electricidad'};
  await m.actualizarConfigCampo(c,{storage,token:'jwt',apiUrl:p=>p,fetchFn:async()=>new Response(JSON.stringify({...c,habilitada:true,radio_metros:100}),{status:200})});
  const pedido={id:10,tai:7,es:'Asignado',av:0,la:-31.3,ln:-60.1,fasi:'2026-01-01T00:00:00.000Z',fa:null,fotos:[]};
  const fecha=new Date().toISOString();const gps={lat:-31.3,lng:-60.1,accuracy:5,timestamp:Date.now(),fuente:'gps'};
  let local=m.agregarTrabajoCampo(c,pedido,{tipo:'inicio',fecha,gps},{storage});
  local=m.agregarTrabajoCampo(c,local,{tipo:'material',fecha,descripcion:'Cable',cantidad:3,unidad:'MTR'},{storage});
  m.agregarTrabajoCampo(c,local,{tipo:'cierre',fecha,campos:{trabajo_realizado:'Terminado',tecnico_cierre:'Técnico'}},{storage});
  let llamadas=0;const mensajes=[];
  const opts={storage,token:'jwt',apiUrl:p=>p,fetchFn:async(_url,o)=>{
    mensajes.push(o.body);const r=await request(app).post('/pedidos/10/trabajo-offline').send(JSON.parse(o.body));
    llamadas++;if(llamadas===1)throw Error('Se perdió la respuesta después del commit');
    return new Response(JSON.stringify(r.body),{status:r.status});}};
  expect((await m.sincronizarTrabajosCampo(c,opts)).errores).toHaveLength(1);
  expect(JSON.parse(storage.getItem('pmg_trabajo_campo_queue_v1'))).toHaveLength(1);
  expect((await m.sincronizarTrabajosCampo(c,opts)).confirmados).toBe(1);
  expect(mensajes[0]).toBe(mensajes[1]);expect(JSON.parse(storage.getItem('pmg_trabajo_campo_queue_v1'))).toHaveLength(0);
  expect((await client.query('SELECT estado FROM pedidos WHERE id=10')).rows[0].estado).toBe('Cerrado');
  expect((await client.query('SELECT count(*)::int n FROM pedido_materiales')).rows[0].n).toBe(1);
 });
 it('sincroniza inicio, avance, materiales, foto y cierre de manera idempotente ante concurrencia',async()=>{
  const p=payload();const [a,b]=await Promise.all([apply(p),apply(p)]);expect([a.repetida,b.repetida].sort()).toEqual([false,true]);
  const row=(await client.query('SELECT estado,avance,usuario_inicio_id,usuario_cierre_id,foto_base64,trabajo_realizado FROM pedidos WHERE id=10')).rows[0];
  expect(row).toMatchObject({estado:'Cerrado',avance:100,usuario_inicio_id:7,usuario_cierre_id:7,foto_base64:'data:image/jpeg;base64,YWJj',trabajo_realizado:'Reparado'});
  expect((await client.query('SELECT count(*)::int n FROM pedido_materiales')).rows[0].n).toBe(1);
  expect((await client.query('SELECT count(*)::int n FROM trabajo_campo_offline_operaciones')).rows[0].n).toBe(1);
  const changed=structuredClone(p);changed.eventos[1].avance=50;await expect(apply(changed)).rejects.toMatchObject({statusCode:409});
 });
 it('no sobreescribe cambios o reasignación y conserva libre la reserva para revisión',async()=>{
  const p=payload();await client.query('UPDATE pedidos SET tecnico_asignado_id=8 WHERE id=10');await expect(apply(p)).rejects.toMatchObject({statusCode:409});
  expect((await client.query('SELECT count(*)::int n FROM trabajo_campo_offline_operaciones')).rows[0].n).toBe(0);
  expect((await client.query('SELECT estado FROM pedidos WHERE id=10')).rows[0].estado).toBe('Asignado');
 });
 it('detecta auditoría modificada antes de sobrescribirla',async()=>{
  const p=payload();await client.query('UPDATE pedidos SET usuario_inicio_id=99 WHERE id=10');
  await expect(apply(p)).rejects.toMatchObject({statusCode:409});
  expect((await client.query('SELECT usuario_inicio_id FROM pedidos WHERE id=10')).rows[0].usuario_inicio_id).toBe(99);
  expect((await client.query('SELECT count(*)::int n FROM trabajo_campo_offline_operaciones')).rows[0].n).toBe(0);
 });
 it('si falla material revierte tanto el estado como la reserva',async()=>{
  const p=payload();p.eventos[2].descripcion='fallar';await expect(apply(p)).rejects.toBeDefined();
  expect((await client.query('SELECT estado FROM pedidos WHERE id=10')).rows[0].estado).toBe('Asignado');
  expect((await client.query('SELECT count(*)::int n FROM trabajo_campo_offline_operaciones')).rows[0].n).toBe(0);
 });
 it('no confirma si la geocerca actual cambió o falta firma requerida',async()=>{
  const p=payload();p.eventos[0].gps.lat=-31.301;await expect(apply(p)).rejects.toMatchObject({statusCode:409});
  const q=payload();await client.query("UPDATE pedidos SET cliente='Prueba' WHERE id=10");await expect(apply(q)).rejects.toMatchObject({statusCode:409});
  expect((await client.query('SELECT count(*)::int n FROM trabajo_campo_offline_operaciones')).rows[0].n).toBe(0);
 });
 it('respeta la prohibición de materiales y la autoría de avance',async()=>{
  const p=payload();await client.query("UPDATE pedidos SET tipo_trabajo='Factibilidad' WHERE id=10");
  await expect(apply(p)).rejects.toMatchObject({statusCode:409});
  expect((await client.query('SELECT count(*)::int n FROM pedido_materiales')).rows[0].n).toBe(0);
  await client.query("UPDATE pedidos SET tipo_trabajo='Reparación',usuario_avance_id=42 WHERE id=10");
  const q=payload();q.eventos.splice(1,1);await apply(q);
  expect((await client.query('SELECT usuario_avance_id FROM pedidos WHERE id=10')).rows[0].usuario_avance_id).toBe(42);
 });
 it('rechaza datos de otra identidad, GPS viejo y orden inválido',()=>{
  const p=payload();expect(()=>validarDiarioCampo(p,{...ctx,usuarioId:8})).toThrow();p.eventos[0].gps.timestamp-=61000;expect(()=>validarDiarioCampo(p,ctx)).toThrow();
  const q=payload();q.eventos.splice(0,1);expect(()=>validarDiarioCampo(q,ctx)).toThrow();
 });
});
