/** Transporte experimental de medios WhatsApp. NO conectado al runtime. */
import https from 'node:https';
import {resolve4 as dnsResolve4} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {decryptAuthenticatedTenantImage} from './baileysTenantMediaCrypto.js';

const MAX_ENCRYPTED=8*1024*1024+26;
const blocked=new BlockList();
for(const [address,prefix] of [
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
 ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
 ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
])blocked.addSubnet(address,prefix,'ipv4');
function publicIp(address){return isIP(address)===4 && !blocked.check(address,'ipv4');}
function validHost(host){return host==='whatsapp.net'||host.endsWith('.whatsapp.net')||host==='fbcdn.net'||host.endsWith('.fbcdn.net');}
function mediaUrl(image){
 let origin='https://mmg.whatsapp.net',url;
 if(image?.url!=null && image.url!==''){
  try{url=new URL(image.url)}catch(_){throw Error('Origen del medio inválido');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!validHost(url.hostname))throw Error('Origen del medio no autorizado');
  origin=url.origin;
 }
 if(image?.directPath!=null && image.directPath!==''){
  const p=image.directPath;
  if(typeof p!=='string'||!/^\/(?!\/)[^\r\n\\#]*$/.test(p))throw Error('Ruta del medio inválida');
  const candidate=new URL(p,origin);
  if(candidate.origin!==origin||candidate.hash)throw Error('Ruta del medio inválida');
  url=candidate;
 }
 if(!url)throw Error('Falta URL del medio');
 return url;
}
function aborted(signal){return new Promise((_,reject)=>{
 if(signal.aborted)return reject(Error('Tiempo de descarga agotado'));
 signal.addEventListener('abort',()=>reject(Error('Tiempo de descarga agotado')),{once:true});
});}
/**
 * DNS IPv4 previamente validado y fijado al socket HTTPS. Sin redirecciones,
 * compresión ni proxy; límite de bytes reales y plazo total. Los inyectores son
 * exclusivamente para pruebas internas, nunca deben provenir del cliente.
 */
export async function fetchEncryptedTenantMedia(image,{resolve4=dnsResolve4,request=https.request,timeoutMs=15000}={}){
 if(typeof resolve4!=='function'||typeof request!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
  throw Error('Configuración de descarga inválida');
 const url=mediaUrl(image),controller=new AbortController();
 let req,res;
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 controller.signal.addEventListener('abort',()=>{
  const error=Error('Tiempo de descarga agotado');
  req?.destroy?.(error);res?.destroy?.(error);
 },{once:true});
 try{
  const addresses=await Promise.race([resolve4(url.hostname),aborted(controller.signal)]);
  if(!Array.isArray(addresses)||!addresses.length||addresses.some(x=>!publicIp(x)))throw Error('DNS de medio no permitido');
  const pinned=addresses[0];
  const response=await Promise.race([new Promise((resolve,reject)=>{
   req=request(url,{method:'GET',agent:false,family:4,signal:controller.signal,headers:{'accept-encoding':'identity',origin:'https://web.whatsapp.com'},
    lookup:(hostname,_options,cb)=>{
     if(hostname!==url.hostname)return cb(Error('Host de medio inesperado'));
     cb(null,pinned,4);
    }},resolve);
   req.on('error',reject);req.end();
  }),aborted(controller.signal)]);
  res=response;
  if(res.statusCode!==200)throw Error('Respuesta de medio no permitida');
  const enc=String(res.headers?.['content-encoding']||'identity').toLowerCase();
  if(enc!=='identity')throw Error('Compresión de medio no permitida');
  const contentLength=res.headers?.['content-length'];
  if(contentLength!=null && (!/^\d+$/.test(String(contentLength))||Number(contentLength)>MAX_ENCRYPTED))throw Error('Medio demasiado grande');
  const chunks=[];let size=0;
  for await(const chunk of res){
   if(controller.signal.aborted)throw Error('Tiempo de descarga agotado');
   const b=Buffer.from(chunk);size+=b.length;
   if(size>MAX_ENCRYPTED)throw Error('Medio demasiado grande');
   chunks.push(b);
  }
  if(controller.signal.aborted)throw Error('Tiempo de descarga agotado');
  return Buffer.concat(chunks,size);
 }finally{clearTimeout(timer);res?.destroy?.();req?.destroy?.();}
}
/** Descarga y autentica, pero no valida formato/píxeles ni se conecta a producción. */
export async function fetchAuthenticatedTenantImage(image,options){
 const encrypted=await fetchEncryptedTenantMedia(image,options);
 return decryptAuthenticatedTenantImage(image,encrypted);
}
