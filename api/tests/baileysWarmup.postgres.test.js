import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('warm-up Baileys en PostgreSQL descartable',()=>{
 let pool,db,apiDb,service,owned=false;
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');await db.query(readFileSync(new URL('../db/migrations/baileys_warmup_state.sql',import.meta.url),'utf8'));
  await db.query(readFileSync(new URL('../db/migrations/baileys_warmup_state.sql',import.meta.url),'utf8'));owned=true;process.env.DB_CONNECTION=dsn;
  apiDb=await import('../db/neon.js');service=await import('../services/baileysWarmup.js');
 });
 beforeEach(async()=>{await db.query('TRUNCATE baileys_admin_audit,baileys_warmup_state,clientes; INSERT INTO clientes VALUES(1),(2)')});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_admin_audit,baileys_warmup_state,usuarios,clientes');db?.release();await pool?.end()});
 it('reserva en concurrencia sin exceder cuota por día y solo confianza en días 1 a 3',async()=>{
  expect((await service.changeWarmupState(1,'activate')).day).toBe(1);
  expect((await service.reserveWarmupAttempt(1,{isTrusted:false})).error).toBe('trusted_contacts_only');
  const results=await Promise.all(Array.from({length:10},()=>service.reserveWarmupAttempt(1,{isTrusted:true})));
  expect(results.filter(x=>x.allowed)).toHaveLength(5);expect(results.filter(x=>x.error==='warmup_daily_limit')).toHaveLength(5);
  expect((await service.changeWarmupState(1,'status')).daily_sent).toBe(5);
  expect((await service.changeWarmupState(2,'status')).state).toBe('NOT_CONFIGURED');
 });
 it('pausa no omite cuota, puede reanudar y forzar listo de forma explícita',async()=>{
  await service.changeWarmupState(1,'activate');await service.reserveWarmupAttempt(1,{isTrusted:true});
  expect((await service.changeWarmupState(1,'pause')).state).toBe('PAUSED');
  expect((await service.reserveWarmupAttempt(1,{isTrusted:true})).allowed).toBe(false);
  expect((await service.changeWarmupState(1,'resume')).daily_sent).toBe(1);
  expect((await service.changeWarmupState(1,'force_ready')).state).toBe('READY');
  expect((await service.reserveWarmupAttempt(1)).allowed).toBe(true);
 });
 it('día 15 queda READY y desactiva el modo en la base',async()=>{
  await service.changeWarmupState(1,'activate');await db.query("UPDATE baileys_warmup_state SET warmup_started_at=NOW()-INTERVAL '15 days' WHERE tenant_id=1");
  expect((await service.changeWarmupState(1,'status')).state).toBe('READY');
  const r=await db.query('SELECT warmup_enabled FROM baileys_warmup_state WHERE tenant_id=1');expect(r.rows[0].warmup_enabled).toBe(false);
 });
 it('una pausa sigue bloqueando después del día 14 hasta reanudar',async()=>{
  await service.changeWarmupState(1,'activate');await service.changeWarmupState(1,'pause');
  await db.query("UPDATE baileys_warmup_state SET warmup_started_at=NOW()-INTERVAL '15 days' WHERE tenant_id=1");
  expect((await service.changeWarmupState(1,'status')).state).toBe('PAUSED');
  expect((await service.reserveWarmupAttempt(1,{isTrusted:true})).allowed).toBe(false);
  expect((await service.changeWarmupState(1,'resume')).state).toBe('READY');
  expect((await service.reserveWarmupAttempt(1)).allowed).toBe(true);
 });

});
