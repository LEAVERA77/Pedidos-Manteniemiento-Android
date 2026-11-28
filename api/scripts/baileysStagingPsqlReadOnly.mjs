import {runPsqlReadOnly} from '../staging/neonPsqlReadOnly.js';
try{
 const r=await runPsqlReadOnly(process.env);
 console.log(`STAGING_PSQL_OK PSQL_MAJOR=${r.psqlMajor} POSTGRES_MAJOR=${r.postgresMajor} TABLAS_PUBLICAS=${r.publicTables}`);
}catch(e){
 console.error(e?.message==='STAGING_PSQL_PREFLIGHT_RECHAZADO'?'STAGING_PSQL_PREFLIGHT_RECHAZADO':'STAGING_PSQL_FALLIDO');
 process.exitCode=1;
}
