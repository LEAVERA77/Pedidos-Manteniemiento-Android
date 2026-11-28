import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('ventana y cuotas Baileys en PostgreSQL descartable',()=>{
 let pool,db,apiDb,guard,owned=false;
 const jid='5493436980000@s.whatsapp.net';
 const incoming=(id,text='hola',tenantId=1,j=jid)=>guard.recordInbound({tenantId,jid:j,messageId:id,text,messageTimestamp:Date.now()});
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY)');await db.query(readFileSync(new URL('../db/migrations/baileys_guard.sql',import.meta.url),'utf8'));
  await db.query(readFileSync(new URL('../db/migrations/baileys_guard.sql',import.meta.url),'utf8'));owned=true;process.env.DB_CONNECTION=dsn;
  apiDb=await import('../db/neon.js');const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  guard=createBaileysGuardPostgres({keyBase64:Buffer.alloc(32,6).toString('base64'),perMinute:12,perHour:20});
 });
 beforeEach(async()=>{await db.query('TRUNCATE baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes; INSERT INTO clientes VALUES(1),(2)')});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_guard_contacts,baileys_guard_inbound_ids,baileys_guard_limits,baileys_guard_attempts,clientes');db?.release();await pool?.end()});
 it('ventana responde solo a quien inició por tenant; rechaza eventos antiguos y repetidos',async()=>{
  expect(await guard.isReplyWindowOpen({tenantId:1,jid})).toBe(false);
  expect((await guard.recordInbound({tenantId:1,jid,messageId:'old',text:'hola',messageTimestamp:Date.now()-3600000})).reason).toBe('stale_message');
  expect((await incoming('a')).respond).toBe(true);expect((await incoming('a')).reason).toBe('duplicate_event');
  expect(await guard.isReplyWindowOpen({tenantId:1,jid})).toBe(true);expect(await guard.isReplyWindowOpen({tenantId:2,jid})).toBe(false);
  await db.query("UPDATE baileys_guard_contacts SET last_message_at=NOW()-INTERVAL '25 hours'");expect(await guard.isReplyWindowOpen({tenantId:1,jid})).toBe(false);
 });
 it('tres textos idénticos producen una sola respuesta y silencio por 15 minutos',async()=>{
  expect((await incoming('1')).respond).toBe(true);expect((await incoming('2')).respond).toBe(false);
  expect(await incoming('3')).toMatchObject({respond:false,muted:true});
  expect(await guard.isReplyWindowOpen({tenantId:1,jid})).toBe(false);
  expect(await guard.isReplyWindowOpen({tenantId:1,jid,automatic:false})).toBe(false);
  expect((await guard.checkAndReserve({tenantId:1,jid,automatic:false})).allowed).toBe(false);
 });
 it('reserva la cuota de forma transaccional entre procesos y conserva aislamiento',async()=>{
  await incoming('1');await incoming('2','hola',2);
  const results=await Promise.all(Array.from({length:20},()=>guard.checkAndReserve({tenantId:1,jid})));
  expect(results.filter(x=>x.allowed)).toHaveLength(12);expect(results.filter(x=>x.error==='rate_limit')).toHaveLength(8);
  expect((await guard.checkAndReserve({tenantId:2,jid})).allowed).toBe(true);
 });
 it('el espaciado persiste entre procesos y reserva un solo intento concurrente',async()=>{
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const opts={keyBase64:Buffer.alloc(32,6).toString('base64'),enforceSpacing:true,nextGapMs:()=>5500};
  const first=createBaileysGuardPostgres(opts),afterRestart=createBaileysGuardPostgres(opts);
  await incoming('1');await incoming('2','saludo',2);
  const many=await Promise.all(Array.from({length:12},(_,i)=>(i%2?first:afterRestart).checkAndReserve({tenantId:1,jid})));
  expect(many.filter(r=>r.allowed)).toHaveLength(1);
  expect(many.filter(r=>r.error==='spacing_wait')).toHaveLength(11);
  const wait=await afterRestart.checkAndReserve({tenantId:1,jid});
  expect(wait.error).toBe('spacing_wait');expect(wait.retry_after_ms).toBeGreaterThan(0);expect(wait.retry_after_ms).toBeLessThanOrEqual(5500);
  expect((await afterRestart.checkAndReserve({tenantId:2,jid})).allowed).toBe(true);
  expect((await db.query('SELECT count(*)::int AS n FROM baileys_guard_attempts WHERE tenant_id=1')).rows[0].n).toBe(1);
  await db.query("UPDATE baileys_guard_limits SET next_attempt_at=clock_timestamp()-INTERVAL '1 second' WHERE tenant_id=1");
  expect((await afterRestart.checkAndReserve({tenantId:1,jid})).allowed).toBe(true);
 });
 it('jitter fuera de límites revierte la reserva',async()=>{
  const {createBaileysGuardPostgres}=await import('../services/baileysGuardPostgres.js');
  const invalid=createBaileysGuardPostgres({keyBase64:Buffer.alloc(32,6).toString('base64'),enforceSpacing:true,nextGapMs:()=>1});
  await incoming('1');await expect(invalid.checkAndReserve({tenantId:1,jid})).rejects.toThrow(/Jitter/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_attempts')).rows[0].n).toBe(0);
 });
 it('el límite horario sigue vigente cuando los intentos ya no cuentan en el minuto',async()=>{
  await incoming('1');
  for(let i=0;i<12;i++)expect((await guard.checkAndReserve({tenantId:1,jid})).allowed).toBe(true);
  await db.query("UPDATE baileys_guard_attempts SET attempted_at=NOW()-INTERVAL '2 minutes'");
  for(let i=0;i<8;i++)expect((await guard.checkAndReserve({tenantId:1,jid})).allowed).toBe(true);
  expect((await guard.checkAndReserve({tenantId:1,jid})).error).toBe('rate_limit');
 });
 it('modo tormenta se activa solo con más de 25 remitentes distintos en un minuto',async()=>{
  let last;for(let i=0;i<26;i++)last=await incoming('m'+i,'hola',1,`54934369${String(i).padStart(4,'0')}@s.whatsapp.net`);
  expect(last.storm).toBe(true);
 });
 it('ventana usa fecha real y no retrocede ante un evento anterior',async()=>{
  const old=Date.now()-240000;
  await guard.recordInbound({tenantId:1,jid,messageId:'old-recent',text:'uno',messageTimestamp:old});
  const first=(await db.query('SELECT last_message_at FROM baileys_guard_contacts WHERE tenant_id=1')).rows[0].last_message_at.getTime();
  expect(first).toBe(old);
  await incoming('new','dos');
  const latest=(await db.query('SELECT last_message_at FROM baileys_guard_contacts WHERE tenant_id=1')).rows[0].last_message_at.getTime();
  await guard.recordInbound({tenantId:1,jid,messageId:'out-of-order',text:'tres',messageTimestamp:old});
  const after=(await db.query('SELECT last_message_at FROM baileys_guard_contacts WHERE tenant_id=1')).rows[0].last_message_at.getTime();
  expect(after).toBe(latest);
 });
 it('limpieza acotada por tenant conserva ventanas y mute vigentes',async()=>{
  await incoming('old','viejo');await incoming('current','actual',1,'5493436980001@s.whatsapp.net');
  await incoming('other','otro',2,jid);
  await guard.checkAndReserve({tenantId:1,jid});
  await db.query("UPDATE baileys_guard_contacts SET last_message_at=clock_timestamp()-INTERVAL '26 hours' WHERE tenant_id=1 AND contact_hmac=(SELECT contact_hmac FROM baileys_guard_contacts WHERE tenant_id=1 ORDER BY last_message_at LIMIT 1)");
  await db.query("UPDATE baileys_guard_inbound_ids SET created_at=clock_timestamp()-INTERVAL '3 days' WHERE tenant_id=1");
  await db.query("UPDATE baileys_guard_attempts SET attempted_at=clock_timestamp()-INTERVAL '3 hours' WHERE tenant_id=1");
  await db.query("UPDATE baileys_guard_contacts SET last_message_at=clock_timestamp()-INTERVAL '26 hours',muted_until=clock_timestamp()+INTERVAL '1 hour' WHERE tenant_id=2");
  const first=await guard.cleanupTenant({tenantId:1,batchSize:1});
  expect(first).toEqual({contacts:1,messages:1,attempts:1});
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_inbound_ids WHERE tenant_id=1')).rows[0].n).toBe(1);
  expect(await guard.isReplyWindowOpen({tenantId:1,jid:'5493436980001@s.whatsapp.net'})).toBe(true);
  expect((await guard.cleanupTenant({tenantId:2})).contacts).toBe(0);
  expect((await db.query('SELECT count(*)::int n FROM baileys_guard_inbound_ids WHERE tenant_id=2')).rows[0].n).toBe(1);
  await expect(guard.cleanupTenant({tenantId:1,batchSize:1001})).rejects.toThrow(/Lote/);
 });
 it('detecta tormenta con remitentes simultáneos del mismo tenant',async()=>{
  const results=await Promise.all(Array.from({length:26},(_,i)=>incoming('p'+i,'hola',1,`54934369${String(i).padStart(4,'0')}@s.whatsapp.net`)));
  expect(results.filter(x=>x.storm)).toHaveLength(1);
 });

});
