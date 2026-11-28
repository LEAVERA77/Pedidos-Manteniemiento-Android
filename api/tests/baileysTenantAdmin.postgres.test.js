import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
vi.mock('../services/whatsappBotTargetStore.js',async original=>({...await original(),ensureWhatsappBotActiveTargetSeeded:vi.fn(async()=>{})}));
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('administración warm-up con JWT real y PostgreSQL local',()=>{
 let pool,db,apiDb,app,token,runtime,owned=false;
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query(`CREATE TABLE clientes(id int PRIMARY KEY,activo boolean,tipo text,active_business_type text);
    CREATE TABLE usuarios(id int PRIMARY KEY,email text,nombre text,rol text,activo boolean,tenant_id int)`);
  for(const name of ['baileys_warmup_state.sql','baileys_guard.sql','baileys_tenant_safety.sql','baileys_trusted_contacts.sql','baileys_session_admin.sql'])
   await db.query(readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));owned=true;
  process.env.DB_CONNECTION=dsn;process.env.JWT_SECRET='prueba-local-jwt-para-baileys-sin-uso-productivo';process.env.AUTH_STRICT_TENANT='false';
  apiDb=await import('../db/neon.js');const auth=await import('../middleware/auth.js');token=(id,tid)=>auth.signToken({userId:id,tenant_id:tid});
  app=express();app.use(express.json());const route=await import('../routes/baileysTenantAdmin.js');
  runtime={status:vi.fn(id=>({tenant_id:id,status:'qr_ready',qr:`data:image/png;base64,AQ==`})),
   start:vi.fn(async id=>({tenant_id:id,status:'connecting'})),stop:vi.fn(async id=>({tenant_id:id,status:'stopped'}))};
  app.use('/blocked',route.default);app.use('/baileys',route.createBaileysTenantAdminRouter({enforcementReady:true}));
  app.use('/session',route.createBaileysTenantAdminRouter({enforcementReady:true,runtime}));
 });
 beforeEach(async()=>{
  runtime.status.mockClear();runtime.start.mockClear();runtime.stop.mockClear();
  process.env.BAILEYS_MULTITENANT_ENABLED='true';process.env.SQL_GATEWAY_DISABLED='true';process.env.BAILEYS_GUARD_HASH_KEY=Buffer.alloc(32,8).toString('base64');
  await db.query(`TRUNCATE baileys_session_admin_audit,baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,baileys_admin_audit,baileys_warmup_state,usuarios,clientes RESTART IDENTITY;
   INSERT INTO clientes VALUES(1,true,'cooperativa_electrica','electricidad'),(2,true,'cooperativa_electrica','electricidad');
   INSERT INTO usuarios VALUES(1,'a@test','A','admin',true,1),(2,'b@test','B','admin',true,2),(3,'c@test','C','tecnico',true,1),(4,'d@test','D','admin',false,1)`);
 });
 afterAll(async()=>{delete process.env.BAILEYS_MULTITENANT_ENABLED;delete process.env.SQL_GATEWAY_DISABLED;delete process.env.BAILEYS_GUARD_HASH_KEY;if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_session_admin_audit,baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,baileys_admin_audit,baileys_warmup_state,usuarios,clientes');db?.release();await pool?.end()});
 const post=(t,action,b={})=>request(app).post('/baileys/warmup/'+action).set('Authorization',`Bearer ${t}`).send(b);
 const get=t=>request(app).get('/baileys/warmup').set('Authorization',`Bearer ${t}`);
 it('solo administrador autenticado del tenant; parámetros no pueden apuntar a otro',async()=>{
  await request(app).get('/baileys/warmup').expect(401);await get('invalid').expect(401);
  await get(token(3,1)).expect(403);await get(token(4,1)).expect(401);await get(token(1,2)).expect(403);
  await post(token(1,1),'activate',{tenant_id:2}).expect(400);
  const a=await post(token(1,1),'activate').expect(200);expect(a.body).toMatchObject({tenant_id:1,warmup:{state:'WARMING',day:1}});
  const b=await get(token(2,2)).expect(200);expect(b.body).toMatchObject({tenant_id:2,warmup:{state:'NOT_CONFIGURED'}});
  expect(a.headers['cache-control']).toBe('no-store');
 });
 it('fuerza READY solo con confirmación explícita y deja auditoría en la transacción',async()=>{
  const t=token(1,1);await post(t,'activate').expect(200);await post(t,'force-ready').expect(400);
  await post(t,'pause').expect(200);await post(t,'resume').expect(200);
  const r=await post(t,'force-ready',{confirmar:true}).expect(200);expect(r.body.warmup.state).toBe('READY');
  const rows=await db.query('SELECT tenant_id,usuario_id,action FROM baileys_admin_audit ORDER BY id');
  expect(rows.rows).toEqual(['activate','pause','resume','force_ready'].map(action=>({tenant_id:1,usuario_id:1,action})));
 });
 it('el router montado por defecto permanece bloqueado aun con flags activas',async()=>{
  await request(app).post('/blocked/warmup/activate').set('Authorization',`Bearer ${token(1,1)}`).send({}).expect(503);
  expect((await db.query('SELECT count(*)::int n FROM baileys_warmup_state')).rows[0].n).toBe(0);
 });
 it('bandera apagada o gateway SQL habilitado impiden el panel sin cambiar la base',async()=>{
  process.env.BAILEYS_MULTITENANT_ENABLED='false';await post(token(1,1),'activate').expect(503);
  process.env.BAILEYS_MULTITENANT_ENABLED='true';process.env.SQL_GATEWAY_DISABLED='false';await post(token(1,1),'activate').expect(503);
  expect((await db.query('SELECT count(*)::int n FROM baileys_warmup_state')).rows[0].n).toBe(0);
 });
 it('solo admin del tenant reanuda una pausa revisada, con auditoría',async()=>{
  await db.query("INSERT INTO baileys_tenant_safety(tenant_id,paused,reason) VALUES(1,true,'unresolved_stop'),(2,true,'stop_unverified')");
  const url='/baileys/safety/resume',good={confirmar_revision:true,motivo_actual:'unresolved_stop'};
  await request(app).post(url).send(good).expect(401);
  await request(app).post(url).set('Authorization',`Bearer ${token(3,1)}`).send(good).expect(403);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,2)}`).send(good).expect(403);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send({...good,tenant_id:2}).expect(400);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send({confirmar_revision:false,motivo_actual:'unresolved_stop'}).expect(400);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send({...good,motivo_actual:'stop_unverified'}).expect(409);
  await request(app).get('/baileys/safety').set('Authorization',`Bearer ${token(1,1)}`).expect(200).expect('Cache-Control','no-store');
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send(good).expect(200);
  expect((await db.query('SELECT tenant_id,paused FROM baileys_tenant_safety ORDER BY tenant_id')).rows).toEqual([{tenant_id:1,paused:false},{tenant_id:2,paused:true}]);
  expect((await db.query('SELECT tenant_id,usuario_id,action FROM baileys_tenant_safety_audit')).rows).toEqual([{tenant_id:1,usuario_id:1,action:'resume'}]);
 });
 it('el router real bloqueado no reanuda aunque las flags estén activas',async()=>{
  await request(app).post('/blocked/safety/resume').set('Authorization',`Bearer ${token(1,1)}`).send({confirmar_revision:true,motivo_actual:'unresolved_stop'}).expect(503);
 });

 it('contactos de confianza exigen admin del tenant, confirmación y dejan auditoría',async()=>{
  const url='/baileys/trusted-contacts/add',valid={telefono:'5493436980000',confirmar:true};
  await request(app).post(url).send(valid).expect(401);
  await request(app).post(url).set('Authorization',`Bearer ${token(3,1)}`).send(valid).expect(403);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,2)}`).send(valid).expect(403);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send({...valid,tenant_id:2}).expect(400);
  await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send({...valid,confirmar:false}).expect(400);
  const added=await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send(valid).expect(200);expect(added.body.changed).toBe(true);
  const again=await request(app).post(url).set('Authorization',`Bearer ${token(1,1)}`).send(valid).expect(200);expect(again.body.changed).toBe(false);
  await request(app).post('/baileys/trusted-contacts/remove').set('Authorization',`Bearer ${token(1,1)}`).send(valid).expect(200);
  expect((await db.query('SELECT tenant_id,usuario_id,action FROM baileys_trusted_contacts_audit ORDER BY id')).rows).toEqual([
   {tenant_id:1,usuario_id:1,action:'add'},{tenant_id:1,usuario_id:1,action:'remove'}]);
 });

 it('QR y control de socket requieren admin autorizado y no aceptan tenant desde HTTP',async()=>{
  await request(app).get('/session/connection').expect(401);
  await request(app).get('/session/connection').set('Authorization',`Bearer ${token(3,1)}`).expect(403);
  await request(app).get('/session/connection').set('Authorization',`Bearer ${token(1,2)}`).expect(403);
  await request(app).get('/session/connection?tenant_id=2').set('Authorization',`Bearer ${token(1,1)}`).expect(400);
  const r=await request(app).get('/session/connection').set('Authorization',`Bearer ${token(1,1)}`).expect(200).expect('Cache-Control','no-store');
  expect(r.body).toEqual({ok:true,tenant_id:1,connection:{status:'qr_ready',qr:'data:image/png;base64,AQ=='}});
  await request(app).post('/session/connection/start').set('Authorization',`Bearer ${token(1,1)}`).send({tenant_id:2}).expect(400);
  await request(app).post('/session/connection/start').set('Authorization',`Bearer ${token(1,1)}`).send({}).expect(200);
  await request(app).post('/session/connection/stop').set('Authorization',`Bearer ${token(2,2)}`).send({}).expect(200);
  expect(runtime.start).toHaveBeenCalledWith(1);expect(runtime.stop).toHaveBeenCalledWith(2);
  expect((await db.query('SELECT tenant_id,usuario_id,action FROM baileys_session_admin_audit ORDER BY id')).rows).toEqual([
   {tenant_id:1,usuario_id:1,action:'start_request'},{tenant_id:2,usuario_id:2,action:'stop_request'}]);
 });
 it('estado discordante jamás devuelve el QR y el router montado sigue bloqueado',async()=>{
  runtime.status.mockReturnValueOnce({tenant_id:2,status:'qr_ready',qr:'data:image/png;base64,QUJD'});
  const r=await request(app).get('/session/connection').set('Authorization',`Bearer ${token(1,1)}`).expect(503);
  expect(JSON.stringify(r.body)).not.toContain('QUJD');
  await request(app).get('/blocked/connection').set('Authorization',`Bearer ${token(1,1)}`).expect(503);
 });

});
