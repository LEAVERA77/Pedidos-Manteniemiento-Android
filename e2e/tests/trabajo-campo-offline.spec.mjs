import {test,expect} from '@playwright/test';
async function boot(page,{offline=true}={}){
 await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 GestorNova/1.0'});window.AndroidDevice={getFreshGpsForOfflineWork(cb){const key=cb.split('.').pop();window[key]({ok:true,lat:-31.3,lng:-60.1,accuracy:10,timestamp:Date.now(),fuente:'gps'})}}});
 await page.route('**/config.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"api":{"baseUrl":"https://api.admin-prueba.invalid"}}'}));
 await page.route('https://api.admin-prueba.invalid/**',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:'{"ok":true,"rows":[]}'}));
 await page.route(/^https:\/\/(?!api\.admin-prueba\.invalid)/,r=>r.abort());
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window._a==='function' && window.app);
 await page.evaluate(()=>{const u={id:7,rol:'tecnico',nombre:'Técnico',tenant_id:1};window.app.u=u;document.documentElement.classList.add('gn-android-shell');localStorage.setItem('pmg',JSON.stringify(u));localStorage.setItem('pmg_rubro_interno_u7_t1','electricidad');
 localStorage.setItem('pmg_geo_campo_u7_t1_belectricidad',JSON.stringify({usuario_id:7,tenant_id:1,business_type:'electricidad',habilitada:true,radio_metros:100}));
 window.app.p=[{id:10,np:'P-10',de:'Reparar equipo',dis:'Central',pr:'Media',tt:'Reparación',es:'Asignado',av:0,tai:7,la:-31.3,ln:-60.1,fasi:'2026-01-01T00:00:00.000Z',fa:null,fotos:[],cl:''}];
 });
 if (offline) await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
}
test('inicio GPS y avance, materiales y cierre quedan en diario separado',async({page})=>{
 await boot(page);await page.evaluate(()=>window._a('i',10));
 await expect(page.locator('#gn-modal-fotos-campo')).toHaveClass(/active/);await page.locator('#gn-fotos-campo-saltar').click();
 await expect.poll(()=>page.evaluate(()=>window.app.p[0].es)).toBe('En ejecución');
 await page.evaluate(()=>window._a('av',10));await expect(page.locator('#avance-modal')).toHaveClass(/active/);
 await page.locator('#avance-input').fill('35');await page.locator('#guardar-avance').click();
 await expect.poll(()=>page.evaluate(()=>window.app.p[0].av)).toBe(35);
 await page.evaluate(()=>{for(const [id,value] of [['mat-desc-10','Cable'],['mat-cant-10','2'],['mat-un-10','MTR']]){let e=document.getElementById(id);if(!e){e=document.createElement('input');e.id=id;document.body.appendChild(e)}e.value=value}});
 await page.evaluate(()=>window.agregarMaterialPedidoDesdeDetalle(10));
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_trabajo_campo_queue_v1'))[0].eventos.length)).toBe(3);
 await page.evaluate(()=>window._a('c',10));await expect(page.locator('#cm2')).toHaveClass(/active/);
 await page.locator('#tr').fill('Reparado');await page.locator('#cc2').click();
 await expect.poll(()=>page.evaluate(()=>window.app.p[0].es)).toBe('Cerrado');
 const q=await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_trabajo_campo_queue_v1'))[0]);
 expect(q.eventos.map(e=>e.tipo)).toEqual(['inicio','avance','material','cierre']);expect(q.eventos[2]).toMatchObject({descripcion:'Cable',cantidad:2,unidad:'MTR'});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_offline_queue')||'[]').filter(x=>x.tipo==='UPDATE').length)).toBe(0);
});
test('si no hay configuración no finge guardar el inicio',async({page})=>{
 await boot(page);await page.evaluate(()=>{localStorage.removeItem('pmg_geo_campo_u7_t1_belectricidad');window._a('i',10)});
 await page.locator('#gn-fotos-campo-saltar').click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('pmg_trabajo_campo_queue_v1'))).toBe(null);
 expect(await page.evaluate(()=>window.app.p[0].es)).toBe('Asignado');
});
test('reintentos congelados requieren confirmación del mismo UUID',async({page})=>{
 await boot(page);
 const out=await page.evaluate(async()=>{
  const m=await import('./modules/offline-trabajo-campo-runtime.js');const c={usuario_id:7,tenant_id:1,business_type:'electricidad'};
  const fecha=new Date().toISOString(),p=window.app.p[0],gps={lat:-31.3,lng:-60.1,accuracy:5,timestamp:Date.now(),fuente:'gps'};
  m.agregarTrabajoCampo(c,p,{tipo:'inicio',fecha,gps});const cuerpos=[];
  const opts={apiUrl:p=>p,token:'jwt',fetchFn:async(_u,o)=>{const b=JSON.parse(o.body);cuerpos.push(o.body);if(cuerpos.length===1)throw Error('respuesta perdida');
    return new Response(JSON.stringify({ok:true,pedido_id:10,operacion_id:cuerpos.length===2?'operación-incorrecta':b.operacion_id}),{status:200})}};
  const a=await m.sincronizarTrabajosCampo(c,opts);const b=await m.sincronizarTrabajosCampo(c,opts);const antes=JSON.parse(localStorage.getItem('pmg_trabajo_campo_queue_v1'));
  const d=await m.sincronizarTrabajosCampo(c,opts);return {a,b,d,antes,iguales:cuerpos[0]===cuerpos[1]&&cuerpos[1]===cuerpos[2],restantes:JSON.parse(localStorage.getItem('pmg_trabajo_campo_queue_v1'))};
 });
 expect(out.a.errores).toHaveLength(1);expect(out.b.errores).toHaveLength(1);expect(out.antes[0].congelado).toBe(true);
 expect(out.iguales).toBe(true);expect(out.d.confirmados).toBe(1);expect(out.restantes).toHaveLength(0);
});
test('GPS alejado y cuenta distinta no habilitan inicio de campo',async({page})=>{
 await boot(page);
 const out=await page.evaluate(async()=>{const m=await import('./modules/offline-trabajo-campo-runtime.js');const p=window.app.p[0],fecha=new Date().toISOString();
  const c={usuario_id:7,tenant_id:1,business_type:'electricidad'},gps={lat:-32,lng:-60.1,accuracy:10,timestamp:Date.now(),fuente:'gps'};
  const errores=[];try{m.agregarTrabajoCampo(c,p,{tipo:'inicio',fecha,gps})}catch(e){errores.push(e.message)}
  try{m.agregarTrabajoCampo({...c,usuario_id:8},p,{tipo:'inicio',fecha,gps:{...gps,lat:-31.3}})}catch(e){errores.push(e.message)}
  return {errores,q:localStorage.getItem('pmg_trabajo_campo_queue_v1')};});
 expect(out.errores).toHaveLength(2);expect(out.q).toBe(null);
});
test('administrador no consulta GPS ni servidor de geocerca; técnico sí respeta el rechazo',async({page})=>{
 await boot(page);
 const resultado=await page.evaluate(async()=>{
  const m=await import('./modules/pedido-operativa-top3-ui.js');let gps=0,requests=0;
  window.AndroidDevice.getCurrentLocationForGeocerca=(cb)=>{gps++;window[cb.split('.').pop()]({ok:true,lat:-31.3,lng:-60.1,accuracy:10})};
  window.gnOperativaGeocercaVerificar=async()=>{requests++;return {permitido:false,distancia_metros:500,max_metros:100}};
  window.app.u={id:1,rol:'admin',tenant_id:1};const admin=await m.verificarGeocercaAntesIniciarPedido(10);const countAdmin=[gps,requests];
  window.app.u={id:7,rol:'tecnico',tenant_id:1};const tecnico=await m.verificarGeocercaAntesIniciarPedido(10);
  window.gnOperativaGeocercaVerificar=async()=>{throw new TypeError('Failed to fetch')};const red=await m.verificarGeocercaAntesIniciarPedido(10);
  window.gnOperativaGeocercaVerificar=async()=>{throw new Error('Prohibido')};const permiso=await m.verificarGeocercaAntesIniciarPedido(10);
  return {admin,countAdmin,tecnico,red,permiso};
 });
 expect(resultado.admin.ok).toBe(true);expect(resultado.countAdmin).toEqual([0,0]);
 expect(resultado.tecnico.ok).toBe(false);expect(resultado.tecnico.message).toContain('500');
 expect(resultado.red.sinConexion).toBe(true);expect(resultado.permiso.sinConexion).toBe(false);
});
test('ante Failed to fetch usa geocerca local sin convertir rechazos HTTP en offline',async({page})=>{
 await boot(page,{offline:false});
 await page.waitForTimeout(500);
 await page.evaluate(()=>{
  window.__geoCalls=0;
  window.AndroidDevice.getCurrentLocationForGeocerca=cb=>window[cb.split('.').pop()]({ok:true,lat:-31.3,lng:-60.1,accuracy:5});
  window.gnOperativaGeocercaVerificar=async()=>{window.__geoCalls++;throw new TypeError('Failed to fetch')};
  window._a('i',10);
 });
 await expect(page.locator('#gn-modal-fotos-campo')).toHaveClass(/active/);await page.locator('#gn-fotos-campo-saltar').click();
 await expect.poll(()=>page.evaluate(()=>window.app.p[0].es)).toBe('En ejecución');
 expect(await page.evaluate(()=>window.__geoCalls)).toBe(1);
 const d=await page.evaluate(()=>JSON.parse(localStorage.getItem('pmg_trabajo_campo_queue_v1'))[0]);
 expect(d.eventos[0].tipo).toBe('inicio');expect(d.eventos[0].gps.fuente).toBe('gps');
});
test('administrador inicia y cierra sin ubicación ni pedir geocerca',async({page})=>{
 await boot(page,{offline:false});
 const writes=[];
 await page.route('https://api.admin-prueba.invalid/**',async r=>{
  const req=r.request(),u=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(u.pathname==='/api/pedidos/10' && req.method()==='PUT') {writes.push(req.postDataJSON());return r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({id:10,numero_pedido:'P-10',descripcion:'Prueba',tipo_trabajo:'Reparación',estado:'En ejecución',avance:0,tecnico_asignado_id:7})});}
  if(u.pathname==='/api/sql/query' && req.method()==='POST') {const q=req.postDataJSON().query||'';if(/^UPDATE pedidos SET/i.test(q))writes.push({sql:q});return r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({rows:[{id:10}],rowCount:1})});}
  return r.fulfill({status:200,headers,contentType:'application/json',body:'{"ok":true,"rows":[]}'});
 });
 await page.evaluate(()=>{window.app.u={id:1,rol:'admin',nombre:'Administrador',tenant_id:1};localStorage.setItem('pmg_api_token','jwt-admin');window.app.apiToken='jwt-admin';window.__geoCalls=0;
  window.gnOperativaGeocercaVerificar=async()=>{window.__geoCalls++;throw Error('no debería invocarse')};
  window.AndroidDevice.getCurrentLocationForGeocerca=()=>{throw Error('no debería pedir GPS')};window._a('i',10);});
 await expect(page.locator('#gn-modal-fotos-campo')).toHaveClass(/active/);await page.locator('#gn-fotos-campo-saltar').click();
 await expect.poll(()=>writes.length).toBe(1);await expect.poll(()=>page.evaluate(()=>window.app.p[0].es)).toBe('En ejecución');
 await page.evaluate(()=>window._a('c',10));await expect(page.locator('#cm2')).toHaveClass(/active/);
 await page.locator('#tr').fill('Trabajo realizado');await page.locator('#cc2').click();
 await expect.poll(()=>writes.length).toBe(2);expect(writes[1].sql).toContain("'Cerrado'");expect(await page.evaluate(()=>window.__geoCalls)).toBe(0);
});
