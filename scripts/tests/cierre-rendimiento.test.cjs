const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const androidSource = path.join(__dirname, '../../app/src/main/assets/app.js');
const source = fs.readFileSync(fs.existsSync(androidSource) ? androidSource : path.join(__dirname, '../../app.js'), 'utf8');
const part = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));

function harness() {
  const handlers = {};
  const calls = [];
  const canvasCtx = {
    beginPath: () => calls.push('begin'), arc: () => calls.push('arc'), fill: () => calls.push('fill'),
    fillRect: () => calls.push('clear'), moveTo: () => calls.push('move'),
    lineTo: () => calls.push('line'), stroke: () => calls.push('stroke'),
    getImageData: () => { throw Error('No debería leer píxeles'); },
  };
  let rectReads = 0;
  const canvas = { width: 320, height: 120, getContext: () => canvasCtx,
    getBoundingClientRect: () => { rectReads++; return { left: 0, top: 0, width: 160, height: 60 }; },
    addEventListener: (event, fn) => { handlers[event] = fn; }, toDataURL: () => 'data:image/png;base64,firma' };
  const elements = {};
  for (const id of ['cm2', 'ci', 'tr', 'tc2', 'tc', 'lbl-firma-cierre', 'cierre-tel-contacto',
    'chk-epp', 'chk-corte', 'chk-senal', 'cierre-materiales-block', 'cierre-materiales-body']) {
    const classes = new Set();
    elements[id] = { style: {}, value: '', innerHTML: '', textContent: '', checked: false,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } };
  }
  elements['firma-canvas-cierre'] = canvas;
  const frames = [], timers = [], requests = [];
  elements.cc2 = { disabled: false, innerHTML: '', addEventListener: (name, fn) => { handlers.confirm = fn; } };
  const app = { cid: null, u: { nombre: 'Técnico' }, p: [
    { id: 1, np: '1', tt: 'Corte', de: 'Descripción', cl: '' },
    { id: 2, np: '2', tt: 'Corte', de: 'Descripción', cl: 'Cliente' },
  ] };
  const context = vm.createContext({ app, window: {}, document: { getElementById: id => elements[id] },
    console, modoOffline: false, NEON_OK: true, fotoCierreTemp: null,
    validarPuedeCerrarPedido: () => ({ ok: true }), esAdmin: () => true, esTecnicoOSupervisor: () => false,
    etiquetaFirmaPersona: () => 'socio', etiquetaCampoClientePedido: () => 'cliente',
    pedidoTieneClienteCargado: p => !!p.cl, tipoPedidoExcluyeMateriales: () => false,
    syncChecklistSeguridadCierreLabels: () => {}, actualizarVistaPreviaFotoCierre: () => {},
    puedeEditarMaterialesEnPedido: () => false, escHtmlPrint: x => x,
    mensajeErrorUsuario: e => e.message, logErrorWeb: () => {}, toast: () => {},
    sqlMaterialesPedidoRows: pid => new Promise((resolve, reject) => requests.push({ pid, resolve, reject })),
    requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => timers.push(fn),
  });
  vm.runInContext(part('let _firmaCanvasBound = false;', '\nfunction htmlOptsUnidadMaterial'), context);
  vm.runInContext(part('function _materialesCierreModalSigueSiendoPedidoActual(p)', '\nasync function refrescarMaterialesEnDetalle'), context);
  vm.runInContext(part('// Invalida respuestas de cargas anteriores', '\nwindow.refrescarMaterialesCierrePorPid'), context);
  vm.runInContext(part('async function abrirCierre(id)', "\ndocument.getElementById('btn-limpiar-firma-cierre')"), context);
  return { context, elements, app, handlers, calls, frames, timers, requests,
    get rectReads() { return rectReads; },
    runTasks() { while (frames.length) frames.shift()(); while (timers.length) timers.shift()(); },
  };
}

