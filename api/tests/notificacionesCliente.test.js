import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const frontPath = existsSync(resolve('../app.js')) ? resolve('../app.js') : resolve('../app/src/main/assets/app.js');
const source = readFileSync(frontPath, 'utf8');
const start = source.indexOf('let _pollNotifMovilUsaColumnaLeida = true;');
const end = source.indexOf('\nfunction iniciarPollNotifMovil()', start);
if (start < 0 || end < 0) throw new Error('No se encontró el flujo de notificaciones');
const chunk = source.slice(start, end);

function boot({api=true, token=true, offline=false, failure=false}={}) {
  let sessionToken = token ? 'jwt' : null;
  const sqlSimple=vi.fn(async () => ({rows:[]}));
  const send=vi.fn(async (url) => {
    if (failure) throw new Error('No autorizado');
    return url.endsWith('/pendientes') ? {rows:[{id:8,titulo:'Aviso',cuerpo:'mensaje',pedido_id:null}]} : {ok:true};
  });
  const show=vi.fn();
  const context=vm.createContext({
    window: { AndroidLocalNotify:{show} }, app:{u:{id:7}}, modoOffline:offline,
    NEON_OK:true, _sql:()=>{}, getApiBaseUrl:()=>api?'https://api.test':'', getApiToken:()=>sessionToken,
    sqlSimple, gnOperativaFetch:send, esc:(v)=>String(v), esAdmin:()=>false,
    esNotificacionChatInternoPedido:()=>false, resolverFocoPedidoNotificacion:vi.fn(),
    logErrorWeb:vi.fn(), console:{warn:vi.fn()}, encodeURIComponent,
  });
  vm.runInContext(chunk,context);
  return {context,sqlSimple,send,show,setToken:(t)=>{sessionToken=t;}};
}
describe('Cliente de notificaciones', () => {
  it('consulta y marca por API, sin enviar usuario_id ni SQL', async () => {
    const c=boot(); await c.context.window.pollNotificacionesMovil();
    expect(c.send.mock.calls.map(x=>x[0])).toEqual(['/api/notificaciones/pendientes','/api/notificaciones/8/leer']);
    expect(c.send.mock.calls[1][1].method).toBe('PATCH');
    expect(c.sqlSimple).not.toHaveBeenCalled(); expect(c.show).toHaveBeenCalledTimes(1);
  });
  it('sin sesión, offline o ante error de API no vuelve a SQL legado', async () => {
    for (const opts of [{token:false},{offline:true},{failure:true}]) {
      const c=boot(opts); await c.context.window.pollNotificacionesMovil();
      expect(c.sqlSimple).not.toHaveBeenCalled();
    }
  });
  it('descarta la respuesta si la sesión cambia durante la consulta', async () => {
    const c=boot();
    let done;
    c.send.mockImplementationOnce(() => new Promise((resolve) => {done=resolve;}));
    const pending=c.context.window.pollNotificacionesMovil();
    c.setToken('otro-jwt');
    done({rows:[{id:8,titulo:'Aviso',cuerpo:'mensaje'}]});
    await pending;
    expect(c.show).not.toHaveBeenCalled();
    expect(c.send).toHaveBeenCalledTimes(1);
  });
  it('sin API conserva explícitamente la lectura SQL antigua', async () => {
    const c=boot({api:false}); await c.context.window.pollNotificacionesMovil();
    expect(c.sqlSimple).toHaveBeenCalledOnce(); expect(c.send).not.toHaveBeenCalled();
  });
});
