import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('puente y reservas Baileys en PostgreSQL descartable',()=>{
 let pool,db,apiDb,guardStore,policy,safety,queue,bridge,manager,socks,owned=false;
 const jid='5493436980000@s.whatsapp.net';
 const event=(tenantId,id,text='hola')=>({tenantId,socket:socks[tenantId],message:{key:{remoteJid:jid,id},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:text}}});
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
  for(const name of ['baileys_guard.sql','baileys_warmup_state.sql','baileys_tenant_safety.sql'])await db.query(readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const {createBaileysPolicy}=await import('../services/baileysPolicy.js');
  const {createBaileysGuard}=await import('../services/baileysGuard.js');
  const {createBaileysTenantInbound}=await import('../services/baileysTenantInbound.js');
  guardStore=createBaileysGuardPostgres({keyBase64:Buffer.alloc(32,4).toString('base64')});
  const {createBaileysTenantSafety}=await import('../services/baileysTenantSafety.js');
  safety=createBaileysTenantSafety({keyBase64:Buffer.alloc(32,4).toString('base64')});
  policy=createBaileysPolicy({guard:guardStore,safety,resolveTrusted:async()=>true});
  let clock=100000;manager={socketFor:id=>socks[id],assertHeld:vi.fn(async()=>{}),stop:vi.fn(async()=>{})};
  queue=createBaileysGuard({isReplyWindowOpen:guardStore.isReplyWindowOpen,checkAndReserve:policy.checkAndReserve,
   assertLease:manager.assertHeld,sleep:async ms=>{clock+=ms},now:()=>clock,random:()=>0});
  bridge=createBaileysTenantInbound({manager,guardStore,queue,extractText:m=>m.message.conversation,isStop:t=>t==='STOP',recordStop:safety.recordStop,pauseTenant:safety.pauseTenant,
   buildPayload:async()=>({}),handleBot:async(_payload,tenant,{sendReply,senderDigits})=>sendReply({tenantId:tenant,toDigits:senderDigits,bodyText:'respuesta'})});
 });
 beforeEach(async()=>{
  await db.query('TRUNCATE baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes; INSERT INTO clientes VALUES(1),(2)');
  await db.query('INSERT INTO baileys_warmup_state(tenant_id,warmup_forced_ready) VALUES(1,true),(2,true)');
  const makeSock=()=>({readMessages:vi.fn(async()=>{}),sendPresenceUpdate:vi.fn(async()=>{}),sendMessage:vi.fn(async()=>({id:'sent'}))});
  socks={1:makeSock(),2:makeSock()};
 });
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,usuarios,clientes');db?.release();await pool?.end()});
 it('la ventana y la reserva se crean solo para el tenant que recibió el mensaje',async()=>{
  expect((await bridge.onInbound(event(1,'one'))).reason).toBe('handled');
  expect(socks[1].sendMessage).toHaveBeenCalledOnce();expect(socks[2].sendMessage).not.toHaveBeenCalled();
  expect(await guardStore.isReplyWindowOpen({tenantId:1,jid})).toBe(true);
  expect(await guardStore.isReplyWindowOpen({tenantId:2,jid})).toBe(false);
  expect((await db.query('SELECT tenant_id FROM baileys_guard_attempts')).rows).toEqual([{tenant_id:1}]);
 });
 it('identidad repetida no reenvía y silencio bloquea el siguiente texto',async()=>{
  await bridge.onInbound(event(1,'one'));
  expect((await bridge.onInbound(event(1,'one'))).reason).toBe('duplicate_event');
  expect((await bridge.onInbound(event(1,'two'))).reason).toBe('suppressed');
  expect((await bridge.onInbound(event(1,'three'))).reason).toBe('suppressed');
  expect((await bridge.onInbound(event(1,'four','otro'))).reason).toBe('suppressed');
  expect(socks[1].sendMessage).toHaveBeenCalledOnce();
 });
 it('STOP persistido impide más envíos al contacto aunque vuelva a escribir',async()=>{
  await bridge.onInbound(event(1,'one'));
  expect((await bridge.onInbound(event(1,'stop','STOP'))).reason).toBe('stop_recorded');
  await bridge.onInbound(event(1,'two','otro texto'));
  expect(socks[1].sendMessage).toHaveBeenCalledOnce();
  expect((await safety.checkForSend({tenantId:1,jid})).error).toBe('contact_opted_out');
 });
 it('STOP de LID pausa al tenant también para otros contactos',async()=>{
  const task=event(1,'stop','STOP');task.message.key.remoteJid='999999999999@lid';
  expect((await bridge.onInbound(task)).reason).toBe('unresolved_stop');
  expect((await safety.status(1)).paused).toBe(true);
  await bridge.onInbound(event(1,'one'));
  expect(socks[1].sendMessage).not.toHaveBeenCalled();
  expect((await safety.checkForSend({tenantId:2,jid})).allowed).toBe(true);
 });

});
