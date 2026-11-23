import { test, expect } from '@playwright/test';

async function iniciar(page, {guardada = false, sesion = false, sqlActualiza = true} = {}) {
  await page.addInitScript(({guardada,sesion}) => {
    Object.defineProperty(navigator, 'userAgent', {configurable:true,get:()=> 'Mozilla/5.0 Android GestorNova/1.0.42'});
    window.AndroidConfig = {getConfigJson:()=>JSON.stringify({api:{baseUrl:'https://api.cierre-test.invalid'}}),getVersionCode:()=>42};
    window.__bioLlamadas = 0;
    window.__bioPurgas = 0;
    window.AndroidBiometric = {
      hasSavedLogin:()=>guardada, isAvailable:()=>true, clearSavedLogin:()=>{window.__bioPurgas++},
      getSavedLoginScopeJson:()=>'{"tenantId":1,"businessType":""}',
      syncBiometricLoginScope:()=>{}, hasUserDeclinedBiometricSave:()=>false,
      loginWithBiometric:()=>{window.__bioLlamadas++;void window.__gnLoginConHuella('tecnico@test.local','contraseña-prueba');},
      savedLoginMatches:()=>true,
    };
    if (sesion) {
      localStorage.setItem('pmg',JSON.stringify({id:7,rol:'tecnico',email:'tecnico@test.local',nombre:'Tecnico',tenant_id:1}));
      localStorage.setItem('pmg_api_token','jwt-anterior');
      localStorage.setItem('pmg_offline_queue','[{"_offlineId":"pendiente"}]');
      localStorage.setItem('gestornova_ls_pulse','2');
    }
  },{guardada,sesion});
  const updates=[];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,x-gestornova-technician-key'};
  await page.route('https://api.cierre-test.invalid/**', async route=>{
    const req=route.request(), path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let data={};try{data=req.postDataJSON()||{};}catch(_){}
    if(path==='/api/auth/login')return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({token:'jwt-test',user:{id:7,email:'tecnico@test.local',nombre:'T',rol:'tecnico',tenant_id:1}})});
    if(path==='/api/auth/tenant-operativo')return route.fulfill({status:200,headers,contentType:'application/json',body:'{"tenant_id":1}'});
    if(path.startsWith('/api/sql/') && /^UPDATE pedidos SET/i.test(data.query||'')){
      updates.push(data.query);
      return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({rows:sqlActualiza?[{id:42}]:[],rowCount:sqlActualiza?1:0})});
    }
    return route.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true,"rows":[]}'});
  });
  await page.route(/^https:\/\/(?!api\.cierre-test\.invalid)/, route=>route.abort());
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.__gnEjecutarLogin==='function' && typeof window.__gnLoginConHuella==='function',null,{timeout:20000});
  return updates;
}

test('huella guardada se ofrece al abrir y jamás rellena usuario ni contraseña',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('pmg_bio_bound_vc','41');
    sessionStorage.setItem('gn_login_draft_em','usuario-privado');
    sessionStorage.setItem('gn_login_draft_pw','clave-privada');
  });
  await iniciar(page,{guardada:true,sesion:true});
  expect(await page.evaluate(()=>window.__bioPurgas)).toBe(0);
  expect(await page.evaluate(()=>[sessionStorage.getItem('gn_login_draft_em'),sessionStorage.getItem('gn_login_draft_pw')])).toEqual([null,null]);
  await expect(page.locator('#gn-bio-login-btn')).toBeVisible();
  await expect(page.locator('#ms')).not.toHaveClass(/active/);
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('pmg_offline_queue')))[0]._offlineId).toBe('pendiente');
  await page.evaluate(()=>{
    window.__camposVistos=[];
    const original=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    for(const id of ['em','pw']){
      const e=document.getElementById(id);
      Object.defineProperty(e,'value',{configurable:true,get(){return original.get.call(this)},set(v){window.__camposVistos.push([id,v]);original.set.call(this,v)}});
    }
  });
  await page.locator('#gn-bio-login-btn').click();
  await expect(page.locator('#ms')).toHaveClass(/active/, {timeout:10000});
  expect(await page.evaluate(()=>window.__bioLlamadas)).toBe(1);
  const campos=await page.evaluate(()=>({em:document.getElementById('em').value,pw:document.getElementById('pw').value,asignaciones:window.__camposVistos}));
  expect(campos.em).toBe('');expect(campos.pw).toBe('');
  expect(campos.asignaciones.every(([,v])=>!v)).toBe(true);
});

