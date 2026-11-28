import {describe,it,expect,vi} from 'vitest';
import {createBaileysTenantInbound} from '../services/baileysTenantInbound.js';
function fixture(){
 const socket={};let current=socket;
 const manager={socketFor:vi.fn(()=>current),assertHeld:vi.fn(async()=>{}),stop:vi.fn(async()=>{current=null})};
 const guardStore={recordInbound:vi.fn(async()=>({accepted:true,respond:true,storm:false}))};
 const queue={enqueue:vi.fn(async job=>({ok:true,job}))};
 const handleBot=vi.fn(async()=>{}),buildPayload=vi.fn(async()=>({object:'test'})),recordStop=vi.fn(async()=>{}),pauseTenant=vi.fn(async()=>{});
 const extractText=vi.fn(message=>message.message?.conversation||'');
 const isStop=vi.fn(text=>text.toLowerCase()==='stop');
 const bridge=createBaileysTenantInbound({manager,guardStore,queue,handleBot,buildPayload,extractText,isStop,recordStop,pauseTenant});
 const make=(text='hola',jid='5493436980000@s.whatsapp.net')=>({tenantId:1,socket,message:{key:{remoteJid:jid,id:'id1'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:text}}});
 return {bridge,manager,guardStore,queue,handleBot,buildPayload,recordStop,pauseTenant,make,setSocket:value=>{current=value}};
}
describe('puente experimental de entrada Baileys',()=>{
 it('registra entrada, pasa tenant y solo responde al remitente por la cola',async()=>{
  const f=fixture();const task=f.make();
  f.handleBot.mockImplementation(async(_body,tenant,{sendReply,senderDigits})=>{
   expect(tenant).toBe(1);expect(senderDigits).toBe('5493436980000');
   expect((await sendReply({tenantId:2,toDigits:senderDigits,bodyText:'no'})).ok).toBe(false);
   expect((await sendReply({tenantId:1,toDigits:'5493436989999',bodyText:'no'})).ok).toBe(false);
   expect((await sendReply({tenantId:1,toDigits:'543436980000',bodyText:'respuesta'})).ok).toBe(true);
  });
  expect((await f.bridge.onInbound(task)).reason).toBe('handled');
  expect(f.guardStore.recordInbound).toHaveBeenCalledWith(expect.objectContaining({tenantId:1,jid:'5493436980000@s.whatsapp.net',messageId:'id1'}));
  expect(f.queue.enqueue).toHaveBeenCalledTimes(1);
  const job=f.queue.enqueue.mock.calls[0][0];expect(job.jid).toBe('5493436980000@s.whatsapp.net');expect(job.getSocket()).toBe(task.socket);
  f.setSocket({});expect(job.getSocket()).toBeNull();
 });
 it('procesa STOP aunque no tenga id ni fecha y sin pasar por spam',async()=>{
  const f=fixture();const task=f.make('STOP');delete task.message.key.id;delete task.message.messageTimestamp;
  expect(await f.bridge.onInbound(task)).toMatchObject({accepted:true,reason:'stop_recorded'});
  expect(f.recordStop).toHaveBeenCalledWith({tenantId:1,jid:'5493436980000@s.whatsapp.net'});
  expect(f.guardStore.recordInbound).not.toHaveBeenCalled();expect(f.handleBot).not.toHaveBeenCalled();
 });
 it('cierra el socket si no puede registrar STOP o el remitente es LID',async()=>{
  let f=fixture();f.recordStop.mockRejectedValue(Error('db'));
  expect((await f.bridge.onInbound(f.make('STOP'))).reason).toBe('stop_persistence_failed');expect(f.manager.stop).toHaveBeenCalledWith(1);
  f=fixture();expect((await f.bridge.onInbound(f.make('STOP','999999999999@lid'))).reason).toBe('unresolved_stop');
  expect(f.manager.stop).toHaveBeenCalledWith(1);expect(f.recordStop).not.toHaveBeenCalled();expect(f.pauseTenant).toHaveBeenCalledWith({tenantId:1,reason:'unresolved_stop'});
 });
 it('sin permiso o evento repetido no llama bot ni cola',async()=>{
  const f=fixture();f.guardStore.recordInbound.mockResolvedValueOnce({accepted:false,reason:'duplicate_event'}).mockResolvedValueOnce({accepted:true,respond:false});
  expect((await f.bridge.onInbound(f.make())).reason).toBe('duplicate_event');expect((await f.bridge.onInbound(f.make())).reason).toBe('suppressed');
  expect(f.handleBot).not.toHaveBeenCalled();expect(f.queue.enqueue).not.toHaveBeenCalled();
 });
 it('en tormenta da respuesta breve solo mediante la cola y no ejecuta el bot',async()=>{
  const f=fixture();f.guardStore.recordInbound.mockResolvedValue({accepted:true,respond:true,storm:true});
  expect((await f.bridge.onInbound(f.make())).reason).toBe('storm');expect(f.queue.enqueue).toHaveBeenCalledOnce();expect(f.handleBot).not.toHaveBeenCalled();
 });
 it('rechaza mensajes propios, grupos, LID sin STOP, datos inválidos y socket viejo',async()=>{
  const f=fixture(),own=f.make();own.message.key.fromMe=true;
  expect((await f.bridge.onInbound(own)).reason).toBe('invalid_context');
  expect((await f.bridge.onInbound(f.make('hola','123456789@g.us'))).reason).toBe('unresolved_sender');
  expect((await f.bridge.onInbound(f.make('hola','999999999999@lid'))).reason).toBe('unresolved_sender');
  const missing=f.make();missing.message.messageTimestamp=0;expect((await f.bridge.onInbound(missing)).reason).toBe('invalid_message');
  const old=f.make();f.setSocket({});expect((await f.bridge.onInbound(old)).reason).toBe('invalid_context');
  expect(f.queue.enqueue).not.toHaveBeenCalled();
 });
 it('fallas de lease o DB cierran el flujo sin enviar',async()=>{
  const f=fixture();f.manager.assertHeld.mockRejectedValueOnce(Error('lease'));
  expect((await f.bridge.onInbound(f.make())).reason).toBe('processing_unavailable');
  f.guardStore.recordInbound.mockRejectedValueOnce(Error('db'));
  expect((await f.bridge.onInbound(f.make())).reason).toBe('processing_unavailable');
  expect(f.handleBot).not.toHaveBeenCalled();expect(f.queue.enqueue).not.toHaveBeenCalled();
 });
 it('detiene la instancia local si una baja llega cuando falla el lease',async()=>{
  const f=fixture();f.manager.assertHeld.mockRejectedValue(Error('lease'));
  expect((await f.bridge.onInbound(f.make('STOP'))).reason).toBe('processing_unavailable');
  expect(f.manager.stop).toHaveBeenCalledWith(1);expect(f.pauseTenant).toHaveBeenCalledWith({tenantId:1,reason:'stop_unverified'});expect(f.queue.enqueue).not.toHaveBeenCalled();
 });

 it('si no se puede guardar la pausa cierra el socket y señala bloqueo no durable',async()=>{
  const f=fixture();f.recordStop.mockRejectedValue(Error('db'));f.pauseTenant.mockRejectedValue(Error('db'));
  expect((await f.bridge.onInbound(f.make('STOP'))).reason).toBe('pause_unavailable');
  expect(f.manager.stop).toHaveBeenCalledWith(1);
 });

});
