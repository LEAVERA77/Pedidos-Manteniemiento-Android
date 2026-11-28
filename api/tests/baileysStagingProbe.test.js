import {describe,it,expect,vi} from 'vitest';
import {stagingProbeConfig,runReadOnlyProbe} from '../staging/neonReadOnlyProbe.js';
const valid=()=>({
 DB_CONNECTION:'postgresql://test:secret@ep-abc.us-west-2.aws.neon.tech/testdb?sslmode=verify-full',
 BAILEYS_STAGING_EXPECTED_HOST:'ep-abc.us-west-2.aws.neon.tech',
 BAILEYS_STAGING_EXPECTED_DB:'testdb',BAILEYS_STAGING_READONLY_CONFIRM:'SOLO_LECTURA_BASE_DE_PRUEBA',
});
describe('diagnóstico Neon separado, solo lectura',()=>{
 it('exige confirmación, destino coincidente, SSL estricto y URL sin overrides',()=>{
  const base=valid();expect(stagingProbeConfig(base)).toMatchObject({
   host:base.BAILEYS_STAGING_EXPECTED_HOST,database:'testdb',port:5432,
   ssl:{rejectUnauthorized:true,servername:base.BAILEYS_STAGING_EXPECTED_HOST}});
  const bad=[
   {...base,BAILEYS_STAGING_READONLY_CONFIRM:''}, {...base,BAILEYS_STAGING_EXPECTED_HOST:'otro.neon.tech'},
   {...base,BAILEYS_STAGING_EXPECTED_DB:'otra'}, {...base,NODE_TLS_REJECT_UNAUTHORIZED:'0'},
   {...base,PGOPTIONS:'-c default_transaction_read_only=off'}, {...base,NODE_EXTRA_CA_CERTS:'/tmp/rogue'},
   {...base,NODE_OPTIONS:'--require bad.js'},
   {...base,DB_CONNECTION:base.DB_CONNECTION.replace('verify-full','require')},
   {...base,DB_CONNECTION:base.DB_CONNECTION.replace('ep-abc.us-west-2.aws.neon.tech','localhost')},
   {...base,DB_CONNECTION:base.DB_CONNECTION.replace('neon.tech/','neon.tech.evil.example/')},
   {...base,DB_CONNECTION:base.DB_CONNECTION.replace('neon.tech/','neon.tech:5433/')},
   {...base,DB_CONNECTION:base.DB_CONNECTION+'&host=malicioso'},
   {...base,DB_CONNECTION:base.DB_CONNECTION+'&sslmode=disable'},
   {...base,DB_CONNECTION:base.DB_CONNECTION+'&uselibpqcompat=true'},
   {...base,DB_CONNECTION:base.DB_CONNECTION+'&channel_binding=require'},
  ];
  for(const env of bad)expect(()=>stagingProbeConfig(env)).toThrow('STAGING_PREFLIGHT_RECHAZADO');
 });
 it('inicia transacción read only, consulta metadatos y revierte',async()=>{
  const calls=[];let config;
  class Client{
   constructor(c){config=c} async connect(){calls.push('connect')}
   async query(q){calls.push(q);if(q.startsWith('SELECT'))return {rows:[{db:'testdb',version_num:170006,public_tables:0}]};return {rows:[]}}
   async end(){calls.push('end')}
  }
  const result=await runReadOnlyProbe(valid(),{Client});
  expect(result).toEqual({postgresMajor:17,publicTables:0});
  expect(config.ssl).toEqual({rejectUnauthorized:true,servername:'ep-abc.us-west-2.aws.neon.tech'});
  expect(calls[0]).toBe('connect');expect(calls[1]).toBe('BEGIN READ ONLY');
  expect(calls[2]).toMatch(/^SELECT/);expect(calls.slice(-2)).toEqual(['ROLLBACK','end']);
 });
 it('falla cerrado, revierte y no difunde mensaje de la base',async()=>{
  const calls=[];
  class Client{
   async connect(){} async query(q){calls.push(q);if(q.startsWith('SELECT'))throw Error('url y secreto falsos');return {rows:[]}}
   async end(){calls.push('end')}
  }
  await expect(runReadOnlyProbe(valid(),{Client})).rejects.toThrow(/^STAGING_CONSULTA_FALLIDA$/);
  expect(calls.slice(-2)).toEqual(['ROLLBACK','end']);
 });
 it('no anuncia éxito si falla el rollback',async()=>{
  class Client{
   async connect(){}
   async query(q){if(q==='ROLLBACK')throw Error('fallo de limpieza');if(q.startsWith('SELECT'))return {rows:[{db:'testdb',version_num:170006,public_tables:0}]};return {rows:[]}}
   async end(){}
  }
  await expect(runReadOnlyProbe(valid(),{Client})).rejects.toThrow(/^STAGING_CONSULTA_FALLIDA$/);
 });
 it('no conecta cuando preflight no pasa',async()=>{
  const Client=vi.fn();
  await expect(runReadOnlyProbe({...valid(),BAILEYS_STAGING_EXPECTED_DB:'distinta'},{Client})).rejects.toThrow('STAGING_PREFLIGHT_RECHAZADO');
  expect(Client).not.toHaveBeenCalled();
 });
});