test('firma se dibuja por segmentos y limpiar reinicia sin leer píxeles', () => {
  const h = harness(); h.context.initFirmaCierreCanvas();
  assert.equal(h.context.firmaCierreCanvasVacio(), true);
  h.handlers.touchstart({ touches: [{ clientX: 10, clientY: 10 }], preventDefault() {} });
  for (let i = 0; i < 20; i++) h.handlers.touchmove({ touches: [{ clientX: 11 + i, clientY: 11 }], preventDefault() {} });
  h.handlers.touchend();
  assert.equal(h.context.firmaCierreCanvasVacio(), false);
  assert.equal(h.rectReads, 1);
  assert.equal(h.calls.filter(x => x === 'stroke').length, 20);
  assert.equal(h.calls.filter(x => x === 'begin').length, 21);
  h.context.limpiarFirmaCierreCanvas();
  assert.equal(h.context.firmaCierreCanvasVacio(), true);
  h.context.initFirmaCierreCanvas();
  assert.equal(h.context.firmaCierreCanvasVacio(), true);
});

test('muestra modal antes de consultar materiales y permite completar la carga', async () => {
  const h = harness(); await h.context.abrirCierre(1);
  assert.equal(h.elements.cm2.classList.contains('active'), true);
  assert.match(h.elements['cierre-materiales-body'].innerHTML, /Cargando/);
  assert.equal(h.requests.length, 0);
  h.runTasks(); assert.equal(h.requests.length, 1);
  h.requests[0].resolve([]); await new Promise(setImmediate);
  assert.match(h.elements['cierre-materiales-body'].innerHTML, /Sin materiales/);
});

test('descarta respuestas y errores antiguos al reabrir, incluso el mismo pedido', async () => {
  const h = harness(); await h.context.abrirCierre(1); h.runTasks();
  await h.context.abrirCierre(1); h.runTasks();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve([]); await new Promise(setImmediate);
  const result = h.elements['cierre-materiales-body'].innerHTML;
  h.requests[0].reject(new Error('error de solicitud vieja')); await new Promise(setImmediate);
  assert.equal(h.elements['cierre-materiales-body'].innerHTML, result);
  assert.match(result, /Sin materiales/);
});

test('una apertura diferida anterior no consulta ni reemplaza materiales del pedido nuevo', async () => {
  const h = harness(); await h.context.abrirCierre(1); await h.context.abrirCierre(2);
  h.runTasks(); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].pid, 2);
  h.requests[0].resolve([]); await new Promise(setImmediate);
  assert.match(h.elements['cierre-materiales-body'].innerHTML, /Sin materiales/);
});

function installConfirmation(h) {
  const updates = [], messages = [];
  Object.assign(h.context, {
    pedidoTieneClienteCargado: p => !!p.cl,
    toast: message => messages.push(message), toastError: (where, error) => messages.push(error.message),
    updPedido: async (...args) => updates.push(args), puedeEnviarApiRestPedidos: () => false,
    closeAll: () => {},
  });
  vm.runInContext(part("document.getElementById('cc2').addEventListener('click'", '\nfunction pedidoEsDerivadoFuera'), h.context);
  return { updates, messages };
}

test('mantiene obligatoria la firma con cliente y envía los datos al confirmar', async () => {
  const h = harness(); const { updates, messages } = installConfirmation(h);
  await h.context.abrirCierre(2); h.elements.tr.value = 'Trabajo realizado';
  await h.handlers.confirm();
  assert.equal(updates.length, 0); assert.match(messages[0], /firma es obligatoria/);
  h.handlers.mousedown({ clientX: 3, clientY: 4 }); h.handlers.mouseup();
  await h.handlers.confirm();
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], 2);
  assert.equal(updates[0][1].firma_cliente, 'data:image/png;base64,firma');
  assert.equal(updates[0][1].trabajo_realizado, 'Trabajo realizado');
  assert.equal(updates[0][1].estado, 'Cerrado');
  assert.equal(h.elements.cc2.disabled, false);
});

test('sin cliente se puede confirmar sin firma', async () => {
  const h = harness(); const { updates } = installConfirmation(h);
  await h.context.abrirCierre(1); h.elements.tr.value = 'Trabajo realizado';
  await h.handlers.confirm(); assert.equal(updates.length, 1);
  assert.equal(updates[0][1].firma_cliente, null);
});
