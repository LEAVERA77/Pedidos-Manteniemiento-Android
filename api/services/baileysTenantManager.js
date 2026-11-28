/** Ciclo de vida inyectable de sockets por tenant. Aún no iniciar desde server.js. */
export function createBaileysTenantManager({acquireLease,loadAuth,makeSocket,makeQr,onInbound,
  disconnectReasons={},setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random}={}){
 if([acquireLease,loadAuth,makeSocket,makeQr,onInbound].some(f=>typeof f!=='function'))throw Error('Dependencias del gestor incompletas');
 const tenants=new Map();
 const valid=id=>Number.isSafeInteger(id)&&id>0&&id<=2147483647;
 function current(id){if(!valid(id))throw Error('Tenant inválido');if(!tenants.has(id))tenants.set(id,{status:'stopped',generation:0,retries:0,chain:Promise.resolve()});return tenants.get(id);}
 function status(id){const s=current(id);return {tenant_id:id,status:s.status,qr:s.status==='qr_ready'?s.qr||null:null};}
 async function release(s){const lease=s.lease;s.lease=null;if(lease)await lease.release().catch(()=>{});}
 function invalidate(s){s.generation++;if(s.timer){clearTimer(s.timer);s.timer=null;}const sock=s.socket;s.socket=null;s.qr=null;try{sock?.ws?.close?.()}catch(_){};}
 function lost(id,s){
  if(s.status==='stopped'||s.status==='lease_lost')return;
  invalidate(s);s.status='lease_lost';void release(s);
 }
 function serial(s,fn){s.chain=s.chain.then(fn).catch(()=>{});}
 async function openSocket(id,s){
  const lease=s.lease, prior=s.generation;
  if(!lease)throw Error('Sin coordinación');
  await lease.assertHeld();
  if(s.generation!==prior||s.lease!==lease)return;
  const auth=await loadAuth(id);
  if(s.generation!==prior||s.lease!==lease)return;
  await lease.assertHeld();
  if(s.generation!==prior||s.lease!==lease)return;
  const generation=++s.generation;
  // Baileys escribe llaves Signal por state.keys, además de creds.update.
  // Una falla de lectura/escritura impide seguir con un estado criptográfico dudoso.
  const failPersistence=()=>{
   if(s.generation!==generation)return;
   invalidate(s);s.status='persistence_error';void release(s);
  };
  const keys=auth.state?.keys;
  if(!keys||typeof keys.get!=='function'||typeof keys.set!=='function')throw Error('Estado de llaves inválido');
  const checkedKeys={...keys,
   get:async (...args)=>{try{return await keys.get(...args)}catch(e){failPersistence();throw e;}},
   set:async (...args)=>{try{return await keys.set(...args)}catch(e){failPersistence();throw e;}},
  };
  const sock=await makeSocket({tenantId:id,auth:{...auth.state,keys:checkedKeys},browser:['GestorNova Web','Chrome','124.0.0'],syncFullHistory:false});
  if(generation!==s.generation || !s.lease){try{sock.ws?.close?.()}catch(_){};return;}
  s.auth=auth;s.socket=sock;s.status='connecting';s.qr=null;
  const active=()=>s.generation===generation&&s.socket===sock;
  sock.ev.on('creds.update',()=>{
   if(!active())return;
   // Registrar el snapshot en cuanto llega el evento; el adaptador serializa el commit.
   let result;try{result=auth.saveCreds()}catch(e){result=Promise.reject(e)}
   Promise.resolve(result).catch(()=>{
    if(active())failPersistence();
   });
  });
  sock.ev.on('connection.update',update=>serial(s,async()=>{
   if(!active())return;
   if(update.qr){
    const qr=await makeQr(update.qr);
    if(active()){s.qr=qr;s.status='qr_ready';}
   }
   if(!active())return;
   if(update.connection==='open'){s.status='connected';s.qr=null;s.retries=0;}
   if(update.connection!=='close')return;
   const code=update.lastDisconnect?.error?.output?.statusCode ?? update.lastDisconnect?.error?.statusCode;
   invalidate(s);
   const closeGeneration=s.generation;
   try{await auth.flush();}catch(_){if(s.generation===closeGeneration){s.status='persistence_error';await release(s);}return;}
   if(s.generation!==closeGeneration||!s.lease)return;
   if([disconnectReasons.loggedOut,disconnectReasons.badSession].filter(x=>x!=null).includes(code)){
    // No borrar de forma automática: requiere reset autorizado y protección contra eventos viejos.
    s.status='needs_relink';await release(s);return;
   }
   if(code!=null && code===disconnectReasons.connectionReplaced){s.status='replaced';await release(s);return;}
   s.status='reconnecting';
   const delay=Math.round(Math.min(60000,1000*2**Math.min(s.retries++,6))*(0.8+0.4*random()));
   s.timer=setTimer(()=>{
    s.timer=null;serial(s,async()=>{
     if(s.status!=='reconnecting'||!s.lease)return;
     try{await openSocket(id,s)}catch(_){invalidate(s);s.status='unavailable';await release(s);}
    });
   },delay);
  }));
  sock.ev.on('messages.upsert',event=>{
   if(!active()||s.status!=='connected'||event?.type!=='notify')return;
   for(const message of event.messages||[]){
    const jid=String(message?.key?.remoteJid||'');
    if(!jid||message?.key?.fromMe||jid.endsWith('@g.us')||jid.endsWith('@newsletter')||jid.endsWith('@broadcast'))continue;
    Promise.resolve().then(async()=>{if(active()){await s.lease.assertHeld();if(active())await onInbound({tenantId:id,socket:sock,message});}}).catch(()=>{});
   }
  });
  sock.ev.on('call',calls=>{
   for(const call of calls||[]){if(!active()||call?.status!=='offer'||!call.id||!call.from)continue;
    Promise.resolve().then(async()=>{await s.lease?.assertHeld();if(active()&&s.lease)await sock.rejectCall?.(call.id,call.from)}).catch(()=>{});}
  });
 }
 async function start(id){
  const s=current(id);if(s.starting)return s.starting;
  if(['connecting','connected','qr_ready','reconnecting'].includes(s.status))return status(id);
  s.starting=(async()=>{
   const generation=++s.generation;s.status='acquiring';
   try{
    const lease=await acquireLease(id,()=>lost(id,s));
    if(s.generation!==generation){if(lease)await lease.release();return status(id);}
    if(!lease){s.status='owned_elsewhere';return status(id);}
    s.lease=lease;await openSocket(id,s);
   }catch(_){if(s.status!=='stopped'&&s.status!=='stopping'&&s.status!=='lease_lost'&&s.status!=='persistence_error'){invalidate(s);s.status='unavailable';await release(s);}}
   return status(id);
  })();
  try{return await s.starting}finally{s.starting=null;}
 }
 async function stop(id){const s=current(id);s.status='stopping';invalidate(s);try{await s.auth?.flush()}catch(_){}await release(s);s.status='stopped';return status(id);}
 function socketFor(id){const s=current(id);return s.status==='connected'?s.socket:null;}
 async function assertHeld(id){const s=current(id);if(!s.lease||s.status!=='connected')throw Error('Socket no disponible');await s.lease.assertHeld();if(!s.lease||s.status!=='connected')throw Error('Socket no disponible');}
 return {start,stop,status,socketFor,assertHeld};
}
