/**
 * Textos de tablas y botones IA (reclamos / informe) según rubro.
 * Cooperativa eléctrica: distribuidor = zona de red; actor = socio/cliente.
 * made by leavera77
 */

/** @param {string} tipoNegocio */
export function labelsIaReclamosTablas(tipoNegocio) {
  if (tipoNegocio === 'cooperativa_electrica') {
    return {
      topActorTitle: 'Top socios / usuarios con más reclamos',
      actorCol: 'Socio / cliente',
      zonaTitle: 'Top distribuidores (zona de red eléctrica)',
      zonaCol: 'Distribuidor',
      repetidosTitle: 'Reclamos repetidos (mismo socio/cliente, mismo tipo)',
      repetidosActorCol: 'Socio / cliente',
    };
  }
  if (tipoNegocio === 'cooperativa_agua') {
    return {
      topActorTitle: 'Top socios con más reclamos',
      actorCol: 'Socio',
      zonaTitle: 'Top zonas / barrios',
      zonaCol: 'Zona / barrio',
      repetidosTitle: 'Reclamos repetidos (mismo socio, mismo tipo)',
      repetidosActorCol: 'Socio',
    };
  }
  return {
    topActorTitle: 'Top vecinos con más reclamos',
    actorCol: 'Vecino',
    zonaTitle: 'Top barrios / zonas',
    zonaCol: 'Barrio / zona',
    repetidosTitle: 'Reclamos repetidos (mismo vecino, mismo tipo)',
    repetidosActorCol: 'Vecino',
  };
}

/** Bloque informativo bajo el título del análisis en Estadísticas (solo eléctrica). */
export function htmlContextoIaEstadisticasElectrica() {
  return (
    '<div style="font-size:.75rem;color:#5b21b6;margin-bottom:.55rem;line-height:1.5;padding:.45rem .55rem;background:#faf5ff;border:1px solid #ddd6fe;border-radius:.35rem">' +
    '<strong>Cooperativa eléctrica:</strong> la columna <em>Distribuidor</em> refleja la zona de red (alineada al código <strong>Dist.</strong> del catálogo Socios/NIS). ' +
    'Las métricas <strong>SAIFI / SAIDI</strong> de este panel son estimaciones internas a partir de <strong>reclamos de red</strong> cerrados y el denominador del catálogo por Dist. o de <strong>Red Eléctrica</strong>, según la configuración del tenant.' +
    '</div>'
  );
}

/** Botón #btn-ia-analizar-est cuando el tenant es cooperativa eléctrica. */
export function btnAnalizarEstadisticasIaElectrica() {
  return {
    html: '<i class="fas fa-bolt"></i> IA estadísticas (red)',
    title:
      'Análisis IA de reclamos (30 días): socios, distribuidores/zona de red y tipos. Complementa SAIFI/SAIDI y reclamos de red del panel.',
  };
}

/** Botón #btn-ia-informe-unificado cuando el tenant es cooperativa eléctrica. */
export function btnInformeIaElectrico() {
  return {
    html: '<i class="fas fa-file-alt"></i> Informe IA (cooperativa)',
    title:
      'Informe unificado con métricas, KPIs, valoración WhatsApp del socio/usuario y texto IA. Usa distribuidor como zona de red eléctrica.',
  };
}

/** Título de la sección de satisfacción en informe / PDF / impresión. */
export function tituloSatisfaccionWhatsappIa(tipoNegocio) {
  if (tipoNegocio === 'cooperativa_electrica') return 'Valoración WhatsApp del socio / usuario';
  return 'Valoración WhatsApp del Vecino';
}
