/**
 * Botón "Sugerir con IA" en el formulario de nuevo pedido (#pm).
 * Llama a POST /api/ia/clasificar-reclamo y pre-llena tipo, prioridad y dirección.
 * No modifica la ubicación del mapa.
 * made by leavera77
 */

let _wired = false;

function tipoNegocioActual() {
  const t = String(window.EMPRESA_CFG?.tipo || '').trim().toLowerCase();
  if (t === 'municipio') return 'municipio';
  if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
  if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') return 'cooperativa_electrica';
  return 'municipio';
}

function highlightField(el) {
  if (!el) return;
  el.style.transition = 'background .3s';
  el.style.background = '#d1fae5';
  setTimeout(() => { el.style.background = ''; }, 1800);
}

async function sugerirConIA() {
  const btn = document.getElementById('btn-ia-sugerir-reclamo');
  const textarea = document.getElementById('de');
  if (!textarea || !btn) return;

  const texto = String(textarea.value || '').trim();
  if (texto.length < 5) {
    if (typeof window.toast === 'function') window.toast('Escribí al menos una breve descripción para que la IA pueda analizar.', 'error');
    return;
  }

  const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
  if (!token) {
    if (typeof window.toast === 'function') window.toast('Sesión no disponible. Recargá la página.', 'error');
    return;
  }

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando...';

  try {
    const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/clasificar-reclamo') : '/api/ia/clasificar-reclamo';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        texto,
        tipo_negocio: tipoNegocioActual(),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok || !data.clasificacion) {
      const msg = data.error || 'La IA no pudo analizar el reclamo. Completá los campos manualmente.';
      if (typeof window.toast === 'function') window.toast(msg, 'warning');
      return;
    }

    const c = data.clasificacion;

    const ttSelect = document.getElementById('tt');
    if (ttSelect && c.tipo) {
      const opts = Array.from(ttSelect.options);
      const match = opts.find((o) => o.value === c.tipo || o.textContent.trim() === c.tipo);
      if (match) {
        ttSelect.value = match.value;
        highlightField(ttSelect);
        ttSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (c.tipo !== 'Otros') {
        if (typeof window.toast === 'function') window.toast(`La IA sugirió "${c.tipo}" pero no está en la lista. Verificá manualmente.`, 'info');
      }
    }

    const prSelect = document.getElementById('pr');
    if (prSelect && c.prioridad) {
      const prOpts = Array.from(prSelect.options);
      const prMatch = prOpts.find((o) => o.value === c.prioridad);
      if (prMatch) {
        prSelect.value = prMatch.value;
        highlightField(prSelect);
      }
    }

    if (c.direccion) {
      const calleEl = document.getElementById('ped-cli-calle');
      const numEl = document.getElementById('ped-cli-num');
      const calleVal = String(calleEl?.value || '').trim();
      const numVal = String(numEl?.value || '').trim();
      if (!calleVal && !numVal) {
        const parts = String(c.direccion).match(/^(.+?)\s+(\d+)\s*$/);
        if (parts) {
          if (calleEl) { calleEl.value = parts[1].trim(); highlightField(calleEl); }
          if (numEl) { numEl.value = parts[2].trim(); highlightField(numEl); }
        } else if (calleEl) {
          calleEl.value = String(c.direccion).trim();
          highlightField(calleEl);
        }
      }
    }

    if (c.resumen && textarea) {
      const curr = String(textarea.value || '').trim();
      if (curr.length < 60 && c.resumen.length > curr.length) {
        // no reemplazar — solo informar si el resumen difiere significativamente
      }
    }

    if (c.tipo === 'Otros') {
      if (typeof window.toast === 'function') window.toast('La IA no pudo determinar el tipo exacto. Verificá manualmente.', 'info');
    } else {
      if (typeof window.toast === 'function') window.toast('Campos sugeridos por IA. Revisá antes de guardar.', 'success');
    }
  } catch (err) {
    console.error('[ia-sugerir-reclamo]', err);
    if (typeof window.toast === 'function') window.toast('Error de red al consultar la IA. Completá manualmente.', 'warning');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

export function initIASugerirReclamo() {
  if (_wired) return;
  _wired = true;
  const btn = document.getElementById('btn-ia-sugerir-reclamo');
  if (btn) {
    btn.addEventListener('click', () => void sugerirConIA());
  }
}

(function autoInit() {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIASugerirReclamo);
  } else {
    initIASugerirReclamo();
  }
})();
