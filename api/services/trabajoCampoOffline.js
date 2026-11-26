import { createHash } from 'node:crypto';
import { distanciaMetrosHaversine } from './geocercaHaversine.js';

class CampoError extends Error {
  constructor(status, message, code) { super(message); this.statusCode=status; this.code=code; }
}
const bad = (message) => { throw new CampoError(400,message,'datos_invalidos'); };
const conflict = (message) => { throw new CampoError(409,message,'conflicto_campo'); };
const validId = (v) => Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
const toMs = (value) => value == null ? null : new Date(value).getTime();
const equalDate = (a,b) => a == null && b == null || a != null && b != null && Number.isFinite(toMs(a)) && toMs(a)===toMs(b);
const dataUrl = (s) => typeof s === 'string' && s.length <= 4000000 && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(s);

/** Valida antes de adquirir locks; no confía en la copia local ni en datos extra. */
export function validarDiarioCampo(payload, { usuarioId, tenantId, businessType, ahora=Date.now() }) {
  if (!payload || payload.tipo !== 'TRABAJO_CAMPO' || payload.congelado !== true ||
      payload.usuario_id !== usuarioId || payload.tenant_id !== tenantId || payload.business_type !== businessType ||
      !validId(payload.pedido_id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payload.operacion_id || '')))
    bad('El pedido o la identidad de la operación no son válidos.');
  const base=payload.base;
  if (!base || !['Pendiente','Asignado','En ejecución'].includes(base.estado) || base.tecnico_asignado_id !== usuarioId ||
      !Number.isInteger(base.avance) || base.avance < 0 || base.avance > 100 ||
      (base.fecha_asignacion != null && !Number.isFinite(toMs(base.fecha_asignacion))) ||
      (base.fecha_avance != null && !Number.isFinite(toMs(base.fecha_avance))) ||
      !base.campos_cierre || typeof base.campos_cierre !== 'object') bad('La versión inicial del pedido no es válida.');
  if (!Array.isArray(payload.eventos) || !payload.eventos.length || payload.eventos.length > 100) bad('La lista de trabajo no es válida.');
  let estado=base.estado, avance=base.avance, last=0, inicio=null, cierre=null, fechaAvance=null;
  const materiales=[], fotos=[];
  for (const e of payload.eventos) {
    const fecha=toMs(e?.fecha);
    if (!Number.isFinite(fecha) || fecha > ahora+300000 || fecha < last) bad('Las fechas del trabajo no son válidas.');
    last=fecha;
    if (e.tipo === 'inicio') {
      const g=e.gps, gt=Number(g?.timestamp), lat=Number(g?.lat), lng=Number(g?.lng), precision=Number(g?.accuracy);
      if (!['Pendiente','Asignado'].includes(estado) || inicio || g?.fuente !== 'gps' ||
          [g?.lat,g?.lng,g?.timestamp,g?.accuracy].some(x=>x==null || x==='') ||
          !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
          !Number.isFinite(precision) || precision < 0 || precision > 100 || !Number.isFinite(gt) || gt > fecha+5000 || fecha-gt > 60000)
        bad('El inicio requiere una ubicación GPS reciente y precisa.');
      inicio={fecha:e.fecha,gps:{lat,lng,accuracy:precision,timestamp:gt}}; estado='En ejecución';
    } else if (e.tipo === 'avance') {
      if (estado !== 'En ejecución' || !Number.isInteger(e.avance) || e.avance < avance || e.avance > 100) bad('El avance no es válido.');
      avance=e.avance; fechaAvance=e.fecha;
    } else if (e.tipo === 'material') {
      const desc=typeof e.descripcion==='string' ? e.descripcion.trim() : '';
      const unidad=typeof e.unidad==='string' ? e.unidad.trim() : '';
      if (estado !== 'En ejecución' || !desc || desc.length>200 || unidad.length>32 || typeof e.cantidad!=='number' || !Number.isFinite(e.cantidad) || e.cantidad<=0 || e.cantidad>1000000) bad('El material no es válido.');
      materiales.push({descripcion:desc,cantidad:e.cantidad,unidad:unidad||null});
    } else if (e.tipo === 'cierre') {
      const c=e.campos || {}, trabajo=typeof c.trabajo_realizado==='string' ? c.trabajo_realizado.trim() : '';
      if (estado !== 'En ejecución' || cierre || !trabajo || trabajo.length>4000 ||
          typeof c.tecnico_cierre !== 'string' || c.tecnico_cierre.length>250 ||
          (c.foto_cierre != null && !dataUrl(c.foto_cierre)) || (c.firma_cliente != null && !dataUrl(c.firma_cliente)) ||
          (c.checklist_seguridad != null && (typeof c.checklist_seguridad!=='string' || c.checklist_seguridad.length>2000)) ||
          (c.telefono_contacto != null && (typeof c.telefono_contacto!=='string' || c.telefono_contacto.length>100))) bad('Los datos del cierre no son válidos.');
      cierre={fecha:e.fecha, trabajo_realizado:trabajo, tecnico_cierre:c.tecnico_cierre, foto_cierre:c.foto_cierre??null,
        firma_cliente:c.firma_cliente??null, checklist_seguridad:c.checklist_seguridad??null, telefono_contacto:c.telefono_contacto??null};
      estado='Cerrado'; avance=100;
    } else bad('El tipo de operación no es válido.');
    if (e.fotos != null) {
      if (!['inicio','avance'].includes(e.tipo) || !Array.isArray(e.fotos) || e.fotos.length>10 || e.fotos.some(x=>!dataUrl(x))) bad('Las fotos no son válidas.');
      fotos.push(...e.fotos);
      if (fotos.length>12 || fotos.reduce((a,x)=>a+x.length,0)>12000000) bad('Las fotos exceden el máximo permitido.');
    }
  }
  const canonical={pedido_id:payload.pedido_id,business_type:payload.business_type,base,eventos:payload.eventos};
  return { base, estado, avance, inicio, cierre, fechaAvance, materiales, fotos,
    hash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
}

