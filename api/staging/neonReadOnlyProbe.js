/**
 * Diagnóstico experimental de SOLO LECTURA: no arranca API, ni bot, ni migraciones.
 * La comparación de host/db NO identifica por sí sola un proyecto como seguro:
 * el operador debe verificarla independientemente en las consolas Neon y Render.
 */
import pg from 'pg';

const BLOCKED='STAGING_PREFLIGHT_RECHAZADO';
const FAILED='STAGING_CONSULTA_FALLIDA';
function blocked(){throw new Error(BLOCKED)}

export function stagingProbeConfig(env){
 if(env.BAILEYS_STAGING_READONLY_CONFIRM!=='SOLO_LECTURA_BASE_DE_PRUEBA')blocked();
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||env.NODE_EXTRA_CA_CERTS||env.NODE_OPTIONS)blocked();
 // Impide que variables PG auxiliares alteren conexión, TLS o parámetros de sesión.
 if(Object.keys(env).some(k=>/^PG[A-Z_]/.test(k)))blocked();
 let u;
 try{u=new URL(env.DB_CONNECTION||'')}catch{blocked()}
 if(!['postgresql:','postgres:'].includes(u.protocol)||!u.username||!u.password||u.hash)blocked();
 if(!/^ep-[a-z0-9-]+\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(u.hostname))blocked();
 if(u.port && u.port!=='5432')blocked();
 let database,user,password;
 try{database=decodeURIComponent(u.pathname.slice(1));user=decodeURIComponent(u.username);password=decodeURIComponent(u.password)}catch{blocked()}
 if(!database||database.includes('/')||!user||!password)blocked();
 if(env.BAILEYS_STAGING_EXPECTED_HOST!==u.hostname||env.BAILEYS_STAGING_EXPECTED_DB!==database)blocked();
 // No admitir overrides como host, ssl, sslrootcert, options ni valores duplicados.
 const permitted=new Set(['sslmode','channel_binding']);
 for(const k of u.searchParams.keys())if(!permitted.has(k)||u.searchParams.getAll(k).length!==1)blocked();
 if(u.searchParams.get('sslmode')!=='verify-full')blocked();
 // pg puede negociar channel binding pero no garantiza el modo libpq 'require'.
 // Rechazarlo para no prometer propiedades que el driver no asegura.
 if(u.searchParams.has('channel_binding'))blocked();
 return {host:u.hostname,port:5432,database,user,password,
  ssl:{rejectUnauthorized:true,servername:u.hostname},
  application_name:'baileys_staging_readonly',enableChannelBinding:true,
  connectionTimeoutMillis:15000,query_timeout:15000};
}

export async function runReadOnlyProbe(env,{Client=pg.Client}={}){
 const config=stagingProbeConfig(env);
 const c=new Client(config);
 let began=false;
 try{
  await c.connect();
  await c.query('BEGIN READ ONLY');began=true;
  const r=await c.query(`SELECT current_database() AS db,
   current_setting('server_version_num')::integer AS version_num,
   (SELECT count(*)::integer FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables`);
  const row=r.rows[0];
  if(!row||row.db!==config.database||!Number.isInteger(row.version_num)||
     !Number.isInteger(row.public_tables)||row.public_tables<0)throw Error(FAILED);
  return {postgresMajor:Math.floor(row.version_num/10000),publicTables:row.public_tables};
 }catch{throw Error(FAILED)}
 finally{
  let cleanupFailed=false;
  if(began)try{await c.query('ROLLBACK')}catch{cleanupFailed=true}
  try{await c.end()}catch{cleanupFailed=true}
  if(cleanupFailed)throw Error(FAILED);
 }
}
