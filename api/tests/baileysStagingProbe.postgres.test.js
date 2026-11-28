import {describe,it,expect} from 'vitest';
import pg from 'pg';
import {runReadOnlyProbe} from '../staging/neonReadOnlyProbe.js';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL||'';
if(dsn){const u=new URL(dsn);if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.port!=='55442'||u.pathname!=='/campo_offline_test'||u.search||u.hash)throw Error('Solo PostgreSQL local descartable');}
describe.skipIf(!dsn)('diagnóstico read-only contra PostgreSQL local',()=>{
 it('ejecuta consulta real en transacción solo lectura y cierra',async()=>{
  let readOnly,closed=false;
  class LocalClient {
   constructor(){this.client=new pg.Client({connectionString:dsn})}
   connect(){return this.client.connect()}
   async query(sql){
    const r=await this.client.query(sql);
    if(sql==='BEGIN READ ONLY')readOnly=(await this.client.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
    return r;
   }
   async end(){await this.client.end();closed=true}
  }
  const host='ep-ficticio.us-west-2.aws.neon.tech';
  const env={DB_CONNECTION:`postgresql://test:fake@${host}/campo_offline_test?sslmode=verify-full`,BAILEYS_STAGING_EXPECTED_HOST:host,BAILEYS_STAGING_EXPECTED_DB:'campo_offline_test',BAILEYS_STAGING_READONLY_CONFIRM:'SOLO_LECTURA_BASE_DE_PRUEBA'};
  const result=await runReadOnlyProbe(env,{Client:LocalClient});
  expect(readOnly).toBe('on');expect(closed).toBe(true);expect(result.postgresMajor).toBeGreaterThan(0);expect(result.publicTables).toBeGreaterThanOrEqual(0);
 });
});
