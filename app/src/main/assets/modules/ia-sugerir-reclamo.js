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

function limpiarNombreLocalidad(raw) {
  if (!raw) return '';
  return raw
    .replace(/^(municipio|cooperativa)\s+(de\s+agua\s+de|eléctrica\s+de|electrica\s+de|de)\s+/i, '')
    .trim();
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
      const calleVal = String(calleEl?.value || '').trim();
      if (!calleVal && calleEl) {
        calleEl.value = String(c.direccion).trim();
        highlightField(calleEl);
      }
    }

    const numEl = document.getElementById('ped-cli-num');
    if (c.numero_puerta && numEl) {
      const numVal = String(numEl.value || '').trim();
      if (!numVal) {
        numEl.value = String(c.numero_puerta).trim();
        highlightField(numEl);
      }
    }

    const clEl = document.getElementById('cl');
    if (c.nombre_vecino && clEl) {
      const clVal = String(clEl.value || '').trim();
      if (!clVal) {
        clEl.value = String(c.nombre_vecino).trim();
        highlightField(clEl);
      }
    }

    const locEl = document.getElementById('ped-cli-loc');
    if (c.localidad && locEl) {
      const locVal = String(locEl.value || '').trim();
      if (!locVal) {
        locEl.value = limpiarNombreLocalidad(c.localidad);
        highlightField(locEl);
      }
    }
    if (locEl) {
      const locCurr = String(locEl.value || '').trim();
      if (locCurr) {
        const cleaned = limpiarNombreLocalidad(locCurr);
        if (cleaned !== locCurr) {
          locEl.value = cleaned;
          highlightField(locEl);
        }
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
