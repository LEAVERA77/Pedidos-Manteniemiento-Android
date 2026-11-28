import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('motor Baileys compuesto con PostgreSQL local y sockets simulados',()=>{
 let pool,db,apiDb,guard,safety,contacts,createRuntime,sockets,owned=false;
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
  for(const name of ['baileys_guard.sql','baileys_warmup_state.sql','baileys_tenant_safety.sql','baileys_trusted_contacts.sql'])await db.query(readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const {createBaileysTenantSafety}=await import('../services/baileysTenantSafety.js');
  ({createBaileysTenantRuntime:createRuntime}=await import('../services/baileysTenantRuntime.js'));
  const {createBaileysTrustedContacts}=await import('../services/baileysTrustedContacts.js');
  const keyBase64=Buffer.alloc(32,5).toString('base64');guard=createBaileysGuardPostgres({keyBase64});safety=createBaileysTenantSafety({keyBase64});contacts=createBaileysTrustedContacts({keyBase64});
 });
 beforeEach(async()=>{
  await db.query('TRUNCATE baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes,usuarios; INSERT INTO clientes VALUES(1),(2); INSERT INTO usuarios VALUES(1)');
  await db.query('INSERT INTO baileys_warmup_state(tenant_id,warmup_enabled,warmup_started_at) VALUES(1,true,clock_timestamp()),(2,true,clock_timestamp())');
  for(const tenantId of [1,2])await contacts.change({tenantId,jid:'5493436980000@s.whatsapp.net',actorUserId:1,action:'add'});sockets={};
 });
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_trusted_contacts_audit,baileys_trusted_contacts,baileys_tenant_safety_audit,baileys_tenant_safety,baileys_tenant_optout,baileys_admin_audit,baileys_warmup_state,baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,usuarios,clientes');db?.release();await pool?.end()});
 it('dos sockets llevan entrada, política y respuesta al tenant correcto',async()=>{
  let clock=100000;
  const runtime=createRuntime({guardStore:guard,safety,resolveTrusted:contacts.isTrusted,sleep:async ms=>{clock+=ms},now:()=>clock,random:()=>0,
   managerDependencies:{
    acquireLease:async()=>({assertHeld:async()=>{},release:async()=>{}}),
    loadAuth:async()=>({state:{creds:{},keys:{get:async()=>({}),set:async()=>{}}},saveCreds:async()=>{},flush:async()=>{}}),
    makeSocket:async({tenantId,browser,syncFullHistory})=>{expect(browser).toEqual(['GestorNova Web','Chrome','124.0.0']);expect(syncFullHistory).toBe(false);
     const s={ev:new EventEmitter(),ws:{close:vi.fn()},readMessages:vi.fn(async()=>{}),sendPresenceUpdate:vi.fn(async()=>{}),sendMessage:vi.fn(async()=>({id:'ok'}))};sockets[tenantId]=s;return s;},
    makeQr:async q=>q,
   },
   extractText:m=>m.message.conversation||'',isStop:text=>text==='STOP',buildPayload:async()=>({}),
   handleBot:async(_payload,tenantId,{sendReply,senderDigits})=>sendReply({tenantId,toDigits:senderDigits,bodyText:`respuesta ${tenantId}`}),
  });
  try{
   await Promise.all([runtime.start(1),runtime.start(2)]);
   for(const s of Object.values(sockets))s.ev.emit('connection.update',{connection:'open'});
   await vi.waitFor(()=>{expect(runtime.status(1).status).toBe('connected');expect(runtime.status(2).status).toBe('connected')});
   const jid='5493436980000@s.whatsapp.net';
   for(const n of [1,2])sockets[n].ev.emit('messages.upsert',{type:'notify',messages:[{key:{remoteJid:jid,id:'m'+n},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'hola'}}]});
   await vi.waitFor(()=>{expect(sockets[1].sendMessage).toHaveBeenCalledOnce();expect(sockets[2].sendMessage).toHaveBeenCalledOnce()},{timeout:3000});
   expect(sockets[1].sendMessage).toHaveBeenCalledWith(jid,{text:'respuesta 1'});
   expect(sockets[2].sendMessage).toHaveBeenCalledWith(jid,{text:'respuesta 2'});
   expect((await db.query('SELECT tenant_id FROM baileys_guard_attempts ORDER BY tenant_id')).rows).toEqual([{tenant_id:1},{tenant_id:2}]);
   expect(runtime.socketFor).toBeUndefined();
   expect((await db.query('SELECT tenant_id,warmup_daily_sent FROM baileys_warmup_state ORDER BY tenant_id')).rows).toEqual([{tenant_id:1,warmup_daily_sent:1},{tenant_id:2,warmup_daily_sent:1}]);
  }finally{await Promise.all([runtime.stop(1),runtime.stop(2)])}
 });
 it('STOP recibido con fallo de lease llega al puente y persiste cuarentena',async()=>{
  let failLease=false,lost;
  const runtime=createRuntime({guardStore:guard,safety,resolveTrusted:contacts.isTrusted,
   managerDependencies:{
    acquireLease:async(_tenant,onLost)=>{lost=onLost;return {assertHeld:async()=>{if(failLease){lost();throw Error('lease perdido')}},release:async()=>{}}},
    loadAuth:async()=>({state:{creds:{},keys:{get:async()=>({}),set:async()=>{}}},saveCreds:async()=>{},flush:async()=>{}}),
    makeSocket:async({tenantId})=>{const s={ev:new EventEmitter(),ws:{close:vi.fn()},readMessages:vi.fn(),sendPresenceUpdate:vi.fn(),sendMessage:vi.fn()};sockets[tenantId]=s;return s;},
    makeQr:async q=>q,
   },
   extractText:m=>m.message.conversation||'',isStop:text=>text==='STOP',buildPayload:vi.fn(),handleBot:vi.fn(),
  });
  try{
   await runtime.start(1);sockets[1].ev.emit('connection.update',{connection:'open'});
   await vi.waitFor(()=>expect(runtime.status(1).status).toBe('connected'));
   failLease=true;
   sockets[1].ev.emit('messages.upsert',{type:'notify',messages:[{key:{remoteJid:'5493436980000@s.whatsapp.net'},message:{conversation:'STOP'}}]});
   await vi.waitFor(async()=>expect((await safety.status(1)).reason).toBe('stop_unverified'),{timeout:3000});
   expect((await safety.status(1)).paused).toBe(true);expect(sockets[1].sendMessage).not.toHaveBeenCalled();
   expect(sockets[1].ws.close).toHaveBeenCalled();
  }finally{await runtime.stop(1)}
 });

});
