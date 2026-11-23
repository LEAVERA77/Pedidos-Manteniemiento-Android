import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import pg from 'pg';

// Test destructivo SOLO en una base local vacía dedicada; no Neon ni producción.
const dsn = process.env.NOTIF_TEST_DATABASE_URL || '';
if (dsn) {
  const u = new URL(dsn);
  if (!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname) || u.pathname !== '/gestornova_notifications_test') {
    throw new Error('La prueba requiere la base local descartable gestornova_notifications_test');
  }
}
vi.mock('../middleware/tenantHost.js', () => ({ tenantHostMiddleware: (_req,_res,next) => next() }));
vi.mock('../middleware/businessContext.js', () => ({ businessContextMiddleware: (_req,_res,next) => next() }));
vi.mock('../services/fcmPush.js', () => ({ upsertFcmToken: vi.fn() }));

describe.skipIf(!dsn)('notificaciones con PostgreSQL real', () => {
  let external, db, app, signToken;
  const created = [];
  beforeAll(async () => {
    process.env.DB_CONNECTION = dsn;
    process.env.AUTH_STRICT_TENANT = 'true';
    process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS = '1';
    external = new pg.Client({ connectionString: dsn }); await external.connect();
    await external.query('CREATE TABLE clientes(id integer PRIMARY KEY, activo boolean)'); created.push('clientes');
    await external.query('CREATE TABLE usuarios(id integer PRIMARY KEY, email text, nombre text, rol text, activo boolean, tenant_id integer)'); created.push('usuarios');
    await external.query('CREATE TABLE notificaciones_movil(id integer PRIMARY KEY, usuario_id integer, titulo text, cuerpo text, pedido_id integer, leida boolean)'); created.push('notificaciones_movil');
    await external.query("INSERT INTO clientes VALUES(1,true),(2,true)");
    await external.query("INSERT INTO usuarios VALUES(1,'a','A','admin',true,1),(2,'b','B','tecnico',true,2),(3,'c','C','tecnico',true,1)");
    await external.query("INSERT INTO notificaciones_movil VALUES(11,1,'a','a',1,false),(21,2,'b','b',2,false),(31,3,'c','c',3,false)");
    db=await import('../db/neon.js');
    const auth=await import('../middleware/auth.js'); signToken=auth.signToken;
    const router=(await import('../routes/notificaciones.js')).default;
    app=express(); app.use(express.json()); app.use('/notificaciones',router);
  });
  afterAll(async () => {
    if(db?.pool) await db.pool.end();
    if(external) { for(const t of created.reverse()) await external.query(`DROP TABLE ${t}`); await external.end(); }
    delete process.env.AUTH_STRICT_TENANT; delete process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS;
  });
  it('lectura y escritura solo del propietario; detecta cambios de sesión en BD', async () => {
    const t1=signToken({userId:1,tenant_id:1}), t2=signToken({userId:2,tenant_id:2,rol:'admin'});
    const get=(t)=>request(app).get('/notificaciones/pendientes').set('Authorization',`Bearer ${t}`);
    const mark=(t,id)=>request(app).patch(`/notificaciones/${id}/leer`).set('Authorization',`Bearer ${t}`);
    expect((await get(t1).expect(200)).body.rows.map(x=>x.id)).toEqual([11]);
    expect((await get(t2).expect(200)).body.rows.map(x=>x.id)).toEqual([21]);
    await mark(t1,21).expect(404);
    await mark(t1,31).expect(404);
    await mark(t2,21).expect(200);
    expect((await get(t2).expect(200)).body.rows).toEqual([]);
    const r=await external.query('SELECT id, leida FROM notificaciones_movil ORDER BY id');
    expect(r.rows).toEqual([{id:11,leida:false},{id:21,leida:true},{id:31,leida:false}]);
    await external.query('UPDATE usuarios SET tenant_id=1 WHERE id=2');
    await get(t2).expect(401);
    await external.query('UPDATE usuarios SET activo=false WHERE id=1');
    await get(t1).expect(401);
  });
});
