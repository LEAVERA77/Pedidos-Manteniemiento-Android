import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('política Baileys: cuotas y warm-up en transacción',()=>{
 let pool,db,apiDb,guard,policy,warmup,safety,owned=false,trusted;
 const jid='5493436980000@s.whatsapp.net';
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
  for(const name of ['baileys_guard.sql','baileys_warmup_state.sql','baileys_tenant_safety.sql','baileys_trusted_contacts.sql'])await db.query(readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const {createBaileysPolicy}=await import('../services/baileysPolicy.js');
  warmup=await import('../services/baileysWarmup.js');
  guard=createBaileysGuardPostgres({keyBase64:Buffer.alloc(32,7).toString('base64')});
  const {createBaileysTenantSafety}=await import('../services/baileysTenantSafety.js');
  safety=createBaileysTenantSafety({keyBase64:Buffer.alloc(32,7).toString('base64')});
  policy=createBaileysPolicy({guard,safety,resolveTrusted:async()=>trusted});
 });
 beforeEach(async()=>{
  await db.query('TRUNCATE baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes,usuarios; INSERT INTO clientes VALUES(1),(2); INSERT INTO usuarios VALUES(1)');
  trusted=true;
  await guard.recordInbound({tenantId:1,jid,messageId:'one',text:'hola',messageTimestamp:Date.now()});
  await warmup.changeWarmupState(1,'activate');
 });
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,usuarios,clientes');db?.release();await pool?.end()});
 it('rechaza sin confianza sin consumir cuotas',async()=>{
  trusted=false;expect((await policy.checkAndReserve({tenantId:1,jid})).error).toBe('trusted_contacts_only');
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
  expect((await warmup.changeWarmupState(1,'status')).daily_sent).toBe(0);
 });
 it('reserva los dos límites una sola vez aun con concurrencia',async()=>{
  const results=await Promise.all(Array.from({length:15},()=>policy.checkAndReserve({tenantId:1,jid})));
  expect(results.filter(r=>r.allowed)).toHaveLength(5);
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(5);
  expect((await warmup.changeWarmupState(1,'status')).daily_sent).toBe(5);
 });
 it('no extiende el permiso de respuesta a otros tenants',async()=>{
  await warmup.changeWarmupState(2,'activate');
  expect((await policy.checkAndReserve({tenantId:2,jid})).allowed).toBe(false);
  expect((await warmup.changeWarmupState(2,'status')).daily_sent).toBe(0);
 });
 it('falla cerrado si la confianza no se verifica',async()=>{
  trusted=undefined;await expect(policy.checkAndReserve({tenantId:1,jid})).rejects.toThrow(/confianza/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
 });
 it('un error durante warm-up revierte también la reserva de cuota',async()=>{
  const {createBaileysPolicy}=await import('../services/baileysPolicy.js');
  const failing=createBaileysPolicy({guard,safety,resolveTrusted:async()=>true,warmup:async(tenant,{transaction})=>transaction(async client=>{
   await client.query('UPDATE baileys_warmup_state SET warmup_daily_sent=42 WHERE tenant_id=$1',[tenant]);
   throw Error('fallo simulado');
  })});
  await expect(failing.checkAndReserve({tenantId:1,jid})).rejects.toThrow('fallo simulado');
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
  expect((await warmup.changeWarmupState(1,'status')).daily_sent).toBe(0);
 });

 it('la separación durable y warm-up se confirman juntas o se revierten',async()=>{
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const {createBaileysPolicy}=await import('../services/baileysPolicy.js');
  const spaced=createBaileysGuardPostgres({keyBase64:Buffer.alloc(32,7).toString('base64'),enforceSpacing:true,nextGapMs:()=>5500});
  const combined=createBaileysPolicy({guard:spaced,safety,resolveTrusted:async()=>trusted});
  trusted=false;expect((await combined.checkAndReserve({tenantId:1,jid})).error).toBe('trusted_contacts_only');
  expect((await db.query('SELECT next_attempt_at FROM baileys_guard_limits WHERE tenant_id=1')).rows[0].next_attempt_at).toBeNull();
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
  trusted=true;expect((await combined.checkAndReserve({tenantId:1,jid})).allowed).toBe(true);
  expect((await combined.checkAndReserve({tenantId:1,jid})).error).toBe('spacing_wait');
  expect((await warmup.changeWarmupState(1,'status')).daily_sent).toBe(1);
 });
 it('una baja evita la reserva sin consumir cuota de minuto ni warm-up',async()=>{
  await safety.recordStop({tenantId:1,jid});
  expect((await policy.checkAndReserve({tenantId:1,jid})).error).toBe('contact_opted_out');
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
  expect((await warmup.changeWarmupState(1,'status')).daily_sent).toBe(0);
 });
 it('la pausa durable bloquea todas las reservas solo para el tenant afectado',async()=>{
  await safety.pauseTenant({tenantId:1,reason:'unresolved_stop'});
  expect((await policy.checkAndReserve({tenantId:1,jid})).error).toBe('tenant_safety_paused');
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
 });

 it('un contacto confiable no habilita iniciar conversaciones ni salta la ventana',async()=>{
  const {createBaileysTrustedContacts}=await import('../services/baileysTrustedContacts.js');
  const {createBaileysPolicy}=await import('../services/baileysPolicy.js');
  const trustedDb=createBaileysTrustedContacts({keyBase64:Buffer.alloc(32,7).toString('base64')});
  const strict=createBaileysPolicy({guard,safety,resolveTrusted:trustedDb.isTrusted});
  const stranger='5493436989999@s.whatsapp.net';
  await trustedDb.change({tenantId:1,jid:stranger,actorUserId:1,action:'add'});
  expect((await strict.checkAndReserve({tenantId:1,jid:stranger})).error).toBe('outside_reply_window_or_muted');
  await trustedDb.change({tenantId:1,jid,actorUserId:1,action:'add'});
  expect((await strict.checkAndReserve({tenantId:1,jid})).allowed).toBe(true);
  await trustedDb.change({tenantId:1,jid,actorUserId:1,action:'remove'});
  expect((await strict.checkAndReserve({tenantId:1,jid})).error).toBe('trusted_contacts_only');
 });

});
