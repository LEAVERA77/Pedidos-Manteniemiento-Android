const copiarCampo = (v) => JSON.parse(JSON.stringify(v));
import { validarInicioOffline, nuevoDiarioCampo, agregarEventoCampo } from './offline-trabajo-campo-core.js';
import { leerColaCampo, guardarDiarioCampo, congelarDiarioCampo, confirmarDiarioCampo } from './offline-trabajo-campo-cola.js';

function uuidSeguroCampo() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('No hay generador seguro de identificadores.');
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function contextoOk(c) {
  return Number.isSafeInteger(c?.usuario_id) && c.usuario_id>0 && Number.isSafeInteger(c?.tenant_id) && c.tenant_id>0 &&
    ['electricidad','agua','municipio'].includes(c.business_type);
}
function claveConfig(c) {
  if (!contextoOk(c)) throw new Error('Falta identificar usuario, organización o rubro.');
  return `pmg_geo_campo_u${c.usuario_id}_t${c.tenant_id}_b${c.business_type}`;
}
export function leerConfigCampo(contexto, storage=globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(claveConfig(contexto)) || 'null'); } catch (_) { return null; }
}
export async function actualizarConfigCampo(contexto, { apiUrl, token, fetchFn=fetch, storage=globalThis.localStorage }) {
  const key=claveConfig(contexto);
  if (!token) throw new Error('Iniciá sesión online para preparar el trabajo offline.');
  const r=await fetchFn(apiUrl('/api/tenant-operativa/geocerca-offline'),{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if (!r.ok) throw new Error('No se pudo actualizar la configuración de geocerca.');
  const c=await r.json();
  if (c.usuario_id!==contexto.usuario_id || c.tenant_id!==contexto.tenant_id || c.business_type!==contexto.business_type ||
      typeof c.habilitada!=='boolean' || !Number.isFinite(c.radio_metros) || c.radio_metros<10 || c.radio_metros>5000)
    throw new Error('La configuración de geocerca no coincide con la sesión.');
  const raw=JSON.stringify({...c,guardada_en:Date.now()});
  try { storage.setItem(key,raw); } catch (_) { throw new Error('No se pudo guardar la configuración en el teléfono.'); }
  if (storage.getItem(key)!==raw) throw new Error('No se pudo confirmar la configuración local.');
  return c;
}
export function pedirGpsCampo({ bridge=globalThis.AndroidDevice, win=globalThis.window, timeoutMs=30000 }={}) {
  if (!bridge || typeof bridge.getFreshGpsForOfflineWork !== 'function')
    return Promise.reject(new Error('Actualizá la aplicación Android para usar el GPS offline.'));
  return new Promise((resolve,reject)=>{
    const nombre=`__gnCampoGps_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer=setTimeout(()=>{delete win[nombre];reject(new Error('El GPS tardó demasiado. Activá ubicación y volvé a intentar.'));},timeoutMs);
    win[nombre]=(g)=>{clearTimeout(timer);delete win[nombre];if(g?.ok)resolve(g);else reject(new Error('No hay GPS reciente. Revisá los permisos y esperá señal.'));};
    try { bridge.getFreshGpsForOfflineWork(`window.${nombre}`); } catch (_) {clearTimeout(timer);delete win[nombre];reject(new Error('No se pudo consultar el GPS del teléfono.'));}
  });
}
export function diarioParaPedido(contexto, pedidoId, storage=globalThis.localStorage) {
  return leerColaCampo(storage).find(d=>d.usuario_id===contexto.usuario_id && d.tenant_id===contexto.tenant_id &&
    d.business_type===contexto.business_type && Number(d.pedido_id)===Number(pedidoId)) || null;
}
export function agregarTrabajoCampo(contexto,pedido,evento,{storage=globalThis.localStorage,nuevoId=uuidSeguroCampo,ahora=Date.now()}={}) {
  if (!contextoOk(contexto)) throw new Error('Falta identificar usuario, organización o rubro.');
  let d=diarioParaPedido(contexto,pedido?.id,storage);
  if (!d) d=nuevoDiarioCampo({pedido,usuarioId:contexto.usuario_id,tenantId:contexto.tenant_id,businessType:contexto.business_type,operacionId:nuevoId()});
  if (evento.tipo==='inicio') {
    const geo=validarInicioOffline({pedido,gps:evento.gps,config:leerConfigCampo(contexto,storage),usuarioId:contexto.usuario_id,
      tenantId:contexto.tenant_id,businessType:contexto.business_type,ahora});
    if (!geo.ok) throw new Error(geo.error);
    evento={...evento,gps:geo.captura,geocerca_local:geo.geocerca};
  }
  const t=new Date(evento.fecha).getTime(), last=d.eventos.length ? new Date(d.eventos[d.eventos.length-1].fecha).getTime() : 0;
  if (!Number.isFinite(t) || t<last || t>ahora+5000) throw new Error('La fecha del dispositivo cambió. Revisá el reloj antes de guardar.');
  d=agregarEventoCampo(d,evento);
  guardarDiarioCampo(d,storage);
  return proyectarDiarioCampo(d);
}
export function proyectarDiarioCampo(diario) {
  const p=copiarCampo(diario.copia_pedido);
  p.fotos=Array.isArray(p.fotos)?p.fotos:[];
  for (const e of diario.eventos) {
    if (e.tipo==='inicio') {p.es='En ejecución';p.ui2=diario.usuario_id;p.fa=e.fecha;}
    if (e.tipo==='avance') {p.av=e.avance;p.fa=e.fecha;p.uav=diario.usuario_id;}
    if (e.tipo==='cierre') {p.es='Cerrado';p.av=100;p.fc=e.fecha;p.uci=diario.usuario_id;
      p.tr=e.campos.trabajo_realizado;p.tc=e.campos.tecnico_cierre;p.foto_cierre=e.campos.foto_cierre;
      p.firma=e.campos.firma_cliente;p.chkl=e.campos.checklist_seguridad;}
    if (Array.isArray(e.fotos)) p.fotos.push(...e.fotos);
  }
  p._offline=true;p._campoPendiente=true;p._campoCongelado=!!diario.congelado;
  return p;
}
export function mezclarTrabajosCampo(pedidos,contexto,storage=globalThis.localStorage) {
  const lista=Array.isArray(pedidos)?[...pedidos]:[];
  for (const d of leerColaCampo(storage)) {
    if (d.usuario_id!==contexto.usuario_id || d.tenant_id!==contexto.tenant_id || d.business_type!==contexto.business_type) continue;
    const i=lista.findIndex(p=>String(p.id)===String(d.pedido_id));
    const local=proyectarDiarioCampo(d);
    if(i<0) lista.unshift(local); else lista[i]=local;
  }
  return lista;
}
export async function sincronizarTrabajosCampo(contexto,{apiUrl,token,fetchFn=fetch,storage=globalThis.localStorage}={}) {
  if (!contextoOk(contexto) || !token) throw new Error('Iniciá sesión online con el usuario, organización y rubro originales.');
  const pendientes=leerColaCampo(storage).filter(d=>d.usuario_id===contexto.usuario_id && d.tenant_id===contexto.tenant_id && d.business_type===contexto.business_type);
  let confirmados=0;const errores=[];
  for (const original of pendientes) {
    try {
      const fijo=congelarDiarioCampo(original.operacion_id,contexto,storage);
      const body={tipo:fijo.tipo,congelado:true,usuario_id:fijo.usuario_id,tenant_id:fijo.tenant_id,pedido_id:fijo.pedido_id,
        business_type:fijo.business_type,operacion_id:fijo.operacion_id,base:fijo.base,eventos:fijo.eventos};
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000);
      let r;
      try {r=await fetchFn(apiUrl(`/api/pedidos/${fijo.pedido_id}/trabajo-offline`),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});}
      finally {clearTimeout(timer);}
      const data=await r.json().catch(()=>({}));
      if (!r.ok || data.ok!==true || Number(data.pedido_id)!==fijo.pedido_id || data.operacion_id!==fijo.operacion_id)
        throw new Error(data.error || 'No se pudo confirmar el trabajo.');
      confirmarDiarioCampo(fijo,storage);confirmados++;
    } catch(e) {errores.push({pedido_id:original.pedido_id,error:String(e?.message || 'No se pudo sincronizar.')});}
  }
  return {confirmados,errores};
}
