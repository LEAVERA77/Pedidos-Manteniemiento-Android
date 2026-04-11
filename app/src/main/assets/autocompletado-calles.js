/**
 * Autocompletado de calles para búsquedas inteligentes
 * made by leavera77
 */

// Cache de sugerencias por ciudad
const _autocompletadoCache = new Map();
const _autocompletadoDebounce = new Map();

/**
 * Busca sugerencias de calles en la BD
 * @param {string} query - Texto de búsqueda
 * @param {string} ciudad - Ciudad donde buscar
 * @param {function} callback - Callback con las sugerencias
 */
async function autocompletarCalle(query, ciudad, callback) {
  const qNorm = String(query || '').trim().toLowerCase();
  const ciudadNorm = String(ciudad || '').trim();
  
  if (qNorm.length < 2 || !ciudadNorm) {
    callback([]);
    return;
  }
  
  const cacheKey = `${ciudadNorm}:${qNorm}`;
  
  // Revisar cache
  if (_autocompletadoCache.has(cacheKey)) {
    callback(_autocompletadoCache.get(cacheKey));
    return;
  }
  
  // Debounce: cancelar búsqueda anterior
  if (_autocompletadoDebounce.has(ciudadNorm)) {
    clearTimeout(_autocompletadoDebounce.get(ciudadNorm));
  }
  
  // Nueva búsqueda con delay de 300ms
  const timeoutId = setTimeout(async () => {
    try {
      const qParam = `q=${encodeURIComponent(qNorm)}`;
      const cParam = `ciudad=${encodeURIComponent(ciudadNorm)}`;
      const lParam = `limit=10`;
      const path = `/api/calles-normalizadas/sugerencias?${qParam}&${cParam}&${lParam}`;
      const url = window.apiUrl ? window.apiUrl(path) : path;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[autocompletar] Error en respuesta:', response.status);
        callback([]);
        return;
      }
      
      const data = await response.json();
      const sugerencias = data.sugerencias || [];
      
      // Guardar en cache (max 5 minutos)
      _autocompletadoCache.set(cacheKey, sugerencias);
      setTimeout(() => _autocompletadoCache.delete(cacheKey), 5 * 60 * 1000);
      
      callback(sugerencias);
      
    } catch (err) {
      console.error('[autocompletar] Error:', err);
      callback([]);
    }
  }, 300);
  
  _autocompletadoDebounce.set(ciudadNorm, timeoutId);
}

/**
 * Agrega autocompletado a un campo de input
 * @param {HTMLInputElement} inputElement - Campo de texto
 * @param {string} ciudad - Ciudad para buscar
 * @param {function} onSelect - Callback cuando se selecciona una opción
 */
function agregarAutocompletadoCalle(inputElement, ciudad, onSelect) {
  if (!inputElement) return;
  
  // Crear contenedor de sugerencias
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'autocomplete-suggestions';
  suggestionsContainer.style.cssText = `
    position: absolute;
    z-index: 10000;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    display: none;
  `;
  
  // Insertar después del input
  inputElement.parentElement.appendChild(suggestionsContainer);
  
  // Event: input
  inputElement.addEventListener('input', (e) => {
    const query = e.target.value;
    
    autocompletarCalle(query, ciudad, (sugerencias) => {
      // Limpiar sugerencias previas
      suggestionsContainer.innerHTML = '';
      
      if (sugerencias.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
      }
      
      // Renderizar sugerencias
      sugerencias.forEach(sug => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.style.cssText = `
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          font-size: 0.9rem;
          border-bottom: 1px solid #f3f4f6;
        `;
        item.textContent = sug.nombre_oficial;
        
        item.addEventListener('mouseenter', () => {
          item.style.background = '#f3f4f6';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.background = 'white';
        });
        
        item.addEventListener('click', () => {
          inputElement.value = sug.nombre_oficial;
          suggestionsContainer.style.display = 'none';
          if (onSelect) onSelect(sug);
        });
        
        suggestionsContainer.appendChild(item);
      });
      
      // Posicionar y mostrar
      const rect = inputElement.getBoundingClientRect();
      suggestionsContainer.style.top = (rect.bottom + window.scrollY) + 'px';
      suggestionsContainer.style.left = rect.left + 'px';
      suggestionsContainer.style.width = rect.width + 'px';
      suggestionsContainer.style.display = 'block';
    });
  });
  
  // Event: click fuera
  document.addEventListener('click', (e) => {
    if (e.target !== inputElement && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = 'none';
    }
  });
  
  // Event: blur
  inputElement.addEventListener('blur', () => {
    setTimeout(() => {
      suggestionsContainer.style.display = 'none';
    }, 200);
  });
}

