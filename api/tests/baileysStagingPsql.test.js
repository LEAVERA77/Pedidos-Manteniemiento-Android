import {describe,expect,it,vi} from 'vitest';
import {psqlProbeConfig,runPsqlReadOnly} from '../staging/neonPsqlReadOnly.js';
const env=()=>({DB_CONNECTION:'postgresql://name:secret@ep-ficticio.us-west-2.aws.neon.tech/testdb?sslmode=require&channel_binding=require',BAILEYS_STAGING_EXPECTED_HOST:'ep-ficticio.us-west-2.aws.neon.tech',BAILEYS_STAGING_EXPECTED_DB:'testdb',BAILEYS_STAGING_READONLY_CONFIRM:'SOLO_LECTURA_BASE_DE_PRUEBA',PATH:'/usr/bin:/bin',PGOPTIONS:'-c default_transaction_read_only=off',SSL_CERT_FILE:'/fake'});
describe('sonda libpq aislada de solo lectura',()=>{
 it('conserva channel binding requerido y refuerza TLS solo en memoria',()=>{
  const e=env(),original=e.DB_CONNECTION,c=psqlProbeConfig(e);
  expect(c).toMatchObject({host:e.BAILEYS_STAGING_EXPECTED_HOST,database:'testdb',user:'name',password:'secret'});expect(e.DB_CONNECTION).toBe(original);
 });
 it('rechaza parametros adicionales, destinos falsos y ausencia de confirmación o binding',()=>{
  const e=env();
  for(const x of [{...e,BAILEYS_STAGING_READONLY_CONFIRM:''},{...e,BAILEYS_STAGING_EXPECTED_DB:'other'},
   {...e,BAILEYS_STAGING_EXPECTED_HOST:'fake'}, {...e,DB_CONNECTION:e.DB_CONNECTION.replace('require&channel','disable&channel')},
   {...e,DB_CONNECTION:e.DB_CONNECTION.replace('channel_binding=require','channel_binding=prefer')},
   {...e,DB_CONNECTION:e.DB_CONNECTION+'&host=attacker'}, {...e,DB_CONNECTION:e.DB_CONNECTION+'&sslmode=verify-full'},
   {...e,DB_CONNECTION:e.DB_CONNECTION.replace('neon.tech/','neon.tech.evil.example/')},
  ])expect(()=>psqlProbeConfig(x)).toThrow('STAGING_PSQL_PREFLIGHT_RECHAZADO');
 });
 it('ejecuta consulta de solo lectura con URL solo en entorno aislado y sin secretos en argumentos',async()=>{
  const calls=[];
  const run=vi.fn(async(...a)=>{calls.push(a);return {stdout:calls.length===1?'psql (PostgreSQL) 17.12\n':'testdb|170012|0\n'}});
  expect(await runPsqlReadOnly(env(),{run})).toEqual({psqlMajor:17,postgresMajor:17,publicTables:0});
  expect(calls).toHaveLength(2);expect(calls[1][1].join(' ')).toContain('BEGIN READ ONLY;');expect(calls[1][1].join(' ')).toContain('ROLLBACK;');
  expect(calls[1][1].join(' ')).not.toContain('secret');expect(calls[1][2].env.PGOPTIONS).toBeUndefined();expect(calls[1][2].env.SSL_CERT_FILE).toBeUndefined();
  expect(calls[1][2].env).toMatchObject({PGDATABASE:'testdb',PGSSLMODE:'verify-full',PGSSLROOTCERT:'system',PGCHANNELBINDING:'require'});
 });
 it('detiene versiones viejas y oculta errores del ejecutable',async()=>{
  const old=vi.fn(async()=>({stdout:'psql (PostgreSQL) 15.5'}));
  await expect(runPsqlReadOnly(env(),{run:old})).rejects.toThrow(/^STAGING_PSQL_FALLIDO$/);expect(old).toHaveBeenCalledTimes(1);
  const error=vi.fn(async()=>{throw Error('secret')});
  await expect(runPsqlReadOnly(env(),{run:error})).rejects.toThrow(/^STAGING_PSQL_FALLIDO$/);
 });
 it('rechaza una respuesta inesperada o de base distinta',async()=>{
  let n=0;const run=async()=>({stdout:++n===1?'psql (PostgreSQL) 17.1':'otra|170001|0'});
  await expect(runPsqlReadOnly(env(),{run})).rejects.toThrow(/^STAGING_PSQL_FALLIDO$/);
 });
});
