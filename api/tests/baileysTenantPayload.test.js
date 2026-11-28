import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {buildTenantBotPayload,downloadTenantImage,tenantInboundText} from '../services/baileysTenantPayload.js';
import {consumeBaileysMediaBuffer,storeBaileysMediaBuffer} from '../services/baileysMediaStore.js';
const sender='5493436980000';
const message=msg=>({key:{id:'m1'},messageTimestamp:1700000000,pushName:'Persona',message:msg});
const jpeg=Buffer.from([0xff,0xd8,0xff,0x01,0x02]);
describe('traducción y medios Baileys aislados',()=>{
 it('traduce texto efímero y ubicación sin aceptar tenant desde el contenido',async()=>{
  const m=message({ephemeralMessage:{message:{extendedTextMessage:{text:'hola'}}}});
  expect(tenantInboundText(m)).toBe('hola');
  const p=await buildTenantBotPayload({tenantId:2,message:m,senderDigits:sender});
  expect(p.entry[0].changes[0].value.messages[0]).toMatchObject({from:sender,type:'text',text:{body:'hola'}});
  const loc=await buildTenantBotPayload({tenantId:2,senderDigits:sender,message:message({locationMessage:{degreesLatitude:-31,degreesLongitude:-60}})});
  expect(loc.entry[0].changes[0].value.messages[0].location).toEqual({latitude:-31,longitude:-60});
  await expect(buildTenantBotPayload({tenantId:2,senderDigits:sender,message:message({locationMessage:{degreesLatitude:100,degreesLongitude:0}})})).rejects.toThrow(/Ubicación/);
 });
 it('la imagen tiene identificador aleatorio y solo la consume el mismo tenant',async()=>{
  const p=await buildTenantBotPayload({tenantId:1,senderDigits:sender,message:message({imageMessage:{}}),downloadImage:async()=>({buffer:jpeg,mimeType:'image/jpeg'})});
  const id=p.entry[0].changes[0].value.messages[0].image.id;
  expect(id).toMatch(/^baileys-media:v2:[0-9a-f]{36}$/);
  expect(consumeBaileysMediaBuffer(id,{tenantId:2})).toBeNull();expect(consumeBaileysMediaBuffer(id)).toBeNull();
  expect(consumeBaileysMediaBuffer(id,{tenantId:1}).buffer).toEqual(jpeg);
  expect(consumeBaileysMediaBuffer(id,{tenantId:1})).toBeNull();
  expect(()=>storeBaileysMediaBuffer('baileys-media:v2:x',jpeg)).toThrow(/sin entidad/);
 });
 it('conserva compatibilidad con medios legados sin tenant',()=>{
  storeBaileysMediaBuffer('baileys-media:legacy',jpeg,'image/jpeg');
  expect(consumeBaileysMediaBuffer('baileys-media:legacy',{tenantId:5}).buffer).toEqual(jpeg);
 });
 it('rechaza imágenes de hosts externos y direcciones engañosas antes de descargar',async()=>{
  const download=vi.fn();
  for(const url of ['http://mmg.whatsapp.net/x','https://whatsapp.net.example.com/x','https://usuario@mmg.whatsapp.net/x','https://127.0.0.1/x']){
   await expect(downloadTenantImage(message({imageMessage:{url}}),{download})).rejects.toThrow(/Origen/);
  }
  await expect(downloadTenantImage(message({imageMessage:{directPath:'//evil/x'}}),{download})).rejects.toThrow(/Ruta/);
  expect(download).not.toHaveBeenCalled();
 });
 it('deshabilita por defecto la descarga real hasta contar con transporte seguro',async()=>{
  await expect(downloadTenantImage(message({imageMessage:{url:'https://mmg.whatsapp.net/x'}}))).rejects.toThrow(/deshabilitada/);
 });
 it('limita contenido real, valida formato y aplica AbortSignal al stream',async()=>{
  const msg=message({imageMessage:{url:'https://mmg.whatsapp.net/x'}});
  const download=vi.fn(async()=>Readable.from([jpeg]));
  expect(await downloadTenantImage(msg,{download})).toEqual({buffer:jpeg,mimeType:'image/jpeg'});
  expect(download.mock.calls[0][2].options.signal).toBeInstanceOf(AbortSignal);
  await expect(downloadTenantImage(msg,{download:async()=>Readable.from([Buffer.alloc(8*1024*1024+1)])})).rejects.toThrow(/grande/);
  await expect(downloadTenantImage(msg,{download:async()=>Readable.from([Buffer.from('no es una imagen')])})).rejects.toThrow(/reconocida/);
 });
 it('falla cerrado ante sender ausente, mensaje desconocido o payload demasiado grande',async()=>{
  await expect(buildTenantBotPayload({tenantId:0,senderDigits:sender,message:message({conversation:'hola'})})).rejects.toThrow(/inválido/);
  await expect(buildTenantBotPayload({tenantId:1,senderDigits:'x',message:message({conversation:'hola'})})).rejects.toThrow(/inválido/);
  await expect(buildTenantBotPayload({tenantId:1,senderDigits:sender,message:message({reactionMessage:{}})})).rejects.toThrow(/no soportado/);
  await expect(buildTenantBotPayload({tenantId:1,senderDigits:sender,message:message({imageMessage:{}}),downloadImage:async()=>({buffer:Buffer.alloc(8*1024*1024+1),mimeType:'image/jpeg'})})).rejects.toThrow(/inválida/);
 });
});