/** Debe ejecutarse dentro de UNA transacción PostgreSQL; todas las escrituras son parametrizadas. */
export async function aplicarDiarioCampo(db,payload,contexto,validado) {
  const { usuarioId,tenantId,businessType }=contexto;
  const rsv=await db.query(`INSERT INTO trabajo_campo_offline_operaciones (tenant_id,usuario_id,operacion_id,pedido_id,contenido_hash)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,usuario_id,operacion_id) DO NOTHING RETURNING operacion_id`,
    [tenantId,usuarioId,payload.operacion_id,payload.pedido_id,validado.hash]);
  if (!rsv.rows.length) {
    const previous=await db.query(`SELECT pedido_id,contenido_hash FROM trabajo_campo_offline_operaciones WHERE tenant_id=$1 AND usuario_id=$2 AND operacion_id=$3`,[tenantId,usuarioId,payload.operacion_id]);
    if (!previous.rows[0] || Number(previous.rows[0].pedido_id)!==payload.pedido_id || previous.rows[0].contenido_hash!==validado.hash)
      conflict('La operación ya se confirmó con otros datos; queda pendiente para revisión.');
    return { repetida:true, pedido_id:payload.pedido_id };
  }
  const result=await db.query(`SELECT * FROM pedidos WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[payload.pedido_id,tenantId]);
  const p=result.rows[0], b=validado.base;
  if (!p || Number(p.tecnico_asignado_id)!==usuarioId || (p.business_type && String(p.business_type).trim() && p.business_type!==businessType))
    conflict('El pedido ya no está asignado a este técnico o cambió de organización o rubro.');
  if (String(p.estado)!==b.estado || Number(p.avance||0)!==b.avance ||
      !equalDate(p.fecha_asignacion,b.fecha_asignacion) || !equalDate(p.fecha_avance,b.fecha_avance) ||
      (p.lat == null ? b.lat != null : b.lat == null || Number(p.lat)!==Number(b.lat)) ||
      (p.lng == null ? b.lng != null : b.lng == null || Number(p.lng)!==Number(b.lng)))
    conflict('El pedido cambió en el servidor; el trabajo se conserva para revisión.');
  const sameUser = (a,b) => a == null && b == null || a != null && b != null && Number(a) === Number(b);
  if ((validado.inicio && !sameUser(p.usuario_inicio_id,b.usuario_inicio_id)) ||
      (validado.fechaAvance && !sameUser(p.usuario_avance_id,b.usuario_avance_id)) ||
      (validado.cierre && (!sameUser(p.usuario_cierre_id,b.usuario_cierre_id) || !equalDate(p.fecha_cierre,b.fecha_cierre))))
    conflict('La auditoría o el cierre cambiaron en el servidor; el trabajo se conserva para revisión.');
  if (validado.inicio) {
    const x=await db.query("SELECT to_regclass('public.tenant_geocerca_settings') AS nombre");
    let enabled=true, radius=100;
    if (x.rows[0]?.nombre) {
      const cfg=await db.query('SELECT habilitada,radio_metros FROM tenant_geocerca_settings WHERE tenant_id=$1',[tenantId]);
      if (cfg.rows[0]) {enabled=cfg.rows[0].habilitada!==false; radius=Math.min(5000,Math.max(10,Number(cfg.rows[0].radio_metros)||100));}
    }
    if (p.lat==null || p.lng==null || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) ||
        Math.abs(Number(p.lat))>90 || Math.abs(Number(p.lng))>180) conflict('El pedido no tiene ubicación válida en el servidor.');
    const distancia=distanciaMetrosHaversine(validado.inicio.gps.lat,validado.inicio.gps.lng,Number(p.lat),Number(p.lng));
    if (enabled && distancia>radius) conflict('La ubicación registrada no cumple la geocerca actual; queda pendiente para revisión.');
  }
  const tipoTrabajo=String(p.tipo_trabajo || '').trim();
  if (validado.materiales.length && (tipoTrabajo === 'Otros' || tipoTrabajo.toLowerCase().includes('factibilidad')))
    conflict('Este tipo de pedido no admite carga de materiales; queda pendiente para revisión.');
  const c=validado.cierre;
  const protegido={trabajo_realizado:p.trabajo_realizado || null,tecnico_cierre:p.tecnico_cierre || null,
    foto_cierre:p.foto_cierre || null,firma_cliente:p.firma_cliente || null,
    checklist_seguridad:p.checklist_seguridad || null,telefono_contacto:String(p.telefono_contacto || '').trim()};
  if (c && Object.keys(protegido).some(k=>protegido[k] !== b.campos_cierre[k]))
    conflict('Los datos de cierre cambiaron en el servidor; el trabajo se conserva para revisión.');
  if (c && String(p.cliente || '').trim() && !c.firma_cliente) conflict('El pedido requiere firma del cliente; queda pendiente para revisión.');
  const oldFotos=String(p.foto_base64||'').split('||').filter(Boolean);
  const fotos=[...oldFotos,...validado.fotos];
  if (fotos.length>12) conflict('El pedido superó el máximo de fotos; queda pendiente para revisión.');
  await db.query(`UPDATE pedidos SET estado=$3,avance=$4,
    fecha_avance=COALESCE($5::timestamptz,fecha_avance),
    usuario_inicio_id=CASE WHEN $6::boolean THEN $7 ELSE usuario_inicio_id END,
    usuario_avance_id=CASE WHEN $5::timestamptz IS NOT NULL THEN $7 ELSE usuario_avance_id END,
    foto_base64=CASE WHEN $8::boolean THEN $9 ELSE foto_base64 END,
    trabajo_realizado=CASE WHEN $10::boolean THEN $11 ELSE trabajo_realizado END,
    tecnico_cierre=CASE WHEN $10::boolean THEN $12 ELSE tecnico_cierre END,
    fecha_cierre=CASE WHEN $10::boolean THEN $13::timestamptz ELSE fecha_cierre END,
    usuario_cierre_id=CASE WHEN $10::boolean THEN $7 ELSE usuario_cierre_id END,
    foto_cierre=CASE WHEN $10::boolean THEN $14 ELSE foto_cierre END,
    firma_cliente=CASE WHEN $10::boolean THEN $15 ELSE firma_cliente END,
    checklist_seguridad=CASE WHEN $10::boolean THEN $16 ELSE checklist_seguridad END,
    telefono_contacto=COALESCE($17,telefono_contacto)
    WHERE id=$1 AND tenant_id=$2`,[payload.pedido_id,tenantId,validado.estado,validado.avance,validado.fechaAvance,
      !!validado.inicio,usuarioId,!!validado.fotos.length,fotos.join('||'),!!c,c?.trabajo_realizado??null,c?.tecnico_cierre??null,
      c?.fecha??null,c?.foto_cierre??null,c?.firma_cliente??null,c?.checklist_seguridad??null,c?.telefono_contacto??null]);
  for (const m of validado.materiales)
    await db.query('INSERT INTO pedido_materiales (pedido_id,descripcion,cantidad,unidad) VALUES ($1,$2,$3,$4)',[payload.pedido_id,m.descripcion,m.cantidad,m.unidad]);
  return { repetida:false,pedido_id:payload.pedido_id };
}