test('regla Android: solo el técnico o supervisor asignado cierra En ejecución; web y admin conservan regla anterior',async({page})=>{
  await iniciar(page);
  const out=await page.evaluate(async()=>{
    window.app.u={id:7,rol:'tecnico'};
    const m=await import('./modules/pedido-detalle-puede-ejecutar.js');
    const tec={esAdmin:()=>false,esTecnicoOSupervisor:()=>true,esAndroid:()=>true};
    const web={...tec,esAndroid:()=>false};
    const adm={...tec,esAdmin:()=>true};
    const p=es=>({id:42,es,tai:7});
    return {
      pendiente:m.validarPuedeCerrarPedido(p('Pendiente'),tec), asignado:m.validarPuedeCerrarPedido(p('Asignado'),tec),
      ejecucion:m.validarPuedeCerrarPedido(p('En ejecución'),tec), otro:m.validarPuedeCerrarPedido({...p('En ejecución'),tai:8},tec),
      cerrado:m.validarPuedeCerrarPedido(p('Cerrado'),tec), web:m.validarPuedeCerrarPedido(p('Asignado'),web),
      admin:m.validarPuedeCerrarPedido(p('Asignado'),adm), avanceAsignado:m.validarPuedeRegistrarAvance(p('Asignado'),tec), avanceOtro:m.validarPuedeRegistrarAvance({...p('Asignado'),tai:8},tec)
    };
  });
  expect(out.pendiente.ok).toBe(false);expect(out.asignado.ok).toBe(false);expect(out.ejecucion.ok).toBe(true);
  expect(out.otro.ok).toBe(false);expect(out.cerrado.ok).toBe(false);expect(out.web.ok).toBe(true);expect(out.admin.ok).toBe(true);expect(out.avanceAsignado.ok).toBe(true);expect(out.avanceOtro.ok).toBe(false);
});

test('revalida el estado al confirmar el cierre', async({page})=>{
  const updates=await iniciar(page);
  await page.evaluate(()=>{window.app.u={id:7,rol:'tecnico',nombre:'T'};window.app.p=[{id:42,np:'42',es:'Asignado',tai:7,tt:'Servicio',de:'Prueba'}];window._a('c',42);});
  await expect(page.locator('#cm2')).not.toHaveClass(/active/);
  await page.evaluate(()=>{window.app.p[0].es='En ejecución';window._a('c',42);});
  await expect(page.locator('#cm2')).toHaveClass(/active/);
  await page.locator('#tr').fill('Trabajo de prueba');
  await page.evaluate(()=>window.app.p[0].es='Asignado');
  await page.locator('#cc2').click();
  expect(updates).toHaveLength(0);
  await expect(page.locator('#cm2')).toHaveClass(/active/);
});

test('cierre individual ejecuta UPDATE condicional con estado En ejecución', async({page})=>{
  const updates=await iniciar(page);
  await page.evaluate(()=>void window.__gnLoginConHuella('tecnico@test.local','contraseña-prueba'));
  await expect(page.locator('#ms')).toHaveClass(/active/,{timeout:10000});
  await page.waitForTimeout(1500); // dejar terminar la carga inicial simulada
  await page.evaluate(()=>{window.app.p=[{id:42,np:'42',es:'En ejecución',tai:7,tt:'Servicio',de:'Prueba'}];window._a('c',42);});
  await expect(page.locator('#cm2')).toHaveClass(/active/);
  await page.locator('#tr').fill('Trabajo realizado');
  await page.locator('#cc2').click();
  await expect.poll(()=>updates.length,{timeout:10000}).toBe(1);
  expect(updates[0]).toMatch(/WHERE id=.* AND estado = 'En ejecución' RETURNING id/i);
  await expect(page.locator('#cm2')).not.toHaveClass(/active/);
});

test('si el estado cambió en servidor no informa cierre exitoso', async({page})=>{
  const updates=await iniciar(page,{sqlActualiza:false});
  await page.evaluate(()=>void window.__gnLoginConHuella('tecnico@test.local','contraseña-prueba'));
  await expect(page.locator('#ms')).toHaveClass(/active/,{timeout:10000});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{window.app.p=[{id:42,np:'42',es:'En ejecución',tai:7,tt:'Servicio',de:'Prueba'}];window._a('c',42);});
  await page.locator('#tr').fill('Trabajo realizado');
  await page.locator('#cc2').click();
  await expect.poll(()=>updates.length,{timeout:10000}).toBe(1);
  await expect(page.locator('#cm2')).toHaveClass(/active/);
  expect(await page.evaluate(()=>window.app.p[0]?.es)).toBe('En ejecución');
});

