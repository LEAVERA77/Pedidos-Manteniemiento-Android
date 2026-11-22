import { test, expect } from '@playwright/test';

async function boot(page, options = {}) {
    await page.addInitScript(({offline, cache, cacheRole, configBridge, savedSession}) => {
        Object.defineProperty(navigator, 'userAgent', { configurable:true, get:() => 'Mozilla/5.0 Android GestorNova/1.0.42' });
        Object.defineProperty(navigator, 'onLine', { configurable:true, get:() => !offline });
        window.AndroidConfig = { getConfigJson: () => configBridge ? JSON.stringify({api:{baseUrl:'https://api.login-test.invalid'}}) : '', getVersionCode:()=>42 };
        if (cache) localStorage.setItem('gestornova_ls_pulse', '2');
        if (cache) localStorage.setItem('pmg_offline_user', JSON.stringify([{id:7,email:'usuario@test.local',nombre:'Prueba',rol:cacheRole,tenant_id:1,_pw:'clave'}]));
        if (savedSession) {
            localStorage.setItem('gestornova_ls_pulse', '2');
            localStorage.setItem('pmg', JSON.stringify({id:7,email:'usuario@test.local',nombre:'Prueba',rol:savedSession,tenant_id:1}));
            localStorage.setItem('pmg_api_token', 'jwt-previo');
            localStorage.setItem('pmg_offline_queue', '[{"_offlineId":"pendiente"}]');
        }
    }, {offline:!!options.offline, cache:!!options.cache, cacheRole:options.cacheRole || 'tecnico', configBridge: options.configBridge !== false, savedSession:options.savedSession || ''});
    const stats = { login:0, health:0 };
    await page.route('https://api.login-test.invalid/**', async route => {
        const req = route.request(), url = new URL(req.url());
        const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,x-gestornova-technician-key'};
        if (req.method() === 'OPTIONS') return route.fulfill({status:204, headers});
        if (url.pathname === '/health') {
            stats.health++;
            if (options.delayHealth) await new Promise(r => setTimeout(r, options.delayHealth));
            if (options.healthFails || (options.healthFailsFirst && stats.health <= options.healthFailsFirst)) return route.fulfill({status:503,headers,contentType:'application/json',body:'{"ok":false}'});
            return route.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true}'});
        }
        if (url.pathname === '/api/auth/tenant-operativo') {
            if (options.tenantUnavailable) return route.fulfill({status:503,headers,contentType:'application/json',body:'{}'});
            return route.fulfill({status:200,headers,contentType:'application/json',body:'{"tenant_id":1}'});
        }
        if (url.pathname === '/api/auth/login') {
            stats.login++;
            if (options.netError) return route.abort('failed');
            if (options.transient && stats.login === 1) return route.fulfill({status:503,headers,contentType:'application/json',body:'{"error":"starting"}'});
            if (options.mustChange) return route.fulfill({status:403,headers,contentType:'application/json',body:'{"code":"must_change_password","user_id":7,"email":"usuario@test.local","rol":"admin","tenant_id":1}'});
            if (options.unauthorized) return route.fulfill({status:401,headers,contentType:'application/json',body:'{"error":"credenciales"}'});
            return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({token:'jwt-test',user:{id:7,email:'usuario@test.local',nombre:'Prueba',rol:options.loginRole || 'tecnico',tenant_id:1}})});
        }
        return route.fulfill({status:200,headers,contentType:'application/json',body:'{"rows":[],"ok":true}'});
    });
    await page.route(/^https:\/\/(?!api\.login-test\.invalid)/, route => route.abort());
    if (options.configBridge === false) await page.route('**/config.json?*', async route => {
        await new Promise(r => setTimeout(r, 1300));
        await route.fulfill({status:200,contentType:'application/json',body:'{"api":{"baseUrl":"https://api.login-test.invalid"}}'});
    });
    await page.goto('/index.html', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => typeof window.__gnEjecutarLogin === 'function', null, {timeout:20000});
    return stats;
}
async function login(page) {
    await page.locator('#em').click();
    await page.locator('#em').fill('usuario@test.local', {timeout:5000});
    await page.locator('#pw').click();
    await page.locator('#pw').fill('clave', {timeout:5000});
    await page.locator('#lb').click();
}

test('primera instalación: login no espera al health de arranque', async ({page}) => {
    const stats = await boot(page, {delayHealth:4500});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:4000});
    expect(stats.login).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('pmg_api_token'))).toBe('jwt-test');
    await expect(page.locator('#dbs')).toContainText('Conectado');
});

test('configuración lenta se comparte con el login temprano', async ({page}) => {
    const stats = await boot(page, {configBridge:false, delayHealth:4500});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    expect(stats.login).toBe(1);
});

test('un indicador offline inicial no impide primer login si la API responde', async ({page}) => {
    const stats = await boot(page, {offline:true});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    expect(stats.login).toBe(1);
});

