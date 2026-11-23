import {test, expect} from '@playwright/test';

async function boot(page){
 await page.route('**/config.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"api":{"baseUrl":"https://api.admin-prueba.invalid"}}'}));
 await page.route('https://api.admin-prueba.invalid/**',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:'{"ok":true,"rows":[]}'}));
 await page.route(/^https:\/\/(?!api\.admin-prueba\.invalid)/,r=>r.abort());
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.__gnEjecutarLogin==='function' && window.app);
}

test('administrador web ve mantenimiento interno, campos del cliente ocultos y fotos opcionales',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{window.app.u={id:1,rol:'admin'};document.getElementById('pm').classList.add('active');});
 await expect(page.locator('#tt option[value="Mantenimiento interno"]')).toHaveCount(1);
 await page.locator('#tt').selectOption('Mantenimiento interno');
 await expect(page.locator('#nis')).toBeHidden();await expect(page.locator('#cl')).toBeHidden();await expect(page.locator('#ped-padron-busqueda-wrap')).toBeHidden();
 await expect(page.locator('label[for="de"]')).toContainText('Trabajos a realizar');
 await expect(page.locator('#de')).toBeVisible();await expect(page.locator('#input-foto-galeria')).not.toHaveAttribute('required','');
 await page.locator('#tt').selectOption({index:0});
 await expect(page.locator('#nis')).toBeVisible();
});

test('la opción interna no se ofrece al técnico desde la web',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{window.app.u={id:7,rol:'tecnico'};document.getElementById('pm').classList.add('active')});
 await page.waitForTimeout(150);
 await expect(page.locator('#tt option[value="Mantenimiento interno"]')).toHaveCount(0);
});

test('selección masiva toma solo pendientes sin técnico y envía lote con un aviso',async({page})=>{
 await boot(page);
 const result=await page.evaluate(async()=>{
  const m=await import('./modules/admin-asignacion-masiva.js');
  const box=document.createElement('div');document.body.appendChild(box);
  const p=[{id:10,np:'PM-10',es:'Pendiente',tai:null},{id:11,np:'PM-11',es:'Pendiente',tai:null},{id:12,np:'PM-12',es:'Cerrado',tai:null},{id:13,np:'PM-13',es:'Pendiente',tai:7}];
  window.__lotefetch=[];
  window.fetch=async (url,init={})=>{window.__lotefetch.push([String(url),init.body]);if(String(url).endsWith('/tecnicos')) return new Response(JSON.stringify([{id:8,nombre:'Técnica',activo:true}]),{status:200,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify({cantidad:2}),{status:200,headers:{'Content-Type':'application/json'}})};
  const d={esAdmin:()=>true,esAndroid:()=>false,pedidos:()=>p,token:()=> 'jwt',apiUrl:x=>x,toast:()=>{},recargar:async()=>{},render:()=>draw()};
  function draw(){box.replaceChildren();m.prepararAsignacionMasivaLista(d,box,p);for(const pedido of p){const el=document.createElement('div');m.agregarSelectorAsignacionMasiva(d,el,pedido);box.appendChild(el)}}
  draw();return {checks:box.querySelectorAll('input[type=checkbox]').length};
 });
 expect(result.checks).toBe(3);
 await page.locator('#gn-asig-masiva-todos').check();
 await page.getByRole('button',{name:'Asignar seleccionados (2)'}).click();
 await page.locator('#gn-asig-masiva-tecnico').selectOption('8');
 await page.locator('#gn-asig-masiva-confirmar').click();
 await expect.poll(()=>page.evaluate(()=>window.__lotefetch.length)).toBe(2);
 const req=await page.evaluate(()=>window.__lotefetch[1]);
 expect(req[0]).toBe('/api/pedidos/asignacion-masiva');expect(JSON.parse(req[1])).toEqual({pedido_ids:[10,11],tecnico_asignado_id:8});
});

test('guardar interno incluye coordenadas y trabajos, sin arrastrar datos de cliente',async({page})=>{
 await boot(page);
 const writes=[];
 await page.route('https://api.admin-prueba.invalid/**',async r=>{
   const req=r.request(); if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   let b={};try{b=req.postDataJSON()||{}}catch(_){};
   if(req.url().endsWith('/api/pedidos/mantenimiento-interno')){writes.push(b);return r.fulfill({status:201,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:'{"ok":true,"id":100,"numero_pedido":"2026-00100"}'});}
   return r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:'{"ok":true,"rows":[]}'});
 });
 await page.evaluate(()=>{
   window.app.u={id:1,rol:'admin'};window.EMPRESA_CFG={active_business_type:'electricidad',tipo:'cooperativa_electrica'};window.app.apiToken='jwt-test';localStorage.setItem('pmg_api_token','jwt-test');window.app.sel={lat:-31.65,lng:-60.4};
   window.gnConfirmarSiFueraDeZonaServicio=async()=>true;
   document.getElementById('pm').classList.add('active');
 });
 await expect(page.locator('#tt option[value="Mantenimiento interno"]')).toHaveCount(1);
 await page.locator('#tt').selectOption('Mantenimiento interno');
 await page.evaluate(()=>{document.getElementById('nis').value='NIS-PRIVADO';document.getElementById('cl').value='CLIENTE-PRIVADO';});
 await page.locator('#de').fill('Revisar tablero interno');
 await page.evaluate(()=>document.getElementById('pf').requestSubmit());
 await expect.poll(()=>writes.length,{timeout:10000}).toBe(1);
 const q=writes[0];
 expect(q).toMatchObject({descripcion:'Revisar tablero interno',lat:-31.65,lng:-60.4,fotos:[],business_type:'electricidad'});expect(q.operacion_id).toMatch(/^[a-f0-9-]{36}$/);
 expect(JSON.stringify(q)).not.toContain('NIS-PRIVADO');expect(JSON.stringify(q)).not.toContain('CLIENTE-PRIVADO');
});

