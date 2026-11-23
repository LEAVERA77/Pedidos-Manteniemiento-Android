import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const auth=vi.hoisted(()=>({user:{id:1,rol:'admin'}}));
const dsn=process.env.ASIGNACION_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/gestornova_masiva_test')throw Error('Solo base local descartable gestornova_masiva_test');}
vi.mock('../middleware/auth.js',()=>({authWithTenantHost:(req,_res,next)=>{req.user=auth.user;req.tenantId=1;req.businessTypeFilterEnabled=true;req.activeBusinessType='electricidad';next()},adminOnly:(_req,_res,next)=>next()}));
describe.skipIf(!dsn)('asignación masiva con PostgreSQL real aislado',()=>{
 let client,db,app;
 beforeAll(async()=>{
  process.env.DB_CONNECTION=dsn;client=new pg.Client({connectionString:dsn});await client.connect();
  await client.query('CREATE TABLE usuarios (id int primary key, tenant_id int, activo boolean, rol text)');
  await client.query('CREATE TABLE pedidos (id serial primary key, numero_pedido text, tenant_id int, business_type text, estado text, tecnico_asignado_id int, asignado_por_id int, fecha_asignacion timestamptz, distribuidor text, cliente text, tipo_trabajo text, descripcion text, prioridad text, avance int, lat numeric, lng numeric, usuario_id int, usuario_creador_id int, fecha_creacion timestamptz, foto_base64 text)');
  await client.query(readFileSync(new URL('../db/migrations/mantenimiento_interno_operaciones.sql', import.meta.url),'utf8'));
  await client.query('CREATE TABLE pedido_contador (tenant_id int, anio int, ultimo_numero int, PRIMARY KEY (tenant_id,anio))');
  await client.query('CREATE TABLE notificaciones_movil (id serial primary key, usuario_id int CHECK(usuario_id <> 9), pedido_id int, titulo text, cuerpo text, leida boolean)');
  await client.query("INSERT INTO usuarios VALUES (1,1,true,'admin'),(5,1,true,'tecnico'),(9,1,true,'tecnico'),(6,2,true,'tecnico')");
  await client.query("INSERT INTO pedidos (id,numero_pedido,tenant_id,business_type,estado,tecnico_asignado_id,asignado_por_id,fecha_asignacion) VALUES (10,'PM-10',1,'electricidad','Pendiente',null,null,null),(11,'PM-11',1,null,'Pendiente',null,null,null),(12,'PM-12',2,'electricidad','Pendiente',null,null,null),(13,'PM-13',1,'agua','Pendiente',null,null,null)");
  await client.query("SELECT setval(pg_get_serial_sequence('pedidos','id'),100)");
  db=await import('../db/neon.js');const router=(await import('../routes/pedidos.js')).default;app=express();app.use(express.json());app.use('/pedidos',router);
 });
 afterAll(async()=>{if(db?.pool)await db.pool.end();if(client){await client.query('DROP TABLE IF EXISTS mantenimiento_interno_operaciones,notificaciones_movil,pedidos,usuarios,pedido_contador');await client.end()}});
 const send=(ids,tid=5)=>request(app).post('/pedidos/asignacion-masiva').send({pedido_ids:ids,tecnico_asignado_id:tid});
 it('aisla tenant y rubro y revierte todo ante error al insertar la notificación',async()=>{
  await send([10,12]).expect(409);await send([10,13]).expect(409);await send([10,11],9).expect(500);
  const rows=await client.query('SELECT estado,tecnico_asignado_id FROM pedidos WHERE id IN (10,11) ORDER BY id');
  expect(rows.rows).toEqual([{estado:'Pendiente',tecnico_asignado_id:null},{estado:'Pendiente',tecnico_asignado_id:null}]);
 });
 it('guarda mantenimiento interno en tenant y rubro del servidor sin datos del cliente',async()=>{
  await request(app).post('/pedidos/mantenimiento-interno').send({descripcion:'  ',lat:-31,lng:-60}).expect(400);
  await request(app).post('/pedidos/mantenimiento-interno').send({descripcion:'Trabajo',lat:null,lng:-60}).expect(400);
  auth.user={id:5,rol:'tecnico'};
  const payload={descripcion:'Revisar tablero',lat:-31.65,lng:-60.4,cliente:'NO GUARDAR',tenant_id:2,business_type:'electricidad',operacion_id:'987fbc97-4bed-4078-8f07-9141ba07c9f3'};
  const [first,second]=await Promise.all([request(app).post('/pedidos/mantenimiento-interno').send(payload),request(app).post('/pedidos/mantenimiento-interno').send(payload)]);
  expect([first.status,second.status].sort()).toEqual([200,201]);expect(first.body.id).toBe(second.body.id);
  await request(app).post('/pedidos/mantenimiento-interno').send({...payload,descripcion:'dato cambiado'}).expect(409);
  await request(app).post('/pedidos/mantenimiento-interno').send({...payload,business_type:'agua'}).expect(409);
  const response=first;auth.user={id:1,rol:'admin'};
  const r=await client.query('SELECT tenant_id,business_type,cliente,tipo_trabajo,descripcion,estado,tecnico_asignado_id,lat,lng,foto_base64 FROM pedidos WHERE id=$1',[response.body.id]);
  expect(r.rows[0]).toMatchObject({tenant_id:1,business_type:'electricidad',cliente:null,tipo_trabajo:'Mantenimiento interno',descripcion:'Revisar tablero',estado:'Pendiente',tecnico_asignado_id:null,lat:'-31.65',lng:'-60.4',foto_base64:null});
 });
 it('muchas altas simultáneas usan una sola conexión por transacción y admiten foto opcional',async()=>{
  auth.user={id:5,rol:'tecnico'};
  const responses=await Promise.all(Array.from({length:20},(_,i)=>request(app).post('/pedidos/mantenimiento-interno').send({
    descripcion:'Prueba '+i,lat:-31,lng:-60,business_type:'electricidad',operacion_id:randomUUID(),
    fotos:i===0?['data:image/jpeg;base64,YWJj']:[]
  })));
  expect(responses.every(x=>x.status===201)).toBe(true);
  expect(new Set(responses.map(x=>x.body.numero_pedido)).size).toBe(20);
  const photo=await client.query('SELECT foto_base64, tecnico_asignado_id FROM pedidos WHERE id=$1',[responses[0].body.id]);
  expect(photo.rows[0]).toEqual({foto_base64:'data:image/jpeg;base64,YWJj',tecnico_asignado_id:null});
  auth.user={id:1,rol:'admin'};
 },15000);
 it('ante dos administradores simultáneos, solo uno asigna y solo hay un aviso',async()=>{
  const [a,b]=await Promise.all([send([10,11]),send([11,10])]);expect([a.status,b.status].sort()).toEqual([200,409]);
  const r=await client.query('SELECT estado,tecnico_asignado_id,asignado_por_id FROM pedidos WHERE id IN (10,11) ORDER BY id');
  expect(r.rows).toEqual([{estado:'Asignado',tecnico_asignado_id:5,asignado_por_id:1},{estado:'Asignado',tecnico_asignado_id:5,asignado_por_id:1}]);
  const n=await client.query('SELECT usuario_id,pedido_id,cuerpo FROM notificaciones_movil');expect(n.rows).toHaveLength(1);expect(n.rows[0].usuario_id).toBe(5);expect(n.rows[0].pedido_id).toBe(null);expect(n.rows[0].cuerpo).toContain('PM-10');
 });
});
