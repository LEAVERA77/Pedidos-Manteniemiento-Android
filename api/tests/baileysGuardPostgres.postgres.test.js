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
  expect(await guard.isReplyWindowOpen({tenantId:1,jid,automatic:false})).toBe(true);
 });
 it('reserva la cuota de forma transaccional entre procesos y conserva aislamiento',async()=>{
  await incoming('1');await incoming('2','hola',2);
  const results=await Promise.all(Array.from({length:20},()=>guard.checkAndReserve({tenantId:1,jid})));
  expect(results.filter(x=>x.allowed)).toHaveLength(12);expect(results.filter(x=>x.error==='rate_limit')).toHaveLength(8);
  expect((await guard.checkAndReserve({tenantId:2,jid})).allowed).toBe(true);
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
});
