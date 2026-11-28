import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import pg from 'pg';
const {sender}=vi.hoisted(()=>({sender:vi.fn(async()=>({ok:true,data:{}}))}));
vi.mock('../services/baileysWhatsapp.js',()=>({sendText:sender}));
vi.mock('../services/whatsappNotificacionesLog.js',()=>({logWhatsappMensajeEnviado:vi.fn(async()=>{}),logWhatsappMensajeRecibido:vi.fn(async()=>{})}));
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('sesión global Baileys: aislamiento tenant para envíos principales',()=>{
 let pool,db,apiDb,svc,owned=false;
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('Base descartable no vacía');
  await db.query('CREATE TABLE configuracion(key text primary key,value text)');owned=true;
  process.env.DB_CONNECTION=dsn;process.env.WHATSAPP_PROVIDER='baileys';apiDb=await import('../db/neon.js');svc=await import('../services/whatsappService.js');
 });
 beforeEach(async()=>{sender.mockClear();await db.query("TRUNCATE configuracion; INSERT INTO configuracion VALUES ('whatsapp_bot_active_target','{\"tenant_id\":1,\"locked\":true}')")});
 afterAll(async()=>{delete process.env.WHATSAPP_PROVIDER;if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE configuracion');db?.release();await pool?.end()});
 const params={toDigits:'5493436980000',bodyText:'hola'};
 it('no deja que otro tenant use el socket global',async()=>{
  expect((await svc.sendTenantWhatsAppText({...params,tenantId:2})).error).toBe('baileys_tenant_not_verified');
  expect((await svc.sendBotWhatsAppText({...params,tenantId:2,webhookPhoneNumberId:'baileys-bot'})).error).toBe('baileys_tenant_not_verified');
  expect(sender).not.toHaveBeenCalled();
  expect((await svc.sendTenantWhatsAppText({...params,tenantId:1})).ok).toBe(true);expect(sender).toHaveBeenCalledTimes(1);
 });
 it('falla cerrado si no hay target locked, identidad o tabla disponible',async()=>{
  await db.query("UPDATE configuracion SET value='{\"tenant_id\":1,\"locked\":false}'");
  expect((await svc.sendTenantWhatsAppText({...params,tenantId:1})).ok).toBe(false);
  await db.query("UPDATE configuracion SET value='no json'");expect((await svc.sendTenantWhatsAppText({...params,tenantId:1})).ok).toBe(false);
  expect((await svc.sendTenantWhatsAppText({...params})).ok).toBe(false);expect(sender).not.toHaveBeenCalled();
 });
});
