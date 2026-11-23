import { test, expect } from '@playwright/test';

test('notificaciones propias se consultan y marcan por API sin SQL en cliente actualizado', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable:true, get:()=>'Mozilla/5.0 Android GestorNova/1.0.42' });
    window.AndroidConfig={getConfigJson:()=>JSON.stringify({api:{baseUrl:'https://api.notif-test.invalid'}}),getVersionCode:()=>42};
    window.__testNotificaciones=[];
    window.AndroidLocalNotify={show:(...args)=>window.__testNotificaciones.push(args)};
  });
  let read=0, marked=0, unsafe=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,x-gestornova-technician-key'};
  await page.route('https://api.notif-test.invalid/**', async route => {
    const req=route.request(); const url=new URL(req.url());
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
    if(url.pathname==='/api/auth/login') return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({token:'jwt-test',user:{id:7,email:'tecnico@test.local',nombre:'T',rol:'tecnico',tenant_id:1}})});
    if(url.pathname==='/api/auth/tenant-operativo') return route.fulfill({status:200,headers,contentType:'application/json',body:'{"tenant_id":1}'});
    if(url.pathname==='/api/notificaciones/pendientes') {
      read++;
      return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({rows: marked?[]:[{id:81,titulo:'Aviso',cuerpo:'Prueba',pedido_id:null}]})});
    }
    if(url.pathname==='/api/notificaciones/81/leer') { marked++; return route.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true}'}); }
    if(url.pathname.startsWith('/api/sql/')) {
      let body={}; try { body=req.postDataJSON() || {}; } catch (_) {}
      if(String(body.query || '').toLowerCase().includes('notificaciones_movil')) unsafe++;
      return route.fulfill({status:200,headers,contentType:'application/json',body:'{"rows":[]}' });
    }
    return route.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true,"rows":[]}'});
  });
  await page.route(/^https:\/\/(?!api\.notif-test\.invalid)/, route=>route.abort());
  await page.goto('/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.__gnEjecutarLogin==='function',null,{timeout:20000});
  await page.locator('#em').click();
  await page.locator('#em').fill('tecnico@test.local');
  await page.locator('#pw').click();
  await page.locator('#pw').fill('clave');
  await page.locator('#lb').click();
  await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:8000});
  await page.evaluate(()=>window.pollNotificacionesMovil());
  await expect.poll(()=>read).toBeGreaterThan(0);
  await expect.poll(()=>marked).toBeGreaterThan(0);
  expect(unsafe).toBe(0);
  expect(await page.evaluate(()=>window.__testNotificaciones.some(x=>x[0]==='81'))).toBe(true);
});
