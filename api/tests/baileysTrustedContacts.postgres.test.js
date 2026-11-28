import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('contactos confiables para respuestas Baileys',()=>{
 let pool,db,apiDb,contacts,owned=false;
 const jid='5493436980000@s.whatsapp.net',alias='543436980000@s.whatsapp.net';
 const change=(tenantId,action,actorUserId=1)=>contacts.change({tenantId,jid,actorUserId,action});
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:dsn});db=await pool.connect();
  if((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].n!==0)throw Error('La base descartable no está vacía');
  await db.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
  const sql=readFileSync(new URL('../db/migrations/baileys_trusted_contacts.sql',import.meta.url),'utf8');await db.query(sql);await db.query(sql);
  owned=true;process.env.DB_CONNECTION=dsn;apiDb=await import('../db/neon.js');
  const {createBaileysTrustedContacts}=await import('../services/baileysTrustedContacts.js');contacts=createBaileysTrustedContacts({keyBase64:Buffer.alloc(32,6).toString('base64')});
 });
 beforeEach(async()=>{await db.query('TRUNCATE baileys_trusted_contacts_audit,baileys_trusted_contacts,clientes,usuarios RESTART IDENTITY; INSERT INTO clientes VALUES(1),(2); INSERT INTO usuarios VALUES(1)')});
 afterAll(async()=>{if(apiDb?.pool)await apiDb.pool.end();if(owned)await db.query('DROP TABLE baileys_trusted_contacts_audit,baileys_trusted_contacts,clientes,usuarios');db?.release();await pool?.end()});
 it('confianza por tenant, alias argentino y auditoría de cambios efectivos',async()=>{
  expect(await contacts.isTrusted({tenantId:1,jid})).toBe(false);
  expect(await change(1,'add')).toEqual({changed:true,trusted:true});expect(await change(1,'add')).toEqual({changed:false,trusted:true});
  expect(await contacts.isTrusted({tenantId:1,jid:alias})).toBe(true);expect(await contacts.isTrusted({tenantId:2,jid})).toBe(false);
  expect(await change(1,'remove')).toEqual({changed:true,trusted:false});expect(await contacts.isTrusted({tenantId:1,jid})).toBe(false);
  expect((await db.query('SELECT tenant_id,usuario_id,action FROM baileys_trusted_contacts_audit ORDER BY id')).rows).toEqual([
   {tenant_id:1,usuario_id:1,action:'add'},{tenant_id:1,usuario_id:1,action:'remove'}]);
 });
 it('si la auditoría falla revierte el cambio y rechaza JID no telefónico',async()=>{
  await expect(change(1,'add',999)).rejects.toThrow();expect(await contacts.isTrusted({tenantId:1,jid})).toBe(false);
  await expect(contacts.isTrusted({tenantId:1,jid:'123456789@lid'})).rejects.toThrow(/verificable/);
 });
 it('la revocación espera a la reserva que tiene la fila de confianza bloqueada',async()=>{
  await change(1,'add');const client=await pool.connect();
  try{
   await client.query('BEGIN');
   expect(await contacts.isTrusted({tenantId:1,jid,transaction:fn=>fn(client)})).toBe(true);
   let finished=false;const pending=change(1,'remove').then(x=>{finished=true;return x});
   await new Promise(r=>setTimeout(r,50));expect(finished).toBe(false);
   await client.query('COMMIT');expect((await pending).changed).toBe(true);
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release()}
 });
});
