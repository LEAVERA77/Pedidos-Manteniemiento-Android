import {describe,it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({legacy:vi.fn(),assert:vi.fn(async()=>{}),log:vi.fn(async()=>{})}));
vi.mock('../db/neon.js',()=>({query:vi.fn(async()=>({rows:[]}))}));
vi.mock('../services/baileysWhatsapp.js',()=>({sendText:mocks.legacy}));
vi.mock('../services/baileysBroadcastSafety.js',()=>({assertBaileysBroadcastTenant:mocks.assert}));
vi.mock('../services/whatsappNotificacionesLog.js',()=>({logWhatsappMensajeEnviado:mocks.log,logWhatsappMensajeRecibido:vi.fn()}));
import {runBaileysTenantContext} from '../services/baileysTenantContext.js';
import {sendBotWhatsAppText,sendTenantWhatsAppText} from '../services/whatsappService.js';
const args={tenantId:1,toDigits:'5493436980000',bodyText:'hola'};
describe('envíos indirectos durante entrada Baileys tenant',()=>{
 afterEach(()=>{delete process.env.WHATSAPP_PROVIDER;vi.clearAllMocks()});
 it('manda por adaptador ligado al tenant, nunca por socket legado',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';const sendReply=vi.fn(async()=>({ok:true,data:{id:'x'}}));
  const results=await runBaileysTenantContext({tenantId:1,sendReply},async()=>Promise.all([
   sendBotWhatsAppText({...args,webhookPhoneNumberId:'baileys-bot'}),sendTenantWhatsAppText(args),sendTenantWhatsAppText({...args,tenantId:2})
  ]));
  expect(results.map(r=>r.ok)).toEqual([true,true,false]);expect(results[2].error).toBe('baileys_tenant_context_mismatch');
  expect(sendReply).toHaveBeenCalledTimes(2);expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.assert).not.toHaveBeenCalled();
 });
 it('respuesta vacía, error o cambio de proveedor nunca reenvían por legacy o Meta',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';
  for(const sendReply of [async()=>undefined,async()=>{throw Error('fallo')}]){
   const r=await runBaileysTenantContext({tenantId:1,sendReply},()=>sendTenantWhatsAppText(args));expect(r.ok).toBe(false);
  }
  process.env.WHATSAPP_PROVIDER='meta';const sendReply=vi.fn(async()=>({ok:true}));
  const r=await runBaileysTenantContext({tenantId:1,sendReply},()=>sendTenantWhatsAppText(args));
  expect(r.ok).toBe(false);expect(sendReply).not.toHaveBeenCalled();expect(mocks.legacy).not.toHaveBeenCalled();
 });
 it('fuera de contexto conserva el camino legado existente',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';mocks.legacy.mockResolvedValue({ok:true,data:{}});
  expect((await sendTenantWhatsAppText(args)).ok).toBe(true);
  expect(mocks.assert).toHaveBeenCalledWith(1);expect(mocks.legacy).toHaveBeenCalledOnce();
 });
});
