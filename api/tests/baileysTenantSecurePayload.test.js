import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createCipheriv,createHmac,createHash} from 'node:crypto';
import {getMediaKeys} from '@whiskeysockets/baileys';
import {fetchAuthenticatedTenantImage} from '../services/baileysTenantMediaHttp.js';
import {createExperimentalSecureTenantPayload} from '../services/baileysTenantSecurePayload.js';
import {consumeBaileysMediaBuffer} from '../services/baileysMediaStore.js';
const msg={key:{id:'msg'},messageTimestamp:1700000000,message:{imageMessage:{url:'https://mmg.whatsapp.net/a'}}};
const args=(tenantId)=>({tenantId,message:msg,senderDigits:'5493436980000'});
describe('pipeline de imagen tenant no conectado',()=>{
 it('guarda la imagen procesada y solo puede consumirse desde su tenant',async()=>{
  const input=await sharp({create:{width:16,height:20,channels:3,background:'#138b55'}}).png().toBuffer();
  const builder=createExperimentalSecureTenantPayload({fetchImage:async()=>input});
  const payload=await builder(args(1)),id=payload.entry[0].changes[0].value.messages[0].image.id;
  expect(consumeBaileysMediaBuffer(id,{tenantId:2})).toBeNull();
  const result=consumeBaileysMediaBuffer(id,{tenantId:1});
  expect(result.mimeType).toBe('image/jpeg');expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
 });
 it('ensaya el recorrido completo de descarga simulada, integridad y saneamiento',async()=>{
  const plain=await sharp({create:{width:16,height:20,channels:3,background:'#237f10'}}).png().toBuffer();
  const mediaKey=Buffer.alloc(32,9),keys=await getMediaKeys(mediaKey,'image');
  const cipher=createCipheriv('aes-256-cbc',keys.cipherKey,keys.iv),ct=Buffer.concat([cipher.update(plain),cipher.final()]);
  const mac=createHmac('sha256',keys.macKey).update(keys.iv).update(ct).digest().subarray(0,10),encrypted=Buffer.concat([ct,mac]);
  const digest=b=>createHash('sha256').update(b).digest();
  const message={...msg,message:{imageMessage:{url:'https://mmg.whatsapp.net/a',mediaKey,fileLength:plain.length,fileSha256:digest(plain),fileEncSha256:digest(encrypted)}}};
  const request=(_url,_opts,callback)=>{const req=new EventEmitter();req.end=()=>{const res=Readable.from([encrypted]);res.statusCode=200;res.headers={};process.nextTick(()=>callback(res));};req.destroy=()=>{};return req;};
  const builder=createExperimentalSecureTenantPayload({fetchImage:image=>fetchAuthenticatedTenantImage(image,{resolve4:async()=>['1.1.1.1'],request})});
  const payload=await builder({...args(8),message});
  const result=consumeBaileysMediaBuffer(payload.entry[0].changes[0].value.messages[0].image.id,{tenantId:8});
  expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
 });
 it('restringe el procesamiento simultáneo por tenant y libera cupo tras un error',async()=>{
  let release;const hold=new Promise(r=>{release=r});
  const fetchImage=vi.fn(async()=>{await hold;throw Error('fallo');});
  const builder=createExperimentalSecureTenantPayload({fetchImage});
  const first=builder(args(1));
  await expect(builder(args(1))).rejects.toThrow(/ocupada/);
  const second=builder(args(2));expect(fetchImage).toHaveBeenCalledTimes(2);
  release();await expect(first).rejects.toThrow('fallo');await expect(second).rejects.toThrow('fallo');
  await expect(builder(args(1))).rejects.toThrow('fallo');expect(fetchImage).toHaveBeenCalledTimes(3);
 });
 it('rechaza ingreso sin tenant verificado antes de descargar',async()=>{
  const fetchImage=vi.fn();const builder=createExperimentalSecureTenantPayload({fetchImage});
  await expect(builder(args(0))).rejects.toThrow(/inválido/);expect(fetchImage).not.toHaveBeenCalled();
 });
});
