import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL || '';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('sesión Baileys cifrada por tenant en PostgreSQL descartable',()=>{
 let pool,db,apiDb,useAuth,owned=false;
 const key=Buffer.alloc(32,9).toString('base64'),other=Buffer.alloc(32,4).toString('base64');
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes (id integer PRIMARY KEY)');
  await db.query(readFileSync(new URL('../db/migrations/baileys_tenant_auth.sql',import.meta.url),'utf8'));
  await db.query(readFileSync(new URL('../db/migrations/baileys_tenant_auth.sql',import.meta.url),'utf8'));
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  ({usePostgresTenantAuthState:useAuth}=await import('../services/baileysTenantAuthPostgres.js'));
 });
 beforeEach(async()=>{await db.query('TRUNCATE baileys_tenant_auth,clientes; INSERT INTO clientes VALUES (1),(2)')});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_tenant_auth,clientes');db?.release();await pool?.end()});
 it('restaura credenciales y claves por tenant sin guardar texto plano',async()=>{
  const a=await useAuth(1,{keyBase64:key}),b=await useAuth(2,{keyBase64:key});
  a.state.creds.me={id:'secreto-tenant-uno'};b.state.creds.me={id:'secreto-tenant-dos'};
  await Promise.all([a.saveCreds(),b.saveCreds()]);
  await a.state.keys.set({session:{foo:{key:Buffer.from([1,2,3]),secret:'privado'}},'app-state-sync-key':{bar:{keyData:Buffer.from([4])}}});
  const restored=await useAuth(1,{keyBase64:key}),second=await useAuth(2,{keyBase64:key});
  expect(restored.state.creds.me.id).toBe('secreto-tenant-uno');expect(second.state.creds.me.id).toBe('secreto-tenant-dos');
  expect((await restored.state.keys.get('session',['foo','missing'])).foo).toEqual({key:Buffer.from([1,2,3]),secret:'privado'});
  expect((await second.state.keys.get('session',['foo'])).foo).toBeNull();
  const rows=await db.query("SELECT encode(ciphertext,'hex') ct FROM baileys_tenant_auth");
  expect(JSON.stringify(rows.rows)).not.toContain(Buffer.from('privado').toString('hex'));
 });
 it('lote de claves omite cambios idénticos y el borrado afecta solo tenant',async()=>{
  const a=await useAuth(1,{keyBase64:key}),b=await useAuth(2,{keyBase64:key});
  await a.state.keys.set({session:{a:{n:1},b:{n:2}}});await b.state.keys.set({session:{a:{n:9}}});
  const row=await db.query("SELECT encode(nonce,'hex') nonce,updated_at FROM baileys_tenant_auth WHERE tenant_id=1 AND category='session' AND key_id='a'");
  await a.state.keys.set({session:{a:{n:1},b:null,c:{n:3}}});
  const again=await db.query("SELECT encode(nonce,'hex') nonce,updated_at FROM baileys_tenant_auth WHERE tenant_id=1 AND category='session' AND key_id='a'");
  expect(again.rows).toEqual(row.rows);expect(await a.state.keys.get('session',['a','b','c'])).toEqual({a:{n:1},b:null,c:{n:3}});
  expect(await b.state.keys.get('session',['a'])).toEqual({a:{n:9}});
 });
 it('si falla el borrado de un lote se revierte también el alta del mismo lote',async()=>{
  const a=await useAuth(1,{keyBase64:key});await a.state.keys.set({session:{previa:{n:1}}});
  await db.query(`CREATE FUNCTION test_baileys_delete_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo simulado'; END $$;
    CREATE TRIGGER test_baileys_no_delete BEFORE DELETE ON baileys_tenant_auth FOR EACH ROW EXECUTE FUNCTION test_baileys_delete_fail()`);
  try {
   await expect(a.state.keys.set({session:{previa:null,nueva:{n:2}}})).rejects.toThrow();
   const rows=(await db.query("SELECT key_id FROM baileys_tenant_auth WHERE tenant_id=1 ORDER BY key_id")).rows;
   expect(rows).toEqual([{key_id:'previa'}]);
  } finally {await db.query('DROP TRIGGER test_baileys_no_delete ON baileys_tenant_auth; DROP FUNCTION test_baileys_delete_fail()')}
 });
 it('clave equivocada o datos corruptos fallan cerrado sin borrar ni regenerar',async()=>{
  const a=await useAuth(1,{keyBase64:key});await a.saveCreds();
  await expect(useAuth(1,{keyBase64:other})).rejects.toThrow(/ilegible/);
  await db.query("UPDATE baileys_tenant_auth SET auth_tag=decode(repeat('00',16),'hex') WHERE tenant_id=1");
  await expect(useAuth(1,{keyBase64:key})).rejects.toThrow(/ilegible/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(1);
 });
 it('no crea credenciales nuevas si quedan llaves de una sesión incompleta',async()=>{
  const a=await useAuth(1,{keyBase64:key});await a.state.keys.set({session:{a:{n:1}}});
  await expect(useAuth(1,{keyBase64:key})).rejects.toThrow(/incompleto/);
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(1);
 });
 it('no acepta tenant sin identificar ni clave insegura',async()=>{
  await expect(useAuth(0,{keyBase64:key})).rejects.toThrow(/Tenant/);
  await expect(useAuth(1,{keyBase64:'abc'})).rejects.toThrow(/base64/);
 });
 it('no continúa usando el estado si falló una transacción',async()=>{
  const a=await useAuth(1,{keyBase64:key,transaction:async()=>{throw Error('fallo de base')}});
  await expect(a.state.keys.set({session:{a:{n:1}}})).rejects.toThrow('fallo de base');
  await expect(a.state.keys.get('session',['a'])).rejects.toThrow('fallo de base');
  expect((await db.query('SELECT count(*)::int n FROM baileys_tenant_auth')).rows[0].n).toBe(0);
 });
});
