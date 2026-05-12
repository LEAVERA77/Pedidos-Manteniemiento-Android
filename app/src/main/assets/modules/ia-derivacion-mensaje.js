/**
 * Genera automáticamente un mensaje de derivación a terceros con IA (Groq).
 * Solo admin. Se invoca desde el botón ✨ en el bloque de derivación del modal de pedido.
 * made by leavera77
 */

const DEST_LABELS = {
  empresa_energia: 'Cooperativa Eléctrica',
  cooperativa_agua: 'Cooperativa de Agua',
  empresa_gas_natural: 'Empresa de Gas Natural',
  empresa_telefonia: 'Empresa de Telefonía',
  empresa_internet: 'Proveedor de Internet',
  empresa_tv_cable: 'Empresa de TV Cable',
  policia: 'Policía',
  otro: 'Tercero',
};

function _resolveDest() {
  const sel = document.getElementById('admin-derivar-destino');
  if (!sel) return 'Tercero';
  const raw = (sel.value || '').trim();
  const key = raw.split('::')[0] || '';
  if (DEST_LABELS[key]) return DEST_LABELS[key];
  const txt = sel.options?.[sel.selectedIndex]?.textContent?.trim();
  return txt || 'Tercero';
}

function _pedidoData(pid) {
  const pedidos = window.app?.p;
  if (!Array.isArray(pedidos)) return {};
  return pedidos.find(x => String(x.id) === String(pid)) || {};
}

function _priLabel(p) {
  const pr = String(p.pr || p.prioridad || '').trim();
  if (!pr) return '';
  const n = pr.toLowerCase();
  if (n === 'alta' || n === 'high') return 'Alta';
  if (n === 'baja' || n === 'low') return 'Baja';
  return 'Media';
}

async function generarMensajeDerivacionIA(pid) {
  const btn = document.getElementById('ia-generar-derivacion');
  const ta = document.getElementById('admin-derivar-motivo');
  if (!btn || !ta) return;

  if (typeof window.esAdmin === 'function' && !window.esAdmin()) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Generando...';

  try {
    if (typeof window.asegurarJwtApiRest === 'function') await window.asegurarJwtApiRest();
    const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
    if (!token) throw new Error('Sin sesión API');

    const p = _pedidoData(pid);
    const dest = _resolveDest();

    const dir = [
      String(p.di || p.direccion || '').trim(),
      String(p.nu || '').trim(),
    ].filter(Boolean).join(' ');

    const barrio = String(p.br || p.barrio || p.dis || '').trim();
    const desc = String(p.de || p.descripcion || '').trim();
    const tipo = String(p.tt || p.tipo_trabajo || '').trim();
    const pri = _priLabel(p);

    const ec = window.EMPRESA_CFG || {};
    const tel = String(ec.telefono || ec.whatsapp || '').trim();

    const base = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/generar-mensaje-derivacion') : '/api/ia/generar-mensaje-derivacion';

    const resp = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        destinatario: dest,
        tipo_reclamo: tipo,
        direccion: dir || undefined,
        barrio: barrio || undefined,
        descripcion: desc || undefined,
        prioridad: pri || undefined,
        telefono_contacto: tel || undefined,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Error del servidor');

    ta.value = data.mensaje;
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    if (typeof window.toast === 'function') {
      window.toast('Mensaje generado. Revisalo antes de enviar.', 'success');
    }
  } catch (e) {
    console.warn('[ia-derivacion]', e);
    if (typeof window.toast === 'function') {
      window.toast('No se pudo generar el mensaje. Escribilo manualmente.', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

if (typeof window !== 'undefined') {
  window._gnGenerarMensajeDerivacionIA = generarMensajeDerivacionIA;
}
