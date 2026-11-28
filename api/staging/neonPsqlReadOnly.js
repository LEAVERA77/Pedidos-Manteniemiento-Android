/** SOLO LECTURA. Independiente de la API y de WhatsApp; requiere psql/libpq >=16. */
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(execFileCallback);
const FAILED='STAGING_PSQL_FALLIDO', BLOCKED='STAGING_PSQL_PREFLIGHT_RECHAZADO';
const bad=()=>{throw Error(BLOCKED)};

export function psqlProbeConfig(env){
 if(env.BAILEYS_STAGING_READONLY_CONFIRM!=='SOLO_LECTURA_BASE_DE_PRUEBA')bad();
 let u;try{u=new URL(env.DB_CONNECTION||'')}catch{bad()}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.username||!u.password||u.hash)bad();
 if(!/^ep-[a-z0-9-]+\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(u.hostname)||u.port&&u.port!=='5432')bad();
 let database,user,password;try{database=decodeURIComponent(u.pathname.slice(1));user=decodeURIComponent(u.username);password=decodeURIComponent(u.password)}catch{bad()}
 if(!/^[a-zA-Z0-9_-]+$/.test(database)||database!==env.BAILEYS_STAGING_EXPECTED_DB||u.hostname!==env.BAILEYS_STAGING_EXPECTED_HOST)bad();
 for(const k of u.searchParams.keys())if(!['sslmode','channel_binding'].includes(k)||u.searchParams.getAll(k).length!==1)bad();
 if(!['require','verify-full'].includes(u.searchParams.get('sslmode'))||u.searchParams.get('channel_binding')!=='require')bad();
 // Configuración solamente en memoria; Render conserva DB_CONNECTION intacta.
 return {host:u.hostname,database,user,password};
}

const sql=`BEGIN READ ONLY;
SELECT current_database(), current_setting('server_version_num')::integer,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p'));
ROLLBACK;`;

export async function runPsqlReadOnly(env,{run=execFile}={}){
 const cfg=psqlProbeConfig(env);
 // No heredar variables PG*/OpenSSL ni opciones que alteren la conexión; la URL
 // solo via entorno del proceso hijo, nunca argumento, comando ni log.
 const safeEnv={PATH:env.PATH||'/usr/bin:/bin',LC_ALL:'C'};
 try{
  const version=await run('psql',['--version'],{env:safeEnv,timeout:5000,maxBuffer:4096});
  const major=Number(/^psql \(PostgreSQL\) (\d+)/.exec(version.stdout)?.[1]);
  if(!Number.isInteger(major)||major<16)throw Error(FAILED);
  const childEnv={...safeEnv,PGHOST:cfg.host,PGPORT:'5432',PGDATABASE:cfg.database,PGUSER:cfg.user,PGPASSWORD:cfg.password,
   PGSSLMODE:'verify-full',PGSSLROOTCERT:'system',PGCHANNELBINDING:'require',PGCONNECT_TIMEOUT:'15',PGAPPNAME:'baileys_staging_readonly'};
  const result=await run('psql',['-X','-q','-t','-A','-w','-v','ON_ERROR_STOP=1','-c',sql],
   {env:childEnv,timeout:20000,maxBuffer:4096});
  const lines=result.stdout.trim().split('\n');
  if(lines.length!==1)throw Error(FAILED);
  const m=/^([a-zA-Z0-9_-]+)\|(\d+)\|(\d+)$/.exec(lines[0]);
  if(!m||m[1]!==cfg.database)throw Error(FAILED);
  const serverVersion=Number(m[2]),tables=Number(m[3]);
  if(!Number.isSafeInteger(serverVersion)||serverVersion<100000||!Number.isSafeInteger(tables)||tables<0)throw Error(FAILED);
  return {postgresMajor:Math.floor(serverVersion/10000),publicTables:tables,psqlMajor:major};
 }catch{throw Error(FAILED)}
}