test('no entra con credenciales cacheadas ante 401 real de la API', async ({page}) => {
    const stats = await boot(page, {cache:true, unauthorized:true});
    await login(page);
    await expect(page.locator('#le')).toContainText('Usuario o contraseña incorrectos', {timeout:7000});
    await expect(page.locator('#ms')).not.toHaveClass(/active/);
    expect(stats.login).toBe(1);
    await expect(page.locator('#lb')).toBeEnabled();
});

test('reintenta una respuesta temporal 503 sin pedir otro toque', async ({page}) => {
    const stats = await boot(page, {transient:true});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    expect(stats.login).toBe(2);
});

test('se recupera solo en la pantalla de login después de una falla temporal', async ({page}) => {
    const stats = await boot(page, {healthFailsFirst:3});
    await expect(page.locator('#dbs')).toContainText('Servidor no disponible', {timeout:7000});
    await expect(page.locator('#dbs')).toContainText('Conectado', {timeout:12000});
    expect(stats.health).toBeGreaterThanOrEqual(4);
    expect(stats.login).toBe(0);
});

test('un health de arranque fallido no invalida un login ya exitoso', async ({page}) => {
    const stats = await boot(page, {healthFails:true});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    await page.waitForTimeout(4500);
    await expect(page.locator('#dbs')).toContainText('Conectado');
    expect(stats.login).toBe(1);
});

test('sin red y con usuario autorizado previamente permite entrar offline', async ({page}) => {
    const stats = await boot(page, {offline:true, cache:true, netError:true});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    expect(stats.login).toBe(0);
});

test('tener caché offline no pinta sin conexión cuando el servidor está disponible', async ({page}) => {
    await boot(page, {cache:true});
    await expect(page.locator('#dbs')).toContainText('Conectado', {timeout:7000});
    await page.evaluate(() => window.dispatchEvent(new Event('gestornova-app-ready')));
    await expect(page.locator('#dbs')).toContainText('Conectado');
});

test('una falla temporal verificando tenant no borra sesión ni cola offline', async ({page}) => {
    await boot(page, {tenantUnavailable:true});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    await page.evaluate(() => localStorage.setItem('pmg_offline_queue', '[{"_offlineId":"prueba"}]'));
    await page.waitForFunction(() => typeof window.gnBootTenantForceSyncAndroid === 'function');
    await page.evaluate(() => window.gnBootTenantForceSyncAndroid());
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({session:localStorage.getItem('pmg'), queue:localStorage.getItem('pmg_offline_queue')}));
    expect(state.session).toBeTruthy();
    expect(JSON.parse(state.queue)[0]._offlineId).toBe('prueba');
    await expect(page.locator('#ms')).toHaveClass(/active/);
});

test('primera instalación sin red ni caché no inventa una sesión', async ({page}) => {
    const stats = await boot(page, {offline:true, netError:true});
    await login(page);
    await expect(page.locator('#le')).toContainText('No se pudo conectar', {timeout:7000});
    await expect(page.locator('#ms')).not.toHaveClass(/active/);
    expect(stats.login).toBe(1);
});

test('primer ingreso con cambio de contraseña no depende del health de arranque', async ({page}) => {
    const stats = await boot(page, {delayHealth:4500, mustChange:true});
    await login(page);
    await expect(page.locator('#modal-forzar-cambio-pw')).toHaveClass(/active/, {timeout:7000});
    expect(stats.login).toBe(1);
    await expect(page.locator('#dbs')).toContainText('Conectado');
});


test('técnico no puede abrir el panel ni activar pestañas administrativas desde la interfaz', async ({page}) => {
    await boot(page);
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    await expect(page.locator('#btn-admin')).toBeHidden();
    await page.evaluate(() => { window.abrirAdmin(); window.adminTab('socios'); window.adminTab('kpi'); });
    await expect(page.locator('#admin-panel')).not.toHaveClass(/active/);
    await expect(page.locator('#admin-socios')).not.toHaveClass(/active/);
    await expect(page.locator('#admin-kpi')).not.toHaveClass(/active/);
});


test('administrador no entra usando credenciales offline guardadas', async ({page}) => {
    await boot(page, {offline:true, cache:true, cacheRole:'administrador', netError:true});
    await login(page);
    await expect(page.locator('#ms')).not.toHaveClass(/active/);
    await expect(page.locator('#le')).toContainText('administrador debe iniciar sesión con conexión', {timeout:7000});
});

test('administrador online ingresa pero no deja contraseña en la caché offline', async ({page}) => {
    await boot(page, {cache:true, cacheRole:'admin', loginRole:'admin'});
    await login(page);
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
    const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('pmg_offline_user') || '[]'));
    expect(entries.some(u => u.email === 'usuario@test.local')).toBe(false);
});

test('sesión administrativa guardada no se restaura sin autenticar y conserva la cola', async ({page}) => {
    await boot(page, {offline:true, netError:true, savedSession:'administrador'});
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.gnRehidratarSesionAndroid?.());
    await expect(page.locator('#ms')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem('pmg'))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pmg_offline_queue'))[0]._offlineId)).toBe('pendiente');
});

test('sesión de técnico guardada sigue disponible sin red', async ({page}) => {
    await boot(page, {offline:true, netError:true, savedSession:'tecnico'});
    await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:7000});
});
