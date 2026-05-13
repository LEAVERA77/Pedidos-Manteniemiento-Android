/**
 * Deteccion de duplicados al crear un pedido nuevo.
 * Al confirmar, consulta /api/ia/detectar-duplicados y muestra aviso.
 * made by leavera77
 */

let _wired = false;

async function detectarDuplicados(tipoTrabajo, descripcion, barrio, lat, lng) {
  const base = window._gnApiBase || window.API_BASE || '';
  try {
    const r = await fetch(`${base}/api/ia/detectar-duplicados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_trabajo: tipoTrabajo, descripcion, barrio, lat, lng }),
    });
    const d = await r.json();
    if (d.ok && d.duplicados?.length) return d.duplicados;
  } catch (_) {}
  return [];
}

function mostrarAvisoDuplicado(dups) {
  const existing = document.getElementById('gn-duplicado-aviso');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'gn-duplicado-aviso';
  div.style.cssText =
    'position:fixed;top:1rem;right:1rem;z-index:100000;max-width:380px;' +
    'background:#fef3c7;border:2px solid #f59e0b;border-radius:.65rem;padding:.75rem 1rem;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:.82rem;color:#92400e;animation:fadeIn .3s';

  let html = '<div style="font-weight:700;margin-bottom:.35rem">⚠️ Posibles duplicados</div>';
  for (const d of dups.slice(0, 3)) {
    const fecha = d.fecha_creacion ? new Date(d.fecha_creacion).toLocaleDateString('es-AR') : '';
    html += `<div style="margin-bottom:.25rem">• <strong>${d.numero_pedido || '#' + d.id}</strong> — ${d.tipo_trabajo || ''} (${d.estado}, ${fecha})</div>`;
  }
  html += '<div style="margin-top:.4rem;font-size:.74rem;color:#78350f">Podés continuar creando el pedido igualmente.</div>';
  html += '<button type="button" style="margin-top:.35rem;background:#f59e0b;color:#fff;border:none;border-radius:.3rem;padding:.3rem .6rem;cursor:pointer;font-size:.76rem" onclick="this.parentElement.remove()">Entendido</button>';

  div.innerHTML = html;
  document.body.appendChild(div);
  setTimeout(() => { if (div.parentElement) div.remove(); }, 15000);
}

function hookCrearPedido() {
  if (_wired) return;
  const form = document.getElementById('pm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    const tt = document.getElementById('tt')?.value || '';
    const desc = document.getElementById('de')?.value || '';
    const barrio = document.getElementById('di2')?.value || '';
    const lat = document.getElementById('la')?.value || '';
    const lng = document.getElementById('lo')?.value || '';
    if (!tt.trim()) return;

    const dups = await detectarDuplicados(tt, desc, barrio, lat, lng);
    if (dups.length) mostrarAvisoDuplicado(dups);
  }, true);

  _wired = true;
}

export { hookCrearPedido, detectarDuplicados };
