import {describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({upload:vi.fn(async()=>({secureUrl:'ok'})),downloadMeta:vi.fn(),downloadWhapi:vi.fn()}));
vi.mock('../services/cloudinary.js',()=>({uploadPedidoImageBufferWithFallback:m.upload,destroyCloudinaryImageBySecureUrl:vi.fn()}));
vi.mock('../services/metaWhatsapp.js',()=>({downloadWhatsAppMediaById:m.downloadMeta}));
vi.mock('../services/whapiWhatsapp.js',()=>({downloadWhapiMediaBuffer:m.downloadWhapi}));
import {runBaileysTenantContext} from '../services/baileysTenantContext.js';
import {storeBaileysMediaBuffer} from '../services/baileysMediaStore.js';
import {whatsappPedidoSubirFotoDesdeMediaId} from '../services/whatsappPedidoFotoHelpers.js';
describe('consumo de imagen en contexto interno tenant',()=>{
 it('solo admite v2 del mismo tenant y nunca URL directa ni ID legado',async()=>{
  const media='baileys-media:v2:media-context-test',buffer=Buffer.from('image');
  storeBaileysMediaBuffer(media,buffer,'image/jpeg',{tenantId:1});
  const run=fn=>runBaileysTenantContext({tenantId:1,sendReply:async()=>({ok:true})},fn);
  await expect(run(()=>whatsappPedidoSubirFotoDesdeMediaId(media,'',{tenantId:2}))).rejects.toThrow(/context_mismatch/);
  await expect(run(()=>whatsappPedidoSubirFotoDesdeMediaId(media,'',{tenantId:1,directUrl:'https://example.com/x'}))).rejects.toThrow(/context_mismatch/);
  await expect(run(()=>whatsappPedidoSubirFotoDesdeMediaId('baileys-media:legacy','',{tenantId:1}))).rejects.toThrow(/context_mismatch/);
  await expect(run(()=>whatsappPedidoSubirFotoDesdeMediaId('1234','token',{tenantId:1}))).rejects.toThrow(/context_mismatch/);
  expect(await run(()=>whatsappPedidoSubirFotoDesdeMediaId(media,'',{tenantId:1}))).toEqual({secureUrl:'ok'});
  expect(m.upload).toHaveBeenCalledOnce();expect(m.downloadMeta).not.toHaveBeenCalled();expect(m.downloadWhapi).not.toHaveBeenCalled();
 });
});
