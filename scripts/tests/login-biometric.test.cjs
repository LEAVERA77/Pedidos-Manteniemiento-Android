const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function biometricHarness({ saved = null, declined = false, available = true } = {}) {
  const timers = [];
  let active = false;
  let saves = [];
  let clears = 0;
  const inputs = { em: { value: 'usuario' }, pw: { value: 'clave-nueva' } };
  const B = {
    hasSavedLogin: () => !!saved,
    savedLoginMatches: (em, pw, tid, bt) => saved.em === em && saved.pw === pw && saved.tid === tid && saved.bt === bt,
    clearSavedLogin: () => { saved = null; declined = false; clears++; },
    hasUserDeclinedBiometricSave: () => declined,
    isAvailable: () => available,
    saveLoginWithBiometric: (...args) => saves.push(args),
  };
  const document = {
    body: { classList: { contains: () => active } },
    getElementById: id => inputs[id] || null,
    readyState: 'complete',
  };
  const window = { AndroidBiometric: B, AndroidConfig: {}, addEventListener() {} };
  const source = fs.readFileSync(path.join(root, 'app/src/main/assets/modules/login-biometric-android.js'), 'utf8')
    .replace(/import\s*\{[\s\S]*?\}\s*from '\.\/login-biometric-scope\.js';/, '');
  const ctx = vm.createContext({ window, document, navigator: {}, console,
    gnBioScopeParaAccionBiometrica: () => ({ tid: 7, bt: 'taller' }),
    gnSyncBiometricScopeSiSesionActiva: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(source, ctx);
  return {
    async login(ok) {
      window.__gnEjecutarLogin = async () => { active = ok; };
      await window.__gnEjecutarLogin();
      while (timers.length) timers.shift()();
    },
    get saves() { return saves; }, get clears() { return clears; },
  };
}

test('ofrece una sola vez después de un ingreso correcto', async () => {
  const h = biometricHarness(); await h.login(true);
  assert.equal(h.saves.length, 1);
  assert.deepEqual(Array.from(h.saves[0]), ['usuario', 'clave-nueva', 7, 'taller']);
});
test('no ofrece ni borra credenciales si falla el login', async () => {
  const h = biometricHarness({ saved: { em: 'usuario', pw: 'anterior', tid: 7, bt: 'taller' } });
  await h.login(false); assert.equal(h.saves.length, 0); assert.equal(h.clears, 0);
});
test('invalida acceso obsoleto tras ingreso correcto y propone guardar el nuevo', async () => {
  const h = biometricHarness({ saved: { em: 'usuario', pw: 'anterior', tid: 7, bt: 'taller' } });
  await h.login(true); assert.equal(h.clears, 1); assert.equal(h.saves.length, 1);
});
test('no vuelve a pedir si las credenciales y ámbito coinciden', async () => {
  const h = biometricHarness({ saved: { em: 'usuario', pw: 'clave-nueva', tid: 7, bt: 'taller' } });
  await h.login(true); assert.equal(h.clears, 0); assert.equal(h.saves.length, 0);
});
test('respeta el rechazo y la disponibilidad biométrica', async () => {
  for (const options of [{ declined: true }, { available: false }]) {
    const h = biometricHarness(options); await h.login(true); assert.equal(h.saves.length, 0);
  }
});
test('invalida acceso obsoleto aun cuando el sensor no esté disponible', async () => {
  const h = biometricHarness({ available: false, saved: { em: 'otro', pw: 'anterior', tid: 7, bt: 'taller' } });
  await h.login(true); assert.equal(h.clears, 1); assert.equal(h.saves.length, 0);
});

function adminHarness({ responseOk = true, offline = false, nameOnly = false } = {}) {
  const elements = {
    'pw-actual': { value: 'anterior' }, 'pw-nueva': { value: nameOnly ? '' : 'clave-nueva' },
    'pw-confirmar': { value: nameOnly ? '' : 'clave-nueva' },
    'pw-email-nuevo': { value: 'usuario' }, 'pw-nombre-nuevo': { value: nameOnly ? 'Nuevo nombre' : 'Nombre' },
    'pw-msg': { style: {}, textContent: '' },
  };
  let clears = 0;
  const app = { u: { id: 1, email: 'usuario', nombre: 'Nombre' } };
  const window = { __gnPurgarHuellaGuardadaExplicitamente: () => clears++ };
  const source = fs.readFileSync(path.join(root, 'app/src/main/assets/modules/admin-cambiar-credenciales.js'), 'utf8')
    .replace(/^import .*;$/m, '').replace(/export /g, '');
  const ctx = vm.createContext({ window, document: { getElementById: id => elements[id] },
    localStorage: { setItem() {} }, console, setTimeout() {},
    validarParPasswordNuevoConfirmacionGestornova: () => ({ ok: true }),
    fetch: async () => ({ ok: responseOk, json: async () => ({ user: app.u, error: 'Error' }) }),
  });
  vm.runInContext(source, ctx);
  ctx.initAdminCambiarCredenciales({ getApp: () => app, getModoOffline: () => offline,
    getApiToken: () => offline ? '' : 'token', apiUrl: x => x,
    sqlFiltroUsuariosPorTenant: async () => '', esc: x => `'${x}'`,
    sqlSimple: async sql => sql.startsWith('SELECT') ? { rows: [{ id: 1 }] } : { rows: [] },
  });
  return { run: () => ctx.cambiarContrasena(), get clears() { return clears; } };
}

test('cambio de credenciales confirmado invalida la huella tanto por API como offline', async () => {
  for (const options of [{}, { offline: true }]) {
    const h = adminHarness(options); await h.run(); assert.equal(h.clears, 1);
  }
});
test('un error o un cambio exclusivo de nombre visible no invalida la huella', async () => {
  for (const options of [{ responseOk: false }, { nameOnly: true }]) {
    const h = adminHarness(options); await h.run(); assert.equal(h.clears, 0);
  }
});