/**
 * Re-geocodifica un pedido con el sistema inteligente
 * @param {number} pedidoId - ID del pedido
 */
async function regeocodificarPedido(pedidoId) {
  if (!confirm('¿Re-geocodificar este pedido con el sistema inteligente?\n\nEsto actualizará las coordenadas usando:\n1. Catálogo de socios\n2. Normalización de calles\n3. Nominatim\n4. Interpolación municipal')) {
    return;
  }
  
  // Mostrar indicador de carga
  const btnRegeo = document.getElementById('btn-regeocodificar');
  if (btnRegeo) {
    btnRegeo.disabled = true;
    btnRegeo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Re-geocodificando...';
  }
  
  try {
    const token = window.getApiToken ? window.getApiToken() : null;
    if (!token) {
      throw new Error('No hay sesión activa. Por favor, inicia sesión.');
    }
    
    const apiUrl = window.apiUrl ? window.apiUrl(`/api/pedidos/${pedidoId}/regeocodificar`) : `/api/pedidos/${pedidoId}/regeocodificar`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al re-geocodificar');
    }
    
    // Mostrar resultado
    let logHtml = '';
    if (result.log && result.log.length > 0) {
      logHtml = '<div style="background:#f3f4f6;padding:1rem;border-radius:0.5rem;margin-top:1rem;font-family:monospace;font-size:0.8rem;max-height:300px;overflow-y:auto">';
      result.log.forEach(line => {
        logHtml += `<div style="margin-bottom:0.3rem">${escapeHtml(line)}</div>`;
      });
      logHtml += '</div>';
    }
    
    if (window.toast) {
      window.toast(
        `<div style="text-align:left">
          <p style="margin:0 0 0.5rem"><strong>✓ Pedido re-geocodificado</strong></p>
          <p style="margin:0;font-size:0.9rem">Coordenadas: ${result.coordenadas.lat.toFixed(6)}, ${result.coordenadas.lng.toFixed(6)}</p>
          <p style="margin:0.25rem 0 0;font-size:0.85rem;color:#6b7280">Fuente: ${result.fuente}</p>
          ${logHtml}
        </div>`,
        'success'
      );
    }
    
    // Actualizar mapa si está visible
    if (typeof actualizarPinEnMapa === 'function') {
      actualizarPinEnMapa(pedidoId, result.coordenadas.lat, result.coordenadas.lng);
    }
    
    // Recargar detalle
    setTimeout(() => {
      if (typeof refrescarDetalleSiAbiertoTrasSync === 'function') {
        refrescarDetalleSiAbiertoTrasSync(pedidoId);
      }
    }, 1000);
    
  } catch (err) {
    console.error('[regeocodificar] Error:', err);
    if (window.toast) {
      window.toast(`Error al re-geocodificar: ${err.message}`, 'error');
    }
  } finally {
    if (btnRegeo) {
      btnRegeo.disabled = false;
      btnRegeo.innerHTML = '<i class="fas fa-map-marker-alt"></i> Re-geocodificar';
    }
  }
}

// Exponer funciones globalmente
window.autocompletarCalle = autocompletarCalle;
window.agregarAutocompletadoCalle = agregarAutocompletadoCalle;
window.regeocodificarPedido = regeocodificarPedido;
