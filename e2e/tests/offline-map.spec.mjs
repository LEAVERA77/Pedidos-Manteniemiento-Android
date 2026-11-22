import { test, expect } from '@playwright/test';
const html = `<!doctype html><html><head><link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css"></head><body><div id="mc" style="width:600px;height:400px"></div><div id="zoom-altura"></div><script src="/vendor/leaflet-1.9.4/leaflet.js"></script></body></html>`;
async function setup(page, options = {}) {
    await page.route('**/offline-map-harness', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aYQAAAAASUVORK5CYII=', 'base64') }));
    await page.goto('/offline-map-harness');
    await page.evaluate(({offline, saved, gps}) => {
        window.__testOnline = !offline;
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.__testOnline });
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
            getCurrentPosition(ok, fail) { gps ? ok({ coords: {latitude:-31.3,longitude:-60.1,accuracy:20}, timestamp:Date.now() }) : fail({ code: 2 }); }
        }});
        window.ctx = {
            L, window, document, app:{map:null}, ultimaUbicacion:saved,
            esAndroidWebViewMapa:()=>true, gnMapaLigero:()=>true, esAdmin:()=>false,
            getApiBaseUrl:()=>'', tenantIdActual:()=>1, mapaInicializado:false,
            aplicarUIMapaPlataforma:()=>{}, renderMk:()=>{}, calcularEscalaReal:()=>'',
            mostrarMarcadorUbicacion:(lat,lon)=>{ L.circleMarker([lat,lon]).addTo(window.ctx.app.map); return 15; },
            solicitarUbicacion:(...args)=>{ window.gpsRequested = args; }, toast:()=>{}, scheduleMapRetry:()=>{},
            mapTapUbicacionInicialHechaSesion:()=>false, registrarFajaInstalacionSiFalta:()=>{}, marcarMapTapUbicacionInicialHecha:()=>{}
        };
    }, {offline: !!options.offline, saved: options.saved || null, gps: !!options.gps});
    await page.evaluate(async () => { const m = await import('/map-view.js'); m.setMapViewContext(window.ctx); await m.runInitMap(); });
}
test('sin red con ubicación guardada muestra mapa esquemático y pide nueva ubicación', async ({page}) => {
    await setup(page, {offline:true, saved:{lat:-31.3,lon:-60.1,acc:40,timestamp:100,fuente:'gps'}});
    await expect(page.locator('text=Sin conexión: mapa esquemático')).toBeVisible();
    const state = await page.evaluate(() => ({center:ctx.app.map.getCenter(), raster:ctx.app.map._gnBaseRasterLayer instanceof L.TileLayer}));
    expect(state.center.lat).toBeCloseTo(-31.3, 4);
    expect(state.center.lng).toBeCloseTo(-60.1, 4);
    expect(state.raster).toBe(false);
    await page.waitForTimeout(650);
    expect(await page.evaluate(() => gpsRequested)).toEqual([true,true]);
    expect(await page.locator('.leaflet-control-attribution').textContent()).toContain('Natural Earth');
});
test('sin centro ni historial usa GPS', async ({page}) => {
    await setup(page, {offline:true, gps:true});
    expect(await page.evaluate(() => ctx.ultimaUbicacion.fuente)).toBe('gps');
    expect(await page.evaluate(() => ctx.app.map.getCenter().lat)).toBeCloseTo(-31.3, 4);
});
test('sin centro ni GPS muestra aviso en vez de inventar posición', async ({page}) => {
    await setup(page, {offline:true});
    await expect(page.locator('.gn-mapa-sin-centro')).toContainText('No hay ubicación guardada');
    expect(await page.evaluate(() => ctx.app.map)).toBeNull();
});
test('al perder y recuperar red cambia de mapa sin descargar regiones', async ({page}) => {
    await setup(page, {saved:{lat:-31.3,lon:-60.1,acc:30,timestamp:Date.now(),fuente:'gps'}});
    expect(await page.evaluate(() => ctx.app.map._gnBaseRasterLayer instanceof L.TileLayer)).toBe(true);
    await page.evaluate(() => { window.__testOnline = false; window.dispatchEvent(new Event('offline')); });
    expect(await page.evaluate(() => ctx.app.map._gnBaseRasterLayer instanceof L.TileLayer)).toBe(false);
    await expect(page.locator('text=Sin conexión: mapa esquemático')).toBeVisible();
    await page.evaluate(() => { window.__testOnline = true; window.dispatchEvent(new Event('online')); });
    expect(await page.evaluate(() => ctx.app.map._gnBaseRasterLayer instanceof L.TileLayer)).toBe(true);
    await expect(page.locator('text=Sin conexión: mapa esquemático')).toBeHidden();
});

test('marcador distingue posición reciente, antigua, manual y legado sin origen', async ({page}) => {
    await setup(page, {offline:true, saved:{lat:-31.3,lon:-60.1}});
    const labels = await page.evaluate(async () => {
        const src = await (await fetch('/app.js')).text();
        const start = src.indexOf('function mostrarMarcadorUbicacion(');
        const end = src.indexOf('function gnPosicionGpsEsMasAntigua(', start);
        const body = src.slice(start, end);
        const run = new Function('app', 'L', 'gnMapaLigero', 'gnRequestClearGotoPreviewMarker', `
            let marcadorUbicacion = null, _circuloAcc = null, ultimaUbicacion = null;
            ${body}
            return u => { ultimaUbicacion = u; mostrarMarcadorUbicacion(u.lat, u.lon, u.acc); return marcadorUbicacion.getPopup().getContent()(); };
        `)(ctx.app, L, () => true, () => {});
        const p = {lat:-31.3,lon:-60.1,acc:20};
        return [run({...p, fuente:'gps', timestamp:Date.now()}), run({...p, fuente:'gps', timestamp:Date.now()-300000}), run({...p, fuente:'manual', timestamp:Date.now()}), run(p)];
    });
    expect(labels[0]).toContain('Ubicación reciente');
    expect(labels[1]).toContain('Última ubicación conocida');
    expect(labels[2]).toContain('Punto elegido manualmente');
    expect(labels[3]).toContain('origen desconocido');
});
