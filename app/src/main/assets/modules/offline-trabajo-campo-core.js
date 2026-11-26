const copiarCampo = (v) => JSON.parse(JSON.stringify(v));
/** Primitivas del diario de trabajo en campo; no realizan red ni almacenan datos. */
const EARTH_RADIUS_M = 6371000;
const MAX_GPS_AGE_MS = 60_000;
const MAX_GPS_ACCURACY_M = 100;

function idPositivo(v) {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

export function distanciaCampoMetros(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** Se evalúa la última configuración guardada: no sustituye la validación del servidor al sincronizar. */
export function validarInicioOffline({ pedido, gps, config, usuarioId, tenantId, businessType, ahora = Date.now() }) {
    const uid = idPositivo(usuarioId), tid = idPositivo(tenantId);
    if (!uid || !tid || !pedido || idPositivo(pedido.id) == null || idPositivo(pedido.tai) !== uid)
        return { ok:false, error:'El pedido no está asignado a este usuario en la copia local.' };
    if (!['Pendiente','Asignado'].includes(String(pedido.es)))
        return { ok:false, error:'El pedido no admite iniciar ejecución en la copia local.' };
    if (!config || idPositivo(config.usuario_id) !== uid || idPositivo(config.tenant_id) !== tid ||
        config.business_type !== businessType || typeof config.habilitada !== 'boolean' ||
        !Number.isFinite(config.radio_metros) || config.radio_metros < 10 || config.radio_metros > 5000)
        return { ok:false, error:'Falta la configuración de geocerca. Conectate para actualizarla antes de salir.' };
    const lat = Number(gps?.lat), lng = Number(gps?.lng), time = Number(gps?.timestamp), accuracy = Number(gps?.accuracy);
    if (gps?.fuente !== 'gps' || [gps?.lat,gps?.lng,gps?.timestamp,gps?.accuracy].some(v => v == null || v === '') ||
        !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(time) ||
        time > ahora + 5000 || ahora - time > MAX_GPS_AGE_MS || !Number.isFinite(accuracy) ||
        accuracy < 0 || accuracy > MAX_GPS_ACCURACY_M)
        return { ok:false, error:'No hay una ubicación GPS reciente y precisa. Activá la ubicación y esperá señal.' };
    if (pedido.la == null || pedido.ln == null) return { ok:false, error:'El pedido no tiene coordenadas guardadas.' };
    const plat = Number(pedido.la), plng = Number(pedido.ln);
    if (!Number.isFinite(plat) || plat < -90 || plat > 90 || !Number.isFinite(plng) || plng < -180 || plng > 180)
        return { ok:false, error:'Las coordenadas guardadas del pedido no son válidas.' };
    const distancia = distanciaCampoMetros(lat,lng,plat,plng);
    if (config.habilitada && distancia > config.radio_metros)
        return { ok:false, error:`Estás a ~${Math.round(distancia)} m del pedido (máximo ${config.radio_metros} m).`, distancia_metros:distancia };
    return { ok:true, distancia_metros:distancia, captura:{lat,lng,timestamp:time,accuracy,fuente:'gps'},
        geocerca:{habilitada:config.habilitada,radio_metros:config.radio_metros} };
}

/** Estado local provisional: el servidor debe comprobar asignación, contexto y versión al recibirlo. */
export function nuevoDiarioCampo({ pedido, usuarioId, tenantId, businessType, operacionId }) {
    const uid=idPositivo(usuarioId), tid=idPositivo(tenantId), pid=idPositivo(pedido?.id);
    if (!uid || !tid || !pid || idPositivo(pedido?.tai) !== uid ||
        !['electricidad','agua','municipio'].includes(businessType) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(operacionId || '')))
        throw new Error('No se pudo identificar el pedido, usuario, organización o rubro.');
    if (!['Pendiente','Asignado','En ejecución'].includes(String(pedido.es)))
        throw new Error('El pedido no está disponible para trabajo offline.');
    return { tipo:'TRABAJO_CAMPO', usuario_id:uid, tenant_id:tid, pedido_id:pid, business_type:businessType,
        operacion_id:operacionId, congelado:false,
        base:{estado:String(pedido.es),avance:Number(pedido.av)||0,tecnico_asignado_id:uid,
          fecha_asignacion:pedido.fasi || null,fecha_avance:pedido.fa || null,lat:pedido.la,lng:pedido.ln,
          usuario_inicio_id:pedido.ui2 ?? null,usuario_avance_id:pedido.uav ?? null,
          usuario_cierre_id:pedido.uci ?? null,fecha_cierre:pedido.fc || null,
          campos_cierre:{trabajo_realizado:pedido.tr || null,tecnico_cierre:pedido.tc || null,
            foto_cierre:pedido.foto_cierre || null,firma_cliente:pedido.firma || null,
            checklist_seguridad:pedido.chkl || null,telefono_contacto:String(pedido.tel || '').trim()}},
        copia_pedido:copiarCampo(pedido), eventos:[] };
}

export function agregarEventoCampo(diario, evento) {
    if (!diario || diario.tipo !== 'TRABAJO_CAMPO' || diario.congelado || !Array.isArray(diario.eventos))
        throw new Error('La operación está pendiente de sincronización; no se puede modificar.');
    if (diario.eventos.length >= 100) throw new Error('Este pedido tiene demasiados eventos pendientes; sincronizá antes de agregar más.');
    const esImagen = v => typeof v === 'string' && v.length <= 4000000 && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(v);
    if (evento?.fotos != null && (!['inicio','avance'].includes(evento.tipo) || !Array.isArray(evento.fotos) || evento.fotos.length > 10 || evento.fotos.some(f=>!esImagen(f))))
        throw new Error('Alguna foto no es válida o es demasiado grande.');
    const anteriores = diario.eventos.flatMap(e => Array.isArray(e.fotos) ? e.fotos : []);
    const nuevas = Array.isArray(evento?.fotos) ? evento.fotos : [];
    if (anteriores.length+nuevas.length > 12 || [...anteriores,...nuevas].reduce((a,f)=>a+f.length,0)>12000000)
        throw new Error('Las fotos exceden el máximo permitido.');
    const anterior = diario.eventos.length ? diario.eventos[diario.eventos.length-1] : null;
    const estado = anterior?.tipo === 'cierre' ? 'Cerrado' :
      diario.eventos.some(e=>e.tipo === 'inicio') ? 'En ejecución' : diario.base.estado;
    if (evento?.tipo === 'inicio') {
        if (!['Pendiente','Asignado'].includes(estado) || !evento.gps || !evento.fecha)
            throw new Error('No se puede iniciar este pedido offline.');
    } else if (evento?.tipo === 'avance') {
        const previo = [...diario.eventos].reverse().find(e=>e.tipo==='avance')?.avance ?? diario.base.avance;
        if (estado !== 'En ejecución' || !Number.isInteger(evento.avance) || evento.avance < Number(previo) || evento.avance > 100 || !evento.fecha)
            throw new Error('El avance no es válido para este pedido.');
    } else if (evento?.tipo === 'material') {
        const descripcion = typeof evento.descripcion === 'string' ? evento.descripcion.trim() : '';
        const unidad = typeof evento.unidad === 'string' ? evento.unidad.trim() : '';
        if (estado !== 'En ejecución' || !descripcion || descripcion.length > 200 || unidad.length > 32 ||
            typeof evento.cantidad !== 'number' || !Number.isFinite(evento.cantidad) || evento.cantidad <= 0 ||
            evento.cantidad > 1000000 || !evento.fecha)
            throw new Error('Ingresá una descripción y una cantidad válida del material.');
    } else if (evento?.tipo === 'cierre') {
        const campos=evento.campos || {}, trabajo=typeof campos.trabajo_realizado==='string' ? campos.trabajo_realizado.trim() : '';
        if (estado !== 'En ejecución' || !trabajo || trabajo.length>4000 || typeof campos.tecnico_cierre!=='string' || campos.tecnico_cierre.length>250 ||
            (campos.foto_cierre != null && !esImagen(campos.foto_cierre)) || (campos.firma_cliente != null && !esImagen(campos.firma_cliente)) ||
            (campos.checklist_seguridad != null && (typeof campos.checklist_seguridad!=='string' || campos.checklist_seguridad.length>2000)) ||
            (campos.telefono_contacto != null && (typeof campos.telefono_contacto!=='string' || campos.telefono_contacto.length>100)) || !evento.fecha)
            throw new Error('Revisá el trabajo realizado, la firma y la foto de cierre.');
    } else throw new Error('Operación de campo no reconocida.');
    return { ...diario, eventos:[...diario.eventos, copiarCampo(evento)] };
}
