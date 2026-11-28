import {describe,it,expect,vi,afterEach} from 'vitest';
const deps=vi.hoisted(()=>({resolve:vi.fn(),legacyResolve:vi.fn(),sendBot:vi.fn(),sendTenant:vi.fn(),setGlobal:vi.fn()}));
vi.mock('../db/neon.js',()=>({query:vi.fn(async()=>({rows:[]})),rawQuery:vi.fn(async()=>({rows:[]}))}));
vi.mock('../services/metaTenantWhatsapp.js',()=>({
 resolveWhatsappBotTargetForTenant:deps.resolve,resolveWhatsappBotTarget:deps.legacyResolve,resolveTenantIdByMetaPhoneNumberId:vi.fn(),
}));
vi.mock('../services/whatsappService.js',()=>({
 sendBotWhatsAppText:deps.sendBot,sendTenantWhatsAppText:deps.sendTenant,
 getWhatsAppCredentialsByMetaPhoneNumberId:vi.fn(),getWhatsAppCredentialsForTenant:vi.fn(),
}));
vi.mock('../services/globalBotState.js',()=>({
 whatsappBotEnvHardDisabled:vi.fn(()=>false),isWhatsAppAutomatedBotDisabled:vi.fn(async()=>false),
 isPhoneWhatsappBotMasterAsync:vi.fn(async()=>true),parseActivarDesactivarComando:vi.fn(t=>t==='activar'?'activar':null),
 setGlobalBotActiveDb:deps.setGlobal,isPhoneWhatsappHumanChatDirect:vi.fn(),
}));
import {handleInboundBaileysTenantPayload} from '../services/whatsappBotMeta.js';
const payload=message=>({entry:[{changes:[{value:{metadata:{phone_number_id:'client-spoofed'},contacts:[],messages:[{from:'5493436980000',...message}]}}]}]});
describe('ruteo interno del bot a tenant explícito',()=>{
 afterEach(()=>{delete process.env.WHATSAPP_PROVIDER;vi.clearAllMocks()});
 it('dos entradas concurrentes responden con su tenant y nunca usan el envío global',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';
  deps.resolve.mockImplementation(async tenantId=>({tenantId,businessType:'agua'}));
  const calls=[];const sendReply=vi.fn(async args=>{await new Promise(r=>setTimeout(r,args.tenantId===1?5:1));calls.push(args);return {ok:true}});
  await Promise.all([1,2].map(t=>handleInboundBaileysTenantPayload(payload({type:'location',location:{}}),t,{sendReply,senderDigits:'5493436980000'})));
  expect(calls.map(x=>x.tenantId).sort()).toEqual([1,2]);
  expect(deps.legacyResolve).not.toHaveBeenCalled();expect(deps.sendBot).not.toHaveBeenCalled();expect(deps.sendTenant).not.toHaveBeenCalled();
 });
 it('comando global heredado no cambia estado global del bot',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';deps.resolve.mockResolvedValue({tenantId:2,businessType:'agua'});
  const sendReply=vi.fn(async()=>({ok:true}));
  await handleInboundBaileysTenantPayload(payload({type:'text',text:{body:'activar'}}),2,{sendReply,senderDigits:'5493436980000'});
  expect(deps.setGlobal).not.toHaveBeenCalled();expect(sendReply).toHaveBeenCalledWith(expect.objectContaining({tenantId:2}));
 });
 it('falla cerrado si el tenant no coincide o falta adaptador; nunca usa legacy',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';deps.resolve.mockResolvedValue({tenantId:1});
  await expect(handleInboundBaileysTenantPayload(payload({type:'text',text:{body:'hola'}}),2,{sendReply:async()=>({ok:true}),senderDigits:'5493436980000'})).rejects.toThrow(/tenant/i);
  await expect(handleInboundBaileysTenantPayload({},2)).rejects.toThrow(/adaptador/);
  process.env.WHATSAPP_PROVIDER='meta';await expect(handleInboundBaileysTenantPayload({},2,{sendReply:async()=>({ok:true})})).rejects.toThrow(/adaptador/);
  expect(deps.sendBot).not.toHaveBeenCalled();expect(deps.legacyResolve).not.toHaveBeenCalled();
 });
 it('usa el tenant explícito también para texto, ubicación, imagen y lista',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';deps.resolve.mockResolvedValue({tenantId:2,businessType:'agua'});
  const sendReply=vi.fn(async()=>({ok:true}));
  const inputs=[
   {type:'text',text:{body:'hola'}},
   {type:'location',location:{latitude:-31,longitude:-60}},
   {type:'image',image:{id:'m1'}},
   {type:'interactive',interactive:{type:'list_reply',list_reply:{id:'foo'}}},
  ];
  for(const input of inputs)await handleInboundBaileysTenantPayload(payload(input),2,{sendReply,senderDigits:'5493436980000'});
  expect(sendReply.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(sendReply.mock.calls.every(([x])=>x.tenantId===2)).toBe(true);
  expect(deps.legacyResolve).not.toHaveBeenCalled();expect(deps.sendBot).not.toHaveBeenCalled();expect(deps.sendTenant).not.toHaveBeenCalled();
 });

 it('no procesa remitentes distintos ni varios mensajes con el mismo adaptador',async()=>{
  process.env.WHATSAPP_PROVIDER='baileys';deps.resolve.mockResolvedValue({tenantId:2,businessType:'agua'});
  const sendReply=vi.fn(async()=>({ok:true}));const opts={sendReply,senderDigits:'5493436989999'};
  await expect(handleInboundBaileysTenantPayload(payload({type:'text',text:{body:'hola'}}),2,opts)).rejects.toThrow(/no coincide/);
  const multi=payload({type:'text',text:{body:'hola'}});multi.entry[0].changes[0].value.messages.push({from:'5493436980000',type:'text',text:{body:'dos'}});
  await expect(handleInboundBaileysTenantPayload(multi,2,{sendReply,senderDigits:'5493436980000'})).rejects.toThrow(/inválido/);
  expect(sendReply).not.toHaveBeenCalled();expect(deps.resolve).not.toHaveBeenCalled();
 });

});
