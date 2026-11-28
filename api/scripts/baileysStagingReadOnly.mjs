/** Invocación manual controlada. No mostrar URLs, credenciales ni detalles de error. */
import {runReadOnlyProbe} from '../staging/neonReadOnlyProbe.js';
try{
 const r=await runReadOnlyProbe(process.env);
 console.log(`STAGING_SOLO_LECTURA_OK POSTGRES_MAJOR=${r.postgresMajor} TABLAS_PUBLICAS=${r.publicTables}`);
}catch(e){
 console.error(e?.message==='STAGING_PREFLIGHT_RECHAZADO'?'STAGING_PREFLIGHT_RECHAZADO':'STAGING_CONSULTA_FALLIDA');
 process.exitCode=1;
}
