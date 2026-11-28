import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createBaileysTenantManager} from '../services/baileysTenantManager.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const sockets=[],timers=[],leases=[],onInbound=vi.fn(async()=>{}),auths=[];
 const manager=createBaileysTenantManager({
  acquireLease:vi.fn(async(tenant,onLost)=>{const lease={tenant,onLost,assertHeld:vi.fn(async()=>{}),release:vi.fn(async()=>{})};leases.push(lease);return lease}),
  loadAuth:vi.fn(async()=>{const auth={state:{creds:{},keys:{}},saveCreds:vi.fn(async()=>{}),flush:vi.fn(async()=>{})};auths.push(auth);return auth}),
  makeSocket:vi.fn(async(opts)=>{const sock={opts,ev:new EventEmitter(),ws:{close:vi.fn()},rejectCall:vi.fn(async()=>{})};sockets.push(sock);return sock}),
  makeQr:vi.fn(async qr=>`data:${qr}`),onInbound,disconnectReasons:{loggedOut:401,badSession:500,connectionReplaced:440},random:()=>0,
  setTimer:(f,ms)=>{const t={f,ms};timers.push(t);return t},clearTimer:t=>{t.cancelled=true},
 });return {manager,sockets,timers,leases,auths,onInbound};
}
describe('gestor de sesiones Baileys multi-tenant',()=>{
 it('una instancia por tenant, start idempotente y QR aislado',async()=>{
  const {manager,sockets}=fixture();await Promise.all([manager.start(1),manager.start(1),manager.start(2)]);
  expect(sockets).toHaveLength(2);expect(sockets[0].opts).toMatchObject({tenantId:1,browser:['GestorNova Web','Chrome','124.0.0'],syncFullHistory:false});
  sockets[0].ev.emit('connection.update',{qr:'qr1'});await tick();
  expect(manager.status(1)).toMatchObject({status:'qr_ready',qr:'data:qr1'});expect(manager.status(2).qr).toBeNull();
  sockets[0].ev.emit('connection.update',{connection:'open'});await tick();expect(manager.status(1).status).toBe('connected');expect(manager.socketFor(1)).toBe(sockets[0]);
 });
 it('reconecta errores transitorios con backoff; eventos de socket viejo se ignoran',async()=>{
  const {manager,sockets,timers,auths}=fixture();await manager.start(1);const a=sockets[0];
  a.ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:408}}}});await tick();
  expect(auths[0].flush).toHaveBeenCalled();expect(manager.status(1).status).toBe('reconnecting');expect(timers[0].ms).toBe(800);
  timers[0].f();await tick();expect(sockets).toHaveLength(2);a.ev.emit('connection.update',{connection:'open'});await tick();expect(manager.status(1).status).toBe('connecting');
  sockets[1].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:408}}}});await tick();expect(timers[1].ms).toBe(1600);
 });
 it('logout, reemplazo y errores de persistencia detienen el socket sin eliminar la sesión',async()=>{
  const {manager,sockets,leases,auths}=fixture();await manager.start(1);sockets[0].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:401}}}});await tick();
  expect(manager.status(1).status).toBe('needs_relink');expect(leases[0].release).toHaveBeenCalled();
  await manager.start(2);auths[1].saveCreds.mockRejectedValue(Error('db'));sockets[1].ev.emit('creds.update',{});await tick();
  expect(manager.status(2).status).toBe('persistence_error');expect(sockets[1].ws.close).toHaveBeenCalled();
 });
 it('rechaza llamadas e ignora propios, grupos, canales y estados',async()=>{
  const {manager,sockets,onInbound}=fixture();await manager.start(1);const s=sockets[0];
  s.ev.emit('connection.update',{connection:'open'});await tick();
  const msg=(jid,fromMe=false)=>({key:{remoteJid:jid,fromMe},message:{conversation:'hola'}});
  s.ev.emit('messages.upsert',{type:'notify',messages:[msg('1234567890@g.us'),msg('status@broadcast'),msg('1234567890@newsletter'),msg('1234567890@s.whatsapp.net',true),msg('1234567890@s.whatsapp.net')]});
  s.ev.emit('call',[{status:'offer',id:'call1',from:'1234567890@s.whatsapp.net'}]);await tick();
  expect(onInbound).toHaveBeenCalledTimes(1);expect(onInbound.mock.calls[0][0].tenantId).toBe(1);expect(s.rejectCall).toHaveBeenCalledTimes(1);
 });
 it('stop durante carga de estado no crea socket después de detenerse',async()=>{
  let resume;const blocked=new Promise(r=>{resume=r}),made=vi.fn(async()=>{throw Error('no debería crear socket')});
  const m=createBaileysTenantManager({acquireLease:async()=>({assertHeld:async()=>{},release:async()=>{}}),
   loadAuth:async()=>{await blocked;return {state:{},flush:async()=>{}}},makeSocket:made,makeQr:async()=>'',onInbound:async()=>{}});
  const running=m.start(1);await tick();await m.stop(1);resume();await running;
  expect(m.status(1).status).toBe('stopped');expect(made).not.toHaveBeenCalled();
 });
 it('stop mientras cierra un socket no programa reconexión tardía',async()=>{
  const {manager,sockets,auths,timers}=fixture();await manager.start(1);
  let resume;const waiting=new Promise(r=>{resume=r});auths[0].flush.mockImplementationOnce(()=>waiting).mockResolvedValue(undefined);
  sockets[0].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:408}}}});await tick();
  await manager.stop(1);resume();await tick();
  expect(manager.status(1).status).toBe('stopped');expect(timers).toHaveLength(0);
 });
 it('pérdida del lease cierra el socket sin reconexión',async()=>{
  const {manager,sockets,leases,timers}=fixture();await manager.start(1);leases[0].onLost();await tick();
  expect(manager.status(1).status).toBe('lease_lost');expect(sockets[0].ws.close).toHaveBeenCalled();expect(timers).toHaveLength(0);
 });
});
