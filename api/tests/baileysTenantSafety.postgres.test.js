import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('bajas y pausa durable de Baileys por tenant',()=>{
 let pool,db,apiDb,safety,owned=false;
 const jid='5493436980000@s.whatsapp.net',alias='543436980000@s.whatsapp.net';
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
  for(const name of ['baileys_guard.sql','baileys_tenant_safety.sql']){
   const sql=readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8');await db.query(sql);await db.query(sql);
  }
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  const {createBaileysTenantSafety}=await import('../services/baileysTenantSafety.js');
  safety=createBaileysTenantSafety({keyBase64:Buffer.alloc(32,6).toString('base64')});
 });
 beforeEach(async()=>{await db.query('TRUNCATE baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes,usuarios; INSERT INTO clientes VALUES(1),(2); INSERT INTO usuarios VALUES(1)')});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes,usuarios');db?.release();await pool?.end()});
 it('STOP es idempotente, por tenant y cubre la variante móvil argentina',async()=>{
  await Promise.all(Array.from({length:6},()=>safety.recordStop({tenantId:1,jid})));
  expect(await safety.checkForSend({tenantId:1,jid:alias})).toMatchObject({allowed:false,error:'contact_opted_out'});
  expect(await safety.checkForSend({tenantId:2,jid})).toMatchObject({allowed:true});
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_optout')).rows[0].n).toBe(1);
  expect(JSON.stringify((await db.query("SELECT encode(contact_hmac,'hex') h FROM baileys_tenant_optout")).rows)).not.toContain('5493436980000');
 });
 it('un STOP sin identidad resuelta pausa todo el tenant durablemente',async()=>{
  await safety.pauseTenant({tenantId:1,reason:'unresolved_stop'});
  expect(await safety.status(1)).toMatchObject({paused:true,reason:'unresolved_stop'});
  expect(await safety.checkForSend({tenantId:1,jid})).toMatchObject({allowed:false,error:'tenant_safety_paused'});
  expect(await safety.checkForSend({tenantId:2,jid})).toMatchObject({allowed:true});
 });
 it('rechaza identificadores no confiables y falta de base sin abrir permiso',async()=>{
  await expect(safety.recordStop({tenantId:1,jid:'123456789@lid'})).rejects.toThrow(/verificable/);
  await expect(safety.pauseTenant({tenantId:1,reason:'cliente'})).rejects.toThrow(/inválido/);
  await expect(safety.checkForSend({tenantId:0,jid})).rejects.toThrow(/Tenant/);
  await expect(safety.checkForSend({tenantId:1,jid,transaction:async()=>{throw Error('DB caída')}})).rejects.toThrow(/DB caída/);
 });
 it('reanudar requiere motivo vigente y audita sin quitar bajas individuales',async()=>{
  await safety.recordStop({tenantId:1,jid});await safety.pauseTenant({tenantId:1,reason:'unresolved_stop'});
  await expect(safety.resumeTenant({tenantId:1,actorUserId:1,expectedReason:'stop_unverified',expectedRevision:'1'})).rejects.toThrow(/cambió/);
  expect((await safety.status(1)).paused).toBe(true);
  expect(await safety.resumeTenant({tenantId:1,actorUserId:1,expectedReason:'unresolved_stop',expectedRevision:'1'})).toEqual({paused:false});
  expect((await safety.checkForSend({tenantId:1,jid})).error).toBe('contact_opted_out');
  expect((await db.query('SELECT tenant_id,usuario_id,action,previous_reason FROM baileys_tenant_safety_audit')).rows).toEqual([
   {tenant_id:1,usuario_id:1,action:'resume',previous_reason:'unresolved_stop'}]);
 });
 it('una pausa posterior con el mismo motivo invalida una revisión anterior',async()=>{
  await safety.pauseTenant({tenantId:1,reason:'unresolved_stop'});
  const first=await safety.status(1);expect(first.revision).toBe('1');
  await safety.pauseTenant({tenantId:1,reason:'unresolved_stop'});
  const second=await safety.status(1);expect(second.revision).toBe('2');
  await expect(safety.resumeTenant({tenantId:1,actorUserId:1,expectedReason:first.reason,expectedRevision:first.revision})).rejects.toThrow(/cambió/);
  expect((await safety.status(1)).paused).toBe(true);
  await expect(safety.resumeTenant({tenantId:1,actorUserId:1,expectedReason:second.reason,expectedRevision:second.revision})).resolves.toEqual({paused:false});
 });
 it('si falla la auditoría revierte el desbloqueo',async()=>{
  await safety.pauseTenant({tenantId:1,reason:'stop_unverified'});
  await expect(safety.resumeTenant({tenantId:1,actorUserId:999,expectedReason:'stop_unverified',expectedRevision:'1'})).rejects.toThrow();
  expect((await safety.status(1)).paused).toBe(true);
 });

});
