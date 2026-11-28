/**
 * Ensayo LOCAL: una transacción, esquema único y ROLLBACK, sin API ni sockets.
 * No habilitar Neon ni quitar la restricción de DSN: requiere otro diseño auditado.
 */
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import pg from 'pg';

const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){
 const u=new URL(dsn);
 if(!['postgres:','postgresql:'].includes(u.protocol)||
    u.hostname!=='127.0.0.1'||u.port!=='55442'||
    u.pathname!=='/campo_offline_test'||u.search||u.hash)
  throw Error('Solo 127.0.0.1:55442/campo_offline_test, sin parámetros');
}

describe.skipIf(!dsn)('ensayo de esquema de staging, solo local y reversible',()=>{
 let client,pool,apiDb,createSafety,createTrusted;
 beforeAll(async()=>{
  // Los servicios importan el pool real al cargar, pero se les inyecta el cliente
  // transaccional; nunca se usa ese pool para las operaciones del ensayo.
  process.env.DB_CONNECTION=dsn;
  apiDb=await import('../db/neon.js');
  ({createBaileysTenantSafety:createSafety}=await import('../services/baileysTenantSafety.js'));
  ({createBaileysTrustedContacts:createTrusted}=await import('../services/baileysTrustedContacts.js'));
  pool=new pg.Pool({connectionString:dsn});client=await pool.connect();
 });
 afterAll(async()=>{client?.release();await pool?.end();await apiDb?.pool.end()});

 async function exercise({injectFailure=false}={}){
  const schema='baileys_trial_'+randomBytes(12).toString('hex');
  let originalError;
  try{
   await client.query('BEGIN');
   // El nombre es generado exclusivamente con bytes aleatorios hexadecimales.
   await client.query(`CREATE SCHEMA "${schema}"`);
   await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
   await client.query('CREATE TABLE clientes(id integer PRIMARY KEY); CREATE TABLE usuarios(id integer PRIMARY KEY)');
   const migrations=['baileys_tenant_auth.sql','baileys_guard.sql','baileys_warmup_state.sql','baileys_tenant_safety.sql','baileys_trusted_contacts.sql','baileys_session_admin.sql'];
   for(const name of migrations)await client.query(readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
   // No son migraciones de la aplicación completa: clientes y usuarios son stubs.
   await client.query('INSERT INTO clientes(id) VALUES (1),(2); INSERT INTO usuarios(id) VALUES (1)');
   const keyBase64=Buffer.alloc(32,7).toString('base64');
   const query=(text,params)=>client.query(text,params);
   const transaction=fn=>fn(client); // Ya estamos en una única transacción externa.
   const safety=createSafety({keyBase64,query,transaction});
   const trusted=createTrusted({keyBase64,query,transaction});
   const jid='5493430000000@s.whatsapp.net'; // identificador ficticio, no se envía
   await trusted.change({tenantId:1,jid,actorUserId:1,action:'add'});
   expect(await trusted.isTrusted({tenantId:1,jid})).toBe(true);
   expect(await trusted.isTrusted({tenantId:2,jid})).toBe(false);
   await safety.recordStop({tenantId:1,jid});
   expect(await safety.checkForSend({tenantId:1,jid})).toEqual({allowed:false,error:'contact_opted_out'});
   expect(await safety.checkForSend({tenantId:2,jid})).toEqual({allowed:true});
   await safety.pauseTenant({tenantId:2,reason:'stop_unverified'});
   expect(await safety.checkForSend({tenantId:2,jid})).toEqual({allowed:false,error:'tenant_safety_paused'});
   expect((await safety.status(1)).paused).toBe(false);
   if(injectFailure)throw Error('fallo simulado de ensayo');
  }catch(e){originalError=e}
  finally{await client.query('ROLLBACK')}
  // Comprueba que el esquema transaccional no dejó objetos al finalizar.
  const r=await client.query('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists',[schema]);
  expect(r.rows[0].exists).toBe(false);
  if(originalError)throw originalError;
 }
 it('aplica esquema mínimo aislado y verifica confianza, STOP y pausa por tenant',async()=>{await exercise()});
 it('ante una falla también revierte el esquema de prueba',async()=>{await expect(exercise({injectFailure:true})).rejects.toThrow('fallo simulado de ensayo')});
});
