import {describe,it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
const mocks=vi.hoisted(()=>({sockets:[],clear:vi.fn(),load:vi.fn(async()=>({state:{creds:{},keys:{}},saveCreds:vi.fn()}))}));
vi.mock('@whiskeysockets/baileys',async original=>{
 const mod=await original();
 return {...mod,default:vi.fn(()=>{const sock={ev:new EventEmitter(),ws:{close:vi.fn()}};mocks.sockets.push(sock);return sock;}),
  fetchLatestBaileysVersion:vi.fn(async()=>({version:[1,2,3]}))};
});
vi.mock('../services/baileysAuthPostgres.js',()=>({usePostgresAuthState:mocks.load,clearPostgresAuthState:mocks.clear}));
vi.mock('../services/whatsappBotMeta.js',()=>({handleInboundMetaWhatsAppPayload:vi.fn()}));
vi.mock('../services/whatsappNotificacionesLog.js',()=>({logWhatsappMensajeRecibido:vi.fn()}));
vi.mock('../services/baileysBroadcastSafety.js',()=>({isBaileysBroadcastStop:vi.fn(),recordBaileysBroadcastStop:vi.fn(),pauseBaileysBroadcastForUnresolvedStop:vi.fn(),tripLocalBaileysBroadcastStop:vi.fn()}));
import {DisconnectReason} from '@whiskeysockets/baileys';
describe('sesión legacy: conservar credenciales ante logout o sesión dañada',()=>{
 afterEach(()=>{delete process.env.BAILEYS_MULTITENANT_ENABLED;vi.useRealTimers()});
 it.each([['loggedOut',DisconnectReason.loggedOut],['badSession',DisconnectReason.badSession]])('%s no borra ni reconecta y exige revisión, y eventos viejos se ignoran',async(_name,code)=>{
  vi.resetModules();mocks.sockets.length=0;mocks.clear.mockClear();
  const {startBaileys,getBaileysStatus}=await import('../services/baileysWhatsapp.js');
  vi.useFakeTimers();delete process.env.BAILEYS_MULTITENANT_ENABLED;
  await startBaileys();const sock=mocks.sockets.at(-1),handler=sock.ev.listeners('connection.update')[0];
  await handler({connection:'open'});expect(getBaileysStatus().status).toBe('connected');
  await handler({connection:'close',lastDisconnect:{error:{output:{statusCode:code}}}});
  expect(getBaileysStatus().status).toBe('needs_relink');expect(mocks.clear).not.toHaveBeenCalled();
  await expect(startBaileys()).rejects.toThrow(/review/);
  await vi.advanceTimersByTimeAsync(10000);expect(mocks.sockets).toHaveLength(1);
  await handler({connection:'open',qr:'old'});expect(getBaileysStatus().status).toBe('needs_relink');
 });
});
