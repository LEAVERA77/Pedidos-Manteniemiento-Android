const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const assets = fs.existsSync(path.join(root, 'app/src/main/assets/app.js')) ? path.join(root, 'app/src/main/assets') : root;
function moduleSource(name) { return fs.readFileSync(path.join(assets, 'modules', name), 'utf8').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, ''); }

test('historial por apellido genera un botón con ambas clases y enlaza el pedido', async () => {
  let callback; let selected;
  const out = { innerHTML: '', querySelectorAll(selector) {
    assert.equal(selector, '.gn-hist-pedido-open');
    assert.match(this.innerHTML, /class="nis-historial-item gn-hist-pedido-open" data-pid="28"/);
    return [{ getAttribute: () => '28', addEventListener: (_, fn) => { callback = fn; } }];
  }};
  const document = { readyState: 'complete', getElementById: id => id === 'historial-apellido-result' ? out : null };
  const window = {};
  const ctx = vm.createContext({ window, document, console, esc: x => String(x), toast() {},
    sqlPedidosCoincidenConPersona: () => 'TRUE', abrirDetallePedidoPorId: pid => { selected = pid; } });
  vm.runInContext(moduleSource('busqueda-apellido.js'), ctx);
  ctx.installBusquedaApellidoHistorial({ neonOk: () => true, tenantIdActual: () => 1,
    pedidosFiltroTenantSql: async () => ' AND tenant_id=1', fmtInformeFecha: () => 'fecha',
    sqlSimple: async sql => ({ rows: sql.includes('information_schema') ? [{ x: 1 }] :
      sql.includes('socios_catalogo') ? [{ id: 9, nombre: 'Socio' }] : [{ id: 28, numero_pedido: '2026-00028' }] }) });
  await window.verReclamosSocio(9, 'socios_catalogo'); callback(); assert.equal(selected, 28);
});

test('detalle refresca JWT, usa API del tenant y agrega pedido faltante al estado', async () => {
  let token = ''; let auth; let opened;
  const window = { app: { p: [] }, asegurarJwtApiRest: async () => { token = 'nuevo'; }, getApiToken: () => token,
    gnNormPedidoDesdeApi: p => ({ id: p.id }), detalle: async p => { opened = p; } };
  const document = { getElementById: () => null };
  const ctx = vm.createContext({ window, document, console, toast() {}, gnForceModalZFront() {},
    fetch: async (_, options) => { auth = options.headers.Authorization; return { ok: true, json: async () => ({ id: 28 }) }; } });
  vm.runInContext(moduleSource('gn-abrir-detalle-pedido.js'), ctx);
  await ctx.abrirDetallePedidoPorId(28); assert.equal(auth, 'Bearer nuevo');
  assert.equal(opened.id, 28); assert.equal(window.app.p[0].id, 28);
});

test('detalle no elude rechazo API mediante SQL sin autorización', async () => {
  let queries = 0, opened = false;
  const window = { app: { p: [] }, getApiToken: () => 'tok', gnNormPedidoDesdeApi: p => p, detalle: async () => { opened = true; } };
  const ctx = vm.createContext({ window, document: { getElementById: () => null }, console, toast() {}, gnForceModalZFront() {},
    fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
  vm.runInContext(moduleSource('gn-abrir-detalle-pedido.js'), ctx);
  await ctx.abrirDetallePedidoPorId(28, { neonOk: () => true, esc: x => x, sqlSimple: () => { queries++; }, pedidosFiltroTenantSql: async () => '' });
  assert.equal(queries, 0); assert.equal(opened, false);
});

test('si la API indica que 2FA no está disponible, no se usa fallback SQL', () => {
  const ctx = vm.createContext({}); vm.runInContext(moduleSource('auth-login-neon-fallback.js'), ctx);
  assert.equal(ctx.shouldSkipNeonPlaintextLoginFallback({ _loginFailed: true, status: 503, code: 'admin_2fa_unavailable' }, () => 'https://api.test'), true);
});

test('chat nunca activa otra sesión cuando se solicitó un cliente concreto', async () => {
  const urls = []; const messages = [];
  const window = {};
  const ctx = vm.createContext({ window, console, setInterval: () => 1, clearInterval() {},
    document: { getElementById: () => null },
    fetch: async url => {
      urls.push(url);
      if (url.endsWith('/sessions')) return { ok: true, json: async () => ({ sessions: [{ id: 22 }] }) };
      return { ok: false, status: 404, json: async () => ({ error: 'Sesión no disponible' }) };
    } });
  vm.runInContext(moduleSource('whatsapp-human-chat-admin.js'), ctx);
  ctx.setWhatsappHumanChatAdminDeps({ puedeEnviarApiRestPedidos: () => true, asegurarJwtApiRest: async () => {},
    getApiToken: () => 'tok', apiUrl: p => p, toast: m => messages.push(m) });
  await ctx.abrirModalWhatsappHumanChat(123);
  assert.equal(urls[1], '/api/whatsapp/human-chat/sessions/123/activate');
  assert.equal(messages[0], 'Sesión no disponible');
});