test('técnico Android guarda mantenimiento offline sin cliente y queda en cola sin asignar',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 GestorNova/1.0'}));
 await boot(page);
 await page.evaluate(()=>{
   window.app.u={id:7,rol:'tecnico',tenant_id:1};window.EMPRESA_CFG={};
   localStorage.setItem('pmg_rubro_interno_u7_t1','electricidad');
   localStorage.setItem('pmg',JSON.stringify(window.app.u));localStorage.removeItem('pmg_offline_queue');
   window.dispatchEvent(new Event('offline'));window.app.sel={lat:-31.65,lng:-60.4};
   window.gnConfirmarSiFueraDeZonaServicio=async()=>true;
   document.getElementById('pm').classList.add('active');
 });
 await expect(page.locator('#tt option[value="Mantenimiento interno"]')).toHaveCount(1);
 await page.locator('#tt').selectOption('Mantenimiento interno');
 await expect(page.locator('#nis')).toBeHidden();await expect(page.locator('#cl')).toBeHidden();
 await page.locator('#de').fill('Revisar equipo de bombeo');
 await page.evaluate(()=>document.getElementById('pf').requestSubmit());
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')||'[]').length)).toBe(1);
 const q=await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue'))[0]);
 expect(q.tipo).toBe('MANTENIMIENTO_INTERNO');expect(q.usuario_id).toBe(7);expect(q.tenant_id).toBe(1);
 expect(q.payload).toMatchObject({descripcion:'Revisar equipo de bombeo',lat:-31.65,lng:-60.4,business_type:'electricidad',fotos:[]});
 expect(q.payload.operacion_id).toMatch(/^[a-f0-9-]{36}$/);
 const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_pedidos_t1')||'[]').find(x=>x._mantenimientoInterno));
 expect(local.es).toBe('Pendiente');expect(local.tai).toBe(null);
});

test('cola interna conserva operación al fallar, no mezcla usuarios y sincroniza el mismo id al reintentar',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 GestorNova/1.0'}));
 await boot(page);const writes=[];
 await page.route('https://api.admin-prueba.invalid/**',async r=>{
  const req=r.request();const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(req.url().endsWith('/api/pedidos/mantenimiento-interno')){
   writes.push(req.postDataJSON());return r.fulfill({status:writes.length===1?503:201,headers,contentType:'application/json',body:writes.length===1?'{"error":"interrupción"}':'{"ok":true,"id":101,"numero_pedido":"2026-00101"}'});
  }
  return r.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true,"rows":[]}'});
 });
 await page.evaluate(()=>{
  window.app.u={id:8,rol:'tecnico',tenant_id:1};window.EMPRESA_CFG={active_business_type:'electricidad',tipo:'cooperativa_electrica'};
  localStorage.setItem('pmg_api_token','jwt-test');
  localStorage.setItem('pmg_offline_queue',JSON.stringify([{_offlineId:'off-test',tipo:'MANTENIMIENTO_INTERNO',usuario_id:7,tenant_id:1,payload:{descripcion:'Trabajo',lat:-31,lng:-60,fotos:[],business_type:'electricidad',operacion_id:'987fbc97-4bed-4078-8f07-9141ba07c9f3'}}]));
 });
 await page.evaluate(()=>window.sincronizarOffline());expect(writes).toHaveLength(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')).length)).toBe(1);
 await page.evaluate(()=>{window.app.u.id=7});
 await page.evaluate(()=>window.sincronizarOffline());expect(writes).toHaveLength(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')).length)).toBe(1);
 await page.evaluate(()=>window.sincronizarOffline());expect(writes).toHaveLength(2);
 expect(writes[0].operacion_id).toBe(writes[1].operacion_id);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')).length)).toBe(0);
});

