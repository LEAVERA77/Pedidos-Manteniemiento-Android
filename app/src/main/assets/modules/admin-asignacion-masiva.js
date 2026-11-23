/** Asignación conjunta de pendientes para admin web. El servidor confirma todo o nada. */
const seleccion = new Set();
let modal;
let busy = false;

function habilitado(d) {
    try { return !!d.esAdmin() && !d.esAndroid(); } catch (_) { return false; }
}
function elegible(p) {
    return p && p.es === 'Pendiente' && p.tai == null && Number.isSafeInteger(Number(p.id)) && Number(p.id) > 0 && !p._offline;
}
function limpiarSeleccionInvalida(pedidos) {
    const ids = new Set((pedidos || []).filter(elegible).map(p => String(p.id)));
    for (const id of seleccion) if (!ids.has(id)) seleccion.delete(id);
}

function crearModal(d) {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'mo';
    modal.id = 'gn-asig-masiva-modal';
    modal.style.zIndex = '220000';
    modal.innerHTML = `<div class="mc" style="max-width:480px"><div class="mh"><h3>Asignar pedidos pendientes</h3><button type="button" class="cm" data-cerrar aria-label="Cerrar">×</button></div><div class="mb"><p id="gn-asig-masiva-resumen"></p><label for="gn-asig-masiva-tecnico">Técnico o supervisor</label><select id="gn-asig-masiva-tecnico" style="width:100%;margin:.5rem 0"></select><p style="font-size:.8rem;color:var(--tm)">Se asignarán juntos y quedará un solo aviso de resumen para la app del técnico. La app debe estar conectada para recibirlo.</p><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" class="sec" data-cerrar>Cancelar</button><button type="button" class="bp" id="gn-asig-masiva-confirmar">Asignar y enviar aviso</button></div></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-cerrar]').forEach(btn => btn.addEventListener('click', () => { if (!busy) modal.classList.remove('active'); }));
    modal.addEventListener('click', e => { if (e.target === modal && !busy) modal.classList.remove('active'); });
    modal.querySelector('#gn-asig-masiva-confirmar').addEventListener('click', async () => {
        if (busy || !habilitado(d)) return;
        const ids = [...seleccion].map(Number);
        const tid = Number(modal.querySelector('#gn-asig-masiva-tecnico').value);
        if (!ids.length || ids.length > 100 || !Number.isSafeInteger(tid) || tid < 1) {
            d.toast('Seleccioná entre 1 y 100 pedidos y elegí un técnico.', 'warning'); return;
        }
        const token = d.token();
        if (!token) { d.toast('Iniciá sesión para asignar pedidos.', 'error'); return; }
        busy = true;
        const btn = modal.querySelector('#gn-asig-masiva-confirmar');
        btn.disabled = true;
        try {
            const r = await fetch(d.apiUrl('/api/pedidos/asignacion-masiva'), {
                method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
                body:JSON.stringify({ pedido_ids:ids, tecnico_asignado_id:tid }),
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(body.error || 'No se pudo completar la asignación.');
            seleccion.clear();
            modal.classList.remove('active');
            d.toast(`Se asignaron ${body.cantidad} pedido(s) y se encoló un aviso de resumen.`, 'success');
            try { await d.recargar(); } catch (_) { d.toast('La asignación se guardó; actualizá la lista para verla.', 'warning'); }
            d.render();
        } catch (e) {
            d.toast(String(e?.message || e), 'error');
            try { await d.recargar(); d.render(); } catch (_) {}
        } finally { busy = false; btn.disabled = false; }
    });
    return modal;
}

async function abrir(d) {
    if (!habilitado(d) || busy) return;
    if (!seleccion.size || seleccion.size > 100) { d.toast('Seleccioná entre 1 y 100 pedidos pendientes.', 'warning'); return; }
    const token = d.token();
    if (!token) { d.toast('Iniciá sesión para asignar pedidos.', 'error'); return; }
    const m = crearModal(d);
    const sel = m.querySelector('#gn-asig-masiva-tecnico');
    sel.innerHTML = '<option value="">Elegí un técnico…</option>';
    m.querySelector('#gn-asig-masiva-resumen').textContent = `Vas a asignar ${seleccion.size} pedido(s) pendientes al mismo técnico.`;
    try {
        const r = await fetch(d.apiUrl('/api/usuarios/tecnicos'), {headers:{Authorization:`Bearer ${token}`}});
        const data = await r.json().catch(() => []);
        if (!r.ok || !Array.isArray(data)) throw new Error('No se pudo obtener la lista de técnicos.');
        for (const u of data) {
            if (u.activo === false) continue;
            const opt = document.createElement('option'); opt.value=String(u.id); opt.textContent=String(u.nombre || u.email || `Usuario ${u.id}`); sel.appendChild(opt);
        }
        if (sel.options.length < 2) { d.toast('No hay técnicos activos para asignar.', 'warning'); return; }
        m.classList.add('active');
    } catch (e) { d.toast(String(e?.message || e), 'error'); }
}

/** Agregar controles a la lista vigente, manteniendo detalle y filtros existentes. */
export function prepararAsignacionMasivaLista(d, contenedor, visibles) {
    if (!habilitado(d)) { seleccion.clear(); return; }
    limpiarSeleccionInvalida(d.pedidos());
    const pendientes = (visibles || []).filter(elegible);
    if (!pendientes.length && !seleccion.size) return;
    const barra = document.createElement('div');
    barra.style.cssText = 'display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.6rem;background:#eff6ff;border-bottom:1px solid #bfdbfe';
    const all = document.createElement('input'); all.type='checkbox'; all.id='gn-asig-masiva-todos'; all.setAttribute('aria-label','Seleccionar pedidos pendientes visibles');
    all.checked = !!pendientes.length && pendientes.every(p=>seleccion.has(String(p.id)));
    all.indeterminate = !all.checked && pendientes.some(p=>seleccion.has(String(p.id)));
    all.addEventListener('change',()=>{ pendientes.forEach(p=>all.checked?seleccion.add(String(p.id)):seleccion.delete(String(p.id))); d.render(); });
    const label=document.createElement('label'); label.htmlFor=all.id; label.textContent='Seleccionar visibles';
    const btn=document.createElement('button'); btn.type='button'; btn.className='btn-sm primary'; btn.textContent=`Asignar seleccionados (${seleccion.size})${seleccion.size>100 ? " — máximo 100" : ""}`; btn.disabled=!seleccion.size || seleccion.size>100; btn.addEventListener('click',()=>void abrir(d));
    barra.append(all,label,btn); contenedor.appendChild(barra);
}

export function agregarSelectorAsignacionMasiva(d, elemento, p) {
    if (!habilitado(d) || !elegible(p)) return;
    const label=document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:.35rem;font-size:.8rem;padding:.25rem 0';
    label.addEventListener('click',e=>e.stopPropagation());
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=seleccion.has(String(p.id)); cb.setAttribute('aria-label',`Seleccionar pedido ${p.np || p.id}`);
    cb.addEventListener('change',()=>{ cb.checked?seleccion.add(String(p.id)):seleccion.delete(String(p.id)); d.render(); });
    label.append(cb, document.createTextNode('Seleccionar para asignar')); elemento.prepend(label);
}