test('sin conexión conserva cierre condicionado pendiente si servidor ya no está en ejecución', async({page})=>{
  const updates=await iniciar(page,{sqlActualiza:false});
  await page.evaluate(()=>void window.__gnLoginConHuella('tecnico@test.local','contraseña-prueba'));
  await expect(page.locator('#ms')).toHaveClass(/active/,{timeout:10000});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('offline'));
    window.app.p=[{id:42,np:'42',es:'En ejecución',tai:7,tt:'Servicio',de:'Prueba'}];window._a('c',42);
  });
  await page.locator('#tr').fill('Trabajo offline');
  await page.locator('#cc2').click();
  await expect.poll(async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('pmg_offline_queue')||'[]')).length).toBe(1);
  let queue=JSON.parse(await page.evaluate(()=>localStorage.getItem('pmg_offline_queue')));
  expect(queue[0].requiereFila).toBe(true);
  expect(queue[0].query).toContain("AND estado = 'En ejecución' RETURNING id");
  await page.evaluate(()=>window.sincronizarOffline());
  await expect.poll(()=>updates.length,{timeout:10000}).toBeGreaterThan(0);
  await expect.poll(async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('pmg_offline_queue')||'[]')).length,{timeout:10000}).toBe(1);
});

test('cierre masivo Android excluye asignados y pedidos de otro técnico',async({page})=>{
  await iniciar(page);
  const out=await page.evaluate(async()=>{
    window.app.u={id:7,rol:'supervisor'};
    const m=await import('./modules/incidencias.js');
    const check=m.pedidoPermiteCierreMasivoIncidenciaParaUsuarioActual;
    return {asignado:check({id:1,estado:'Asignado',tecnico_asignado_id:7}),
      ejecucion:check({id:2,estado:'En ejecución',tecnico_asignado_id:7}),
      otro:check({id:3,estado:'En ejecución',tecnico_asignado_id:8}),
      pendiente:check({id:4,estado:'Pendiente',tecnico_asignado_id:7})};
  });
  expect(out).toEqual({asignado:false,ejecucion:true,otro:false,pendiente:false});
});

test('puente nativo no copia credenciales a inputs y conserva credenciales al actualizar',async()=>{
  const fs=await import('node:fs/promises');
  const java=await fs.readFile(new URL('../../app/src/main/java/com/gestornova/gestion/AndroidBiometricBridge.java',import.meta.url),'utf8');
  const metodo=java.slice(java.indexOf('private void applySavedLoginAfterBiometricOk()'),java.indexOf('private void showReadLoginPrompt('));
  expect(metodo).toContain('window.__gnLoginConHuella(o.em');
  expect(metodo).not.toContain('e.value=o.em');
  expect(metodo).not.toContain('p.value=o.pw');
  const upgrade=java.slice(java.indexOf('private void ensureFreshInstallOrAppUpgrade()'),java.indexOf('private boolean storedScopeMatches('));
  expect(upgrade).toContain('if (firstRun) wipeBiometricCredentialsInternal(false)');
});

test('cancelación biométrica simulada deja ingreso manual y permite reintentar',async({page})=>{
  await iniciar(page,{guardada:true,sesion:true});
  await page.evaluate(()=>{window.AndroidBiometric.loginWithBiometric=()=>{window.__bioLlamadas++;window.__gnBiometricLoginFlow=false;window.__gnRefreshLoginBiometricUi?.()}});
  await expect(page.locator('#gn-bio-login-btn')).toBeVisible();
  await page.locator('#gn-bio-login-btn').click();
  expect(await page.evaluate(()=>window.__gnBiometricLoginFlow)).toBe(false);
  await expect(page.locator('#em')).toBeVisible();
  await expect(page.locator('#pw')).toBeVisible();
  await page.locator('#gn-bio-login-btn').click();
  expect(await page.evaluate(()=>window.__bioLlamadas)).toBe(2);
  expect(await page.locator('#em').inputValue()).toBe('');
  expect(await page.locator('#pw').inputValue()).toBe('');
});
