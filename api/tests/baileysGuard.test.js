import {describe,it,expect,vi} from 'vitest';
import {createBaileysGuard} from '../services/baileysGuard.js';
function fixture(){
 let clock=100000;const events=[];const sock={readMessages:vi.fn(async()=>events.push(['read',clock])),sendPresenceUpdate:vi.fn(async state=>events.push([state,clock])),sendMessage:vi.fn(async()=>{events.push(['send',clock]);return {id:'ok'}})};
 const deps={checkAndReserve:vi.fn(async()=>({allowed:true})),isReplyWindowOpen:vi.fn(async()=>true),assertLease:vi.fn(async()=>{}),sleep:vi.fn(async ms=>{clock+=ms}),now:()=>clock,random:()=>0};
 const guard=createBaileysGuard(deps),job=(tenantId=1)=>({tenantId,jid:'5493436980000@s.whatsapp.net',text:'Hola',getSocket:()=>sock,messageKey:{id:'a'}});
 return {guard,job,sock,deps,events};
}
describe('cola Baileys aislada, aún sin integración',()=>{
 it('serializa mensajes por tenant, lectura antes de respuesta y pausa mínima entre intentos',async()=>{
  const {guard,job,events}=fixture();expect((await Promise.all([guard.enqueue(job()),guard.enqueue(job())])).every(x=>x.ok)).toBe(true);
  const sends=events.filter(x=>x[0]==='send');expect(sends).toHaveLength(2);expect(sends[1][1]-sends[0][1]).toBeGreaterThanOrEqual(2500);
  expect(events.map(x=>x[0])).toEqual(['read','composing','send','paused','read','composing','send','paused']);
 });
 it('rechaza destinatarios que no son conversaciones privadas y no envía fuera de ventana',async()=>{
  const {guard,job,sock,deps}=fixture();expect((await guard.enqueue({...job(),jid:'1234567890@g.us'})).error).toBe('invalid_params');
  deps.isReplyWindowOpen.mockResolvedValue(false);expect((await guard.enqueue(job())).error).toBe('outside_reply_window_or_muted');expect(sock.sendMessage).not.toHaveBeenCalled();
 });
 it('revalida permiso después de escribir y no envía si la cuota falla',async()=>{
  const {guard,job,sock,deps}=fixture();deps.isReplyWindowOpen.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await guard.enqueue(job())).ok).toBe(false);expect(sock.sendMessage).not.toHaveBeenCalled();
  deps.isReplyWindowOpen.mockResolvedValue(true);deps.checkAndReserve.mockRejectedValue(Error('DB caída'));
  expect((await guard.enqueue(job())).error).toBe('guard_unavailable');expect(sock.sendMessage).not.toHaveBeenCalled();
 });
 it('un fallo durante sendMessage produce resultado incierto, no reintenta',async()=>{
  const {guard,job,sock}=fixture();sock.sendMessage.mockRejectedValue(Error('red'));
  expect(await guard.enqueue(job())).toMatchObject({ok:false,deliveryUnknown:true});expect(sock.sendMessage).toHaveBeenCalledTimes(1);
 });
 it('no acepta continuación con socket reemplazado durante espera',async()=>{
  const {guard,job,sock}=fixture();let calls=0;const task={...job(),getSocket:()=>++calls===1?sock:null};
  expect((await guard.enqueue(task)).error).toBe('socket_changed');expect(sock.sendMessage).not.toHaveBeenCalled();
 });
});
