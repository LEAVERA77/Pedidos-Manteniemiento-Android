/**
 * Cola de envío por tenant. Borrador: requiere almacenamiento de permisos/cuotas
 * transaccional y conexión/socket exclusivamente coordinados antes de integrarse.
 * No garantiza entrega ni inmunidad a bloqueos; jamás reintenta un resultado incierto.
 */
export function createBaileysGuard({checkAndReserve,isReplyWindowOpen,assertLease,sleep,now=Date.now,random=Math.random,maxQueue=250}={}) {
  if([checkAndReserve,isReplyWindowOpen,assertLease].some(f=>typeof f!=='function'))throw Error('Faltan verificadores seguros');
  const wait=sleep || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const queues=new Map();
  const jitter=()=>2500+Math.floor(random()*3001);
  function valid(tenant,jid,text) {
    return Number.isSafeInteger(tenant)&&tenant>0&&tenant<=2147483647 &&
      typeof jid==='string'&&/^\d{8,22}@(s\.whatsapp\.net|lid)$/.test(jid) && typeof text==='string'&&!!text.trim();
  }
  async function send(q,job){
    const {tenantId,jid,text,getSocket,messageKey,automatic=true}=job;
    if(!valid(tenantId,jid,text)||typeof getSocket!=='function')return {ok:false,error:'invalid_params'};
    let tried=false,composingSock=null;
    try {
      const since=now()-q.lastAttempt;
      if(q.lastAttempt!==null)await wait(Math.max(0,q.nextGap-since));
      if(!await isReplyWindowOpen({tenantId,jid,automatic}))return {ok:false,error:'outside_reply_window_or_muted'};
      await assertLease(tenantId);
      let sock=getSocket();
      if(!sock)return {ok:false,error:'not_connected'};
      if(messageKey){
        await wait(1000+Math.floor(random()*1501));
        await assertLease(tenantId);
        if(sock!==getSocket())return {ok:false,error:'socket_changed'};
        try{await sock.readMessages([messageKey]);}catch(_){/* leer es opcional; nunca reenviar por su falla */}
      }
      composingSock=sock;
      try{await sock.sendPresenceUpdate('composing',jid);}catch(_){}
      const writing=Math.max(2000,Math.min(6000,Math.round(text.length*45)));
      await wait(writing);
      if(sock!==getSocket())return {ok:false,error:'socket_changed'};
      if(!await isReplyWindowOpen({tenantId,jid,automatic}))return {ok:false,error:'outside_reply_window_or_muted'};
      await assertLease(tenantId);
      let allowed;
      // Solo reintentar una reserva explícitamente no realizada. Nunca reintentar
      // un envío de red; acotar espera y revalidar socket/lease cada vez.
      for(let i=0;i<8;i++){
        if(sock!==getSocket())return {ok:false,error:'socket_changed'};
        await assertLease(tenantId);
        allowed=await checkAndReserve({tenantId,jid,automatic});
        if(allowed?.error!=='spacing_wait')break;
        const ms=allowed.retry_after_ms;
        if(!Number.isSafeInteger(ms)||ms<1||ms>6000)return {ok:false,error:'spacing_unavailable'};
        if(i===7)return {ok:false,error:'spacing_busy'};
        await wait(ms);
      }
      // Cuotas agotadas fallan cerrado: quien llama decide si informa al usuario.
      if(!allowed?.allowed)return {ok:false,error:allowed?.error||'rate_limit'};
      if(sock!==getSocket())return {ok:false,error:'socket_changed'};
      await assertLease(tenantId);
      tried=true;
      const data=await sock.sendMessage(jid,{text:text.trim()});
      return {ok:true,data};
    } catch(_) {
      // Podría haberse enviado antes de la excepción. No volver a transmitir automáticamente.
      return {ok:false,error:tried?'delivery_unknown':'guard_unavailable',deliveryUnknown:tried};
    } finally {
      if(tried){q.lastAttempt=now();q.nextGap=jitter();}
      try{if(composingSock && composingSock===getSocket())await composingSock.sendPresenceUpdate('paused',jid);}catch(_){}
    }
  }
  function enqueue(job){
    const tenant=job?.tenantId;
    if(!valid(tenant,job?.jid,job?.text)||typeof job?.getSocket!=='function')return Promise.resolve({ok:false,error:'invalid_params'});
    let q=queues.get(tenant);
    if(!q){q={tail:Promise.resolve(),pending:0,lastAttempt:null,nextGap:0};queues.set(tenant,q);}
    if(q.pending>=maxQueue)return Promise.resolve({ok:false,error:'queue_full'});
    q.pending++;
    const run=q.tail.then(()=>send(q,job));
    q.tail=run.catch(()=>{}).finally(()=>{q.pending--});
    return run;
  }
  return {enqueue};
}