test('ubicación GPS y punto marcado abren el formulario de mantenimiento Android con coordenadas',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 GestorNova/1.0'}));
 await boot(page);
 await page.evaluate(async()=>{
  window.app.u={id:7,rol:'tecnico',tenant_id:1};
  window.app.map={invalidateSize(){},setView(){},getZoom(){return 16}};
  window.L={latLng:(lat,lng)=>({lat,lng})};
  const m=await import('./modules/pedido-nuevo-desde-punto-coords.js');
  m.initPedidoNuevoDesdePunto({ensureMapReady:async()=>{},esAdminSesionWebPublica:()=>false,
   esAndroidWebViewMapa:()=>true,mostrarMarcadorUbicacion:()=>16,desarmarMapTapNuevoPedido:()=>{},
   htmlLineaUbicacionFormulario:(lat,lng)=>`${lat},${lng}`,programarReverseNominatimFormularioNuevoPedidoDesdeMapa:()=>{}});
  const gps=await import('./modules/nuevo-pedido-desde-gps-mapa.js');
  await gps.ejecutarNuevoPedidoDesdeUbicacionActual({ensureMapReady:async()=>{},getUltimaUbicacion:()=>({lat:-31.3,lon:-60.1,acc:8,timestamp:Date.now(),fuente:'gps'}),
   abrirNuevoPedidoEnCoordenadas:m.abrirNuevoPedidoDesdePunto,registrarFajaInstalacionSiFalta:()=>{},toast:()=>{}});
 });
 await expect(page.locator('#pm')).toHaveClass(/active/);await expect(page.locator('#tt option[value="Mantenimiento interno"]')).toHaveCount(1);
 expect(await page.evaluate(()=>({lat:window.app.sel.lat,lng:window.app.sel.lng}))).toEqual({lat:-31.3,lng:-60.1});
 await page.evaluate(async()=>{const m=await import('./modules/pedido-nuevo-desde-punto-coords.js');await m.abrirNuevoPedidoDesdePunto(-32,-59.5)});
 expect(await page.evaluate(()=>({lat:window.app.sel.lat,lng:window.app.sel.lng}))).toEqual({lat:-32,lng:-59.5});
});

test('botón GPS no usa como ubicación actual una posición guardada antigua',async({page})=>{
 await boot(page);
 const r=await page.evaluate(async()=>{
  const m=await import('./modules/nuevo-pedido-desde-gps-mapa.js');let opened=null,message='';
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,fail){fail({code:2})}}});
  await m.ejecutarNuevoPedidoDesdeUbicacionActual({ensureMapReady:async()=>{},getUltimaUbicacion:()=>({lat:-31,lon:-60,fuente:'gps',timestamp:Date.now()-86400000}),
   abrirNuevoPedidoEnCoordenadas:async(...a)=>{opened=a},registrarFajaInstalacionSiFalta:()=>{},toast:(t)=>{message=t}});
  return {opened,message};
 });
 expect(r.opened).toBe(null);expect(r.message).toContain('GPS actual');
});

test('una carga nueva durante la sincronización no se borra de la cola',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 GestorNova/1.0'}));await boot(page);
 let release;const paused=new Promise(r=>release=r);let received=false;
 await page.route('https://api.admin-prueba.invalid/**',async r=>{
  const req=r.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(req.url().endsWith('/api/pedidos/mantenimiento-interno')){received=true;await paused;return r.fulfill({status:201,headers,contentType:'application/json',body:'{"ok":true,"id":101}'})}
  return r.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true,"rows":[]}'});
 });
 await page.evaluate(()=>{
  window.app.u={id:7,rol:'tecnico',tenant_id:1};window.EMPRESA_CFG={active_business_type:'electricidad'};localStorage.setItem('pmg_api_token','jwt-test');
  localStorage.setItem('pmg_offline_queue',JSON.stringify([{_offlineId:'first',tipo:'MANTENIMIENTO_INTERNO',usuario_id:7,tenant_id:1,payload:{descripcion:'Trabajo',lat:-31,lng:-60,fotos:[],business_type:'electricidad',operacion_id:'987fbc97-4bed-4078-8f07-9141ba07c9f3'}}]));
  window.sincronizarOffline();
 });
 await expect.poll(()=>received).toBe(true);
 await page.evaluate(()=>{const q=JSON.parse(localStorage.getItem('pmg_offline_queue'));q.push({_offlineId:'new',tipo:'UPDATE',query:'UPDATE pedidos SET avance=1 WHERE id=1'});localStorage.setItem('pmg_offline_queue',JSON.stringify(q))});
 release();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')).map(x=>x._offlineId))).toEqual(['new']);
});
