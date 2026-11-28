import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {Readable,PassThrough} from 'node:stream';
import {createCipheriv,createHash,createHmac} from 'node:crypto';
import {getMediaKeys} from '@whiskeysockets/baileys';
import {fetchEncryptedTenantMedia,fetchAuthenticatedTenantImage} from '../services/baileysTenantMediaHttp.js';
const image={url:'https://mmg.whatsapp.net/object',directPath:'/v/t62/example?auth=x'};
function mockRequest({status=200,headers={},chunks=[Buffer.from('abc')],hang=false}={}){
 const req=new EventEmitter();req.end=vi.fn();req.destroy=vi.fn();let response;
 const request=vi.fn((url,options,callback)=>{
  process.nextTick(()=>{
   if(hang){response=new PassThrough();response.statusCode=status;response.headers=headers;callback(response);return;}
   response=Readable.from(chunks);response.statusCode=status;response.headers=headers;callback(response);
  });return req;
 });
 return {request,req,getResponse:()=>response};
}
describe('transporte experimental de medios',()=>{
 it('fija IPv4 a HTTPS, no usa agente compartido ni compresión',async()=>{
  const {request}=mockRequest();
  const result=await fetchEncryptedTenantMedia(image,{resolve4:async()=>['1.1.1.1'],request});
  expect(result.toString()).toBe('abc');
  const [url,options]=request.mock.calls[0];expect(url.href).toBe('https://mmg.whatsapp.net/v/t62/example?auth=x');
  expect(options.agent).toBe(false);expect(options.family).toBe(4);expect(options.headers['accept-encoding']).toBe('identity');
  const callback=vi.fn();options.lookup('mmg.whatsapp.net',{},callback);expect(callback).toHaveBeenCalledWith(null,'1.1.1.1',4);
  const bad=vi.fn();options.lookup('other.example',{},bad);expect(bad.mock.calls[0][0]).toBeInstanceOf(Error);
 });
 it('rechaza hosts o rutas engañosas antes de resolver o conectar',async()=>{
  const resolve4=vi.fn(),request=vi.fn();
  for(const url of ['http://mmg.whatsapp.net/a','https://mmg.whatsapp.net.evil.example/a','https://u@mmg.whatsapp.net/a','https://mmg.whatsapp.net:444/a','https://127.0.0.1/a']){
   await expect(fetchEncryptedTenantMedia({url},{resolve4,request})).rejects.toThrow(/Origen/);
  }
  for(const directPath of ['//evil/a','/\\evil/a','/abc#fragment'])
   await expect(fetchEncryptedTenantMedia({...image,directPath},{resolve4,request})).rejects.toThrow(/Ruta/);
  expect(resolve4).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
 });
 it('no abre conexión ante DNS privado, mixto, especial o vacío',async()=>{
  const request=vi.fn();
  for(const addresses of [[],['127.0.0.1'],['10.1.2.3'],['169.254.169.254'],['198.18.0.2'],['::1'],['1.1.1.1','192.168.0.1']])
   await expect(fetchEncryptedTenantMedia(image,{resolve4:async()=>addresses,request})).rejects.toThrow(/DNS/);
  expect(request).not.toHaveBeenCalled();
 });
 it('rechaza redirects, compresión y límites de tamaño declarados y reales',async()=>{
  for(const opts of [{status:302},{headers:{'content-encoding':'gzip'}},{headers:{'content-length':String(9*1024*1024)}},{chunks:[Buffer.alloc(8*1024*1024+27)]}]){
   const {request,req}=mockRequest(opts);
   await expect(fetchEncryptedTenantMedia(image,{resolve4:async()=>['1.1.1.1'],request})).rejects.toThrow();
   expect(req.destroy).toHaveBeenCalled();
  }
 });
 it('el plazo total interrumpe DNS o una respuesta sin terminar',async()=>{
  const request=vi.fn();
  await expect(fetchEncryptedTenantMedia(image,{resolve4:()=>new Promise(()=>{}),request,timeoutMs:20})).rejects.toThrow(/Tiempo/);
  expect(request).not.toHaveBeenCalled();
  const mock=mockRequest({hang:true});
  await expect(fetchEncryptedTenantMedia(image,{resolve4:async()=>['1.1.1.1'],request:mock.request,timeoutMs:20})).rejects.toThrow(/Tiempo/);
  expect(mock.getResponse().destroyed).toBe(true);
 });
 it('la composición valida cifrado, MAC y hashes antes de entregar bytes',async()=>{
  const plain=Buffer.from('contenido de imagen de prueba'),mediaKey=Buffer.alloc(32,4),keys=await getMediaKeys(mediaKey,'image');
  const cipher=createCipheriv('aes-256-cbc',keys.cipherKey,keys.iv),ct=Buffer.concat([cipher.update(plain),cipher.final()]);
  const mac=createHmac('sha256',keys.macKey).update(keys.iv).update(ct).digest().subarray(0,10),encrypted=Buffer.concat([ct,mac]);
  const hash=x=>createHash('sha256').update(x).digest();
  const metadata={...image,mediaKey,fileLength:plain.length,fileSha256:hash(plain),fileEncSha256:hash(encrypted)};
  const {request}=mockRequest({chunks:[encrypted]});
  expect(await fetchAuthenticatedTenantImage(metadata,{resolve4:async()=>['1.1.1.1'],request})).toEqual(plain);
 });
});
