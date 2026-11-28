import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {BufferJSON,initAuthCreds} from '@whiskeysockets/baileys';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('migración supervisada de Baileys en PostgreSQL descartable',()=>{
 let pool,db,apiDb,migrate,useAuth,lease,owned=false;
 const key=Buffer.alloc(32,9).toString('base64');
 const params={tenantId:1,sessionId:'default',expectedAccountJid:'5493436980000@s.whatsapp.net',confirmLegacyStopped:true,confirmBackup:true};
 const insert=async(id,v)=>db.query('INSERT INTO baileys_auth_state VALUES($1,$2,$3)',['default',id,JSON.stringify(v,BufferJSON.replacer)]);
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE baileys_auth_state(session_id text,key_id text,data_json text,PRIMARY KEY(session_id,key_id))');
  await db.query(readFileSync(new URL('../db/migrations/baileys_tenant_auth.sql',import.meta.url),'utf8'));
  await db.query(readFileSync(new URL('../db/migrations/baileys_legacy_migration.sql',import.meta.url),'utf8'));
  owned=true;process.env.DB_CONNECTION=dsn;process.env.BAILEYS_AUTH_ENCRYPTION_KEY=key;
  apiDb=await import('../db/neon.js');({migrateLegacyBaileysSession:migrate}=await import('../services/baileysMigrateLegacy.js'));
  ({usePostgresTenantAuthState:useAuth}=await import('../services/baileysTenantAuthPostgres.js'));
 });
 beforeEach(async()=>{
  await db.query('TRUNCATE baileys_legacy_imports,baileys_tenant_auth,baileys_auth_state,clientes; INSERT INTO clientes VALUES(1),(2)');
  const creds=initAuthCreds();creds.registered=true;creds.me={id:'5493436980000:1@s.whatsapp.net'};
  await insert('creds',creds);await insert('session-key-1',{secret:Buffer.from('secreto')});await insert('pre-key-3',{private:Buffer.from('privada')});await insert('app-state-sync-key-example',{keyData:Buffer.from([1,2,3])});
  lease={assertHeld:vi.fn(async()=>{}),release:vi.fn(async()=>{})};
 });
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_legacy_imports,baileys_tenant_auth,baileys_auth_state,clientes');db?.release();await pool?.end();delete process.env.BAILEYS_AUTH_ENCRYPTION_KEY});
 it('copia cifrada verificable a un tenant y conserva íntegro el origen',async()=>{
  const before=(await db.query('SELECT * FROM baileys_auth_state ORDER BY key_id')).rows;
  expect(await migrate(params,{acquireLease:async()=>lease})).toEqual({ok:true,tenantId:1,rows:4});
  expect((await db.query('SELECT * FROM baileys_auth_state ORDER BY key_id')).rows).toEqual(before);
  const auth=await useAuth(1,{keyBase64:key});expect(auth.state.creds.me.id).toBe('5493436980000:1@s.whatsapp.net');
  expect((await auth.state.keys.get('session',['key-1']))['key-1'].secret).toEqual(Buffer.from('secreto'));
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth WHERE tenant_id=2')).rows[0].n).toBe(0);
  expect(lease.release).toHaveBeenCalledOnce();
 });
 it('cuenta distinta y falta de confirmación no crean estado',async()=>{
  await expect(migrate({...params,confirmBackup:false},{acquireLease:async()=>lease})).rejects.toThrow(/confirmar/);
  await expect(migrate({...params,expectedAccountJid:'5493436989999@s.whatsapp.net'},{acquireLease:async()=>lease})).rejects.toThrow(/no coinciden/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
 });
 it('rechaza cualquier estado previo y categoría desconocida',async()=>{
  const a=await useAuth(1,{keyBase64:key});await a.saveCreds();
  await expect(migrate(params,{acquireLease:async()=>lease})).rejects.toThrow(/ya tiene estado/);
  await db.query('DELETE FROM baileys_tenant_auth');await insert('categoria-desconocida-x',{x:1});
  await expect(migrate(params,{acquireLease:async()=>lease})).rejects.toThrow(/desconocida/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
 });
 it('si falla una llave se revierte todo y se conserva el origen',async()=>{
  await db.query(`CREATE FUNCTION test_migrate_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='session' THEN RAISE EXCEPTION 'fallo'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER test_migrate_no_session BEFORE INSERT ON baileys_tenant_auth FOR EACH ROW EXECUTE FUNCTION test_migrate_fail()`);
  try{
   await expect(migrate(params,{acquireLease:async()=>lease})).rejects.toThrow();
   expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
   expect((await db.query('SELECT count(*)::int n FROM baileys_auth_state')).rows[0].n).toBe(4);
  }finally{await db.query('DROP TRIGGER test_migrate_no_session ON baileys_tenant_auth; DROP FUNCTION test_migrate_fail()')}
 });
 it('no importa si el tenant está ocupado o se pierde la coordinación',async()=>{
  await expect(migrate(params,{acquireLease:async()=>null})).rejects.toThrow(/activa/);
  lease.assertHeld.mockRejectedValue(Error('sin coordinación'));
  await expect(migrate(params,{acquireLease:async()=>lease})).rejects.toThrow(/coordinación/);
  expect(lease.release).toHaveBeenCalledOnce();
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
 });
 it('si el lease se pierde tras escribir, revierte toda la importación',async()=>{
  lease.assertHeld.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('se perdió el lease'));
  await expect(migrate(params,{acquireLease:async()=>lease})).rejects.toThrow(/lease/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
  expect((await db.query('SELECT count(*)::int n FROM baileys_auth_state')).rows[0].n).toBe(4);
  expect(lease.release).toHaveBeenCalledOnce();
 });

 it('impide importar la misma sesión a otro tenant',async()=>{
  await migrate(params,{acquireLease:async()=>lease});
  await expect(migrate({...params,tenantId:2},{acquireLease:async()=>lease})).rejects.toThrow(/ya fueron importados/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth WHERE tenant_id=2')).rows[0].n).toBe(0);
  expect((await db.query('SELECT tenant_id FROM baileys_legacy_imports WHERE legacy_session_id=$1',['default'])).rows[0].tenant_id).toBe(1);
 });
 it('un fallo revierte también el registro de la migración',async()=>{
  await expect(migrate({...params,expectedAccountJid:'5493436989999@s.whatsapp.net'},{acquireLease:async()=>lease})).rejects.toThrow();
  expect((await db.query('SELECT count(*)::int n FROM baileys_legacy_imports')).rows[0].n).toBe(0);
 });

});
