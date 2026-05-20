/**
 * HTML del modal detalle de pedido (#dmc). Extraído de app.js detalle().
 * made by leavera77
 */
import { gnDetalleImgAttrs } from './pedido-detalle-html-helpers.js';

export function computeDetalleEstructuraSig(p, deps) {
    const fotosCount = Array.isArray(p.fotos) ? p.fotos.filter(Boolean).length : 0;
    return [
        String(p.id),
        String(p.es || ''),
        String(p.tai ?? ''),
        p.sdpen ? '1' : '0',
        deps.pedidoEsDerivadoFuera(p) ? '1' : '0',
        String(fotosCount),
        deps.esTipoPedidoFactibilidad(p.tt) ? '1' : '0',
        deps.incluirBloqueMaterialesEnDetallePedido(p) ? '1' : '0',
        deps.debeMostrarBotonDerivacion(p) ? '1' : '0',
        deps.esAdmin() ? 'a' : 't',
        p.es === 'Cerrado' ? '1' : '0',
        p.es === 'Desestimado' ? '1' : '0',
    ].join('|');
}

function bindDetalleRenderDeps(deps) {
    return {
        app: deps.app,
        modoOffline: deps.modoOffline,
        NEON_OK: deps.NEON_OK,
        _sql: deps._sql,
        esAdmin: deps.esAdmin,
        esTecnicoOSupervisor: deps.esTecnicoOSupervisor,
        esAndroidWebViewMapa: deps.esAndroidWebViewMapa,
        etiquetaNisDetalleModalPedido: deps.etiquetaNisDetalleModalPedido,
        esCooperativaElectricaRubro: deps.esCooperativaElectricaRubro,
        esMunicipioRubro: deps.esMunicipioRubro,
        esCooperativaAguaRubro: deps.esCooperativaAguaRubro,
        construirHtmlBloqueOpinionClienteDetalle: deps.construirHtmlBloqueOpinionClienteDetalle,
        pedidoSugiereDerivacionAguaOMunicipioEnElectrica: deps.pedidoSugiereDerivacionAguaOMunicipioEnElectrica,
        gnTipoTrabajoPedidoDerivacion: deps.gnTipoTrabajoPedidoDerivacion,
        normalizarWhatsappInternacionalWaMeUrl: deps.normalizarWhatsappInternacionalWaMeUrl,
        pedidoEsDerivadoFuera: deps.pedidoEsDerivadoFuera,
        normalizarRolStr: deps.normalizarRolStr,
        textoResumenChecklistSeguridad: deps.textoResumenChecklistSeguridad,
        etiquetaFirmaPersona: deps.etiquetaFirmaPersona,
        coordsEfectivasPedidoMapa: deps.coordsEfectivasPedidoMapa,
        coordsSonPinValidasMapaWgs84: deps.coordsSonPinValidasMapaWgs84,
        domicilioParaGeocodePedido: deps.domicilioParaGeocodePedido,
        etiquetaModoUbicPedido: deps.etiquetaModoUbicPedido,
        proyectarCoordPedido: deps.proyectarCoordPedido,
        construirOpcionesDerivacionAdminHtml: deps.construirOpcionesDerivacionAdminHtml,
        puedeEnviarApiRestPedidos: deps.puedeEnviarApiRestPedidos,
        debeMostrarBotonDerivacion: deps.debeMostrarBotonDerivacion,
        htmlDerivacionTercerosPedidoDetalle: deps.htmlDerivacionTercerosPedidoDetalle,
        htmlSolicitudDerivacionCoopElectricaTecnico: deps.htmlSolicitudDerivacionCoopElectricaTecnico,
        etiquetaZonaPedido: deps.etiquetaZonaPedido,
        valorZonaPedidoUI: deps.valorZonaPedidoUI,
        sanitizarTextoDescripcionPedidoVista: deps.sanitizarTextoDescripcionPedidoVista,
        esTipoPedidoFactibilidad: deps.esTipoPedidoFactibilidad,
        incluirBloqueMaterialesEnDetallePedido: deps.incluirBloqueMaterialesEnDetallePedido,
        htmlOperativaTop3Section: deps.htmlOperativaTop3Section,
    };
}

function buildDetalleRenderParts(p, deps) {
    const d = bindDetalleRenderDeps(deps);
    const {
        app,
        modoOffline,
        NEON_OK,
        _sql,
        esAdmin,
        esTecnicoOSupervisor,
        esAndroidWebViewMapa,
        etiquetaNisDetalleModalPedido,
        esCooperativaElectricaRubro,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        construirHtmlBloqueOpinionClienteDetalle,
        pedidoSugiereDerivacionAguaOMunicipioEnElectrica,
        gnTipoTrabajoPedidoDerivacion,
        normalizarWhatsappInternacionalWaMeUrl,
        pedidoEsDerivadoFuera,
        normalizarRolStr,
        textoResumenChecklistSeguridad,
        etiquetaFirmaPersona,
        coordsEfectivasPedidoMapa,
        coordsSonPinValidasMapaWgs84,
        domicilioParaGeocodePedido,
        etiquetaModoUbicPedido,
        proyectarCoordPedido,
        construirOpcionesDerivacionAdminHtml,
        puedeEnviarApiRestPedidos,
        debeMostrarBotonDerivacion,
        htmlDerivacionTercerosPedidoDetalle,
        htmlSolicitudDerivacionCoopElectricaTecnico,
        etiquetaZonaPedido,
        valorZonaPedidoUI,
        sanitizarTextoDescripcionPedidoVista,
        esTipoPedidoFactibilidad,
        incluirBloqueMaterialesEnDetallePedido,
        htmlOperativaTop3Section,
    } = d;

    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const f = p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fc = p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    const fa = p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    
    const bg = {
        'Pendiente': '#fef9c3',
        'Asignado': '#fae8ff',
        'En ejecución': '#dbeafe',
        'Cerrado': '#dcfce7',
        'Derivado externo': '#e2e8f0',
        Desestimado: '#f1f5f9',
    };
    
    const co = {
        'Pendiente': '#854d0e',
        'Asignado': '#86198f',
        'En ejecución': '#1d4ed8',
        'Cerrado': '#166534',
        'Derivado externo': '#334155',
        Desestimado: '#475569',
    };
    
    const ed = esAdmin() || String(p.ui) === String(app.u?.id)
        || (esTecnicoOSupervisor() && p.tai != null && String(p.tai) === String(app.u?.id));
    /** En WebView Android el usuario suele buscar la acción como «Ejecutar»; en web se mantiene el texto largo. */
    const lblPonerEnEjecucion =
        typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa() ? 'Ejecutar' : 'Poner en ejecución';
    const findUser = id => {
        if (!id) return null;
        const u = app.usuariosCache?.find(u => String(u.id) === String(id));
        return u ? u.nombre : null;
    };
    const _auditLineas = [
        p.uc  ? '<div class="dr"><span class="dl">Creado por</span><span class="dv">'  + (findUser(p.uc)  || 'id:'+p.uc)  + '</span></div>' : '',
        p.ui2 ? '<div class="dr"><span class="dl">Iniciado por</span><span class="dv">' + (findUser(p.ui2) || 'id:'+p.ui2) + '</span></div>' : '',
        p.uav ? '<div class="dr"><span class="dl">Últ avance</span><span class="dv">'   + (findUser(p.uav) || 'id:'+p.uav) + '</span></div>' : '',
        p.uci ? '<div class="dr"><span class="dl">Cerrado por</span><span class="dv">'  + (findUser(p.uci) || 'id:'+p.uci) + '</span></div>' : '',
    ].filter(Boolean).join('');
    const escDet = t => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nombreClienteDet = String((p.cnom || p.cl || '')).trim();
    const filasDatosCliente = [];
    const nisVal = String(p.nis || '').trim();
    const medVal = String(p.med || '').trim();
    if (nisVal) {
        filasDatosCliente.push(
            `<div class="dr"><span class="dl">${etiquetaNisDetalleModalPedido()}</span><span class="dv" style="font-weight:700">${escDet(nisVal)}</span></div>`
        );
    }
    if (medVal) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Medidor</span><span class="dv" style="font-weight:700">${escDet(medVal)}</span></div>`);
    }
    if (nombreClienteDet) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Nombre y apellido</span><span class="dv">${escDet(nombreClienteDet)}</span></div>`);
    }
    if (String(p.ccal || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Calle</span><span class="dv">${escDet(p.ccal)}</span></div>`);
    }
    if (String(p.cnum || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Número</span><span class="dv">${escDet(p.cnum)}</span></div>`);
    }
    if (String(p.cloc || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Localidad</span><span class="dv">${escDet(p.cloc)}</span></div>`);
    }
    const stcD = String(p.stc || '').trim();
    const sfsD = String(p.sfs || '').trim();
    if (stcD || sfsD) {
        const headSum = esCooperativaElectricaRubro() ? 'Suministro eléctrico' : 'Datos de suministro (catálogo)';
        filasDatosCliente.push(`<div class="dr" style="grid-column:1/-1;margin:.35rem 0 0"><span class="dl" style="font-weight:700;color:#b45309">${escDet(headSum)}</span></div>`);
        if (stcD) {
            filasDatosCliente.push(`<div class="dr"><span class="dl">Tipo de conexión</span><span class="dv" style="font-weight:700">${escDet(stcD)}</span></div>`);
        }
        if (sfsD) {
            filasDatosCliente.push(`<div class="dr"><span class="dl">Fases</span><span class="dv" style="font-weight:700">${escDet(sfsD)}</span></div>`);
        }
    }
    const refDir = String(p.cdir || '').trim();
    const hayEstructurados = filasDatosCliente.length > 0;
    if (refDir) {
        const labRef = hayEstructurados ? 'Referencia (mapa / notas)' : 'Dirección / datos declarados';
        filasDatosCliente.push(`<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">${labRef}</span><div class="trb">${escDet(refDir)}</div></div>`);
    }
    const htmlDatosCliente = filasDatosCliente.length
        ? `<div class="dr" style="grid-column:1/-1;margin:.15rem 0 .35rem"><span class="dl" style="font-weight:700;color:var(--bd)">Datos cargados por el cliente</span></div>${filasDatosCliente.join('')}`
        : '';
    const htmlOpinionCliente = construirHtmlBloqueOpinionClienteDetalle(p, escDet);
    /** Opción A (spec): aviso + wa.me si el tipo es solo agua/municipio y el tenant es eléctrico. */
    let htmlDerivacionCoopElectrica = '';
    if (
        esCooperativaElectricaRubro() &&
        (esAdmin() || esTecnicoOSupervisor()) &&
        pedidoSugiereDerivacionAguaOMunicipioEnElectrica(gnTipoTrabajoPedidoDerivacion(p))
    ) {
        const dr = (window.EMPRESA_CFG || {}).derivacion_reclamos;
        const agua = dr?.cooperativa_agua;
        const energia = dr?.empresa_energia;
        const waAgua = agua?.whatsapp ? normalizarWhatsappInternacionalWaMeUrl(agua.whatsapp) : '';
        const waEn = energia?.whatsapp ? normalizarWhatsappInternacionalWaMeUrl(energia.whatsapp) : '';
        const hrefAgua = waAgua ? String(waAgua).replace(/"/g, '&quot;') : '';
        const hrefEn = waEn ? String(waEn).replace(/"/g, '&quot;') : '';
        const labAgua = escDet(agua?.nombre || 'Cooperativa de agua');
        const labEn = escDet(energia?.nombre || 'Empresa de energía');
        const bits = [
            `<p style="font-size:.82rem;margin:0 0 .55rem;line-height:1.45">El tipo <strong>${escDet(
                gnTipoTrabajoPedidoDerivacion(p)
            )}</strong> suele corresponder a <strong>agua potable</strong> u <strong>servicios municipales</strong>. Esta entidad atiende electricidad; podés orientar al vecino:</p>`,
        ];
        if (waAgua) {
            bits.push(
                `<a class="ba2" style="display:inline-block;margin:.2rem .45rem .2rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${hrefAgua}"><i class="fab fa-whatsapp"></i> ${labAgua}</a>`
            );
        }
        if (waEn) {
            bits.push(
                `<a class="ba2" style="display:inline-block;margin:.2rem .45rem .2rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${hrefEn}"><i class="fab fa-whatsapp"></i> ${labEn}</a>`
            );
        }
        if (!waAgua && !waEn) {
            bits.push(
                `<p style="font-size:.78rem;color:var(--tm);margin:.15rem 0 0">No hay contactos de derivación configurados. Cargalos en <strong>Admin → Empresa</strong> en la sección de <strong>derivación por tipo de reclamo</strong> (campos internacionales con +).</p>`
            );
        }
        htmlDerivacionCoopElectrica = `<div class="ds admin-derivacion-pedido-hint">${bits.join('')}</div>`;
    }
    const htmlLineaTiempoPedido = [
        `<div class="dr"><span class="dl">Alta del pedido</span><span class="dv">${f}</span></div>`,
        p.fasi && p.tai
            ? `<div class="dr"><span class="dl">Asignación a técnico</span><span class="dv">${new Date(p.fasi).toLocaleString('es-AR', {
                  ...tz,
                  hour12: false,
              })}</span></div>`
            : '',
        p.ui2 && (p.es === 'En ejecución' || p.es === 'Cerrado')
            ? `<div class="dr"><span class="dl">En ejecución</span><span class="dv">Equipo en sitio (registrado en el sistema)</span></div>`
            : '',
        p.es === 'Cerrado' && fc ? `<div class="dr"><span class="dl">Cierre</span><span class="dv">${fc}</span></div>` : '',
        pedidoEsDerivadoFuera(p) && p.fder
            ? `<div class="dr"><span class="dl">Derivación a tercero</span><span class="dv">${new Date(p.fder).toLocaleString('es-AR', {
                  ...tz,
                  hour12: false,
              })}</span></div>`
            : '',
    ]
        .filter(Boolean)
        .join('');
    const htmlBloqueCambiosAuditoria =
        htmlLineaTiempoPedido || _auditLineas
            ? `<details class="gn-dm-section-collapsible"><summary class="gn-dm-section-collapsible-sum">🕐 Últimos cambios y auditoría</summary><div class="ds">${
                  htmlLineaTiempoPedido
                      ? `<div style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Línea de tiempo</div>${htmlLineaTiempoPedido}`
                      : ''
              }${
                  htmlLineaTiempoPedido && _auditLineas
                      ? '<div style="margin:.55rem 0 .35rem;padding-top:.45rem;border-top:1px solid var(--bo)"></div>'
                      : ''
              }${
                  _auditLineas
                      ? `<div style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Usuarios (auditoría)</div>${_auditLineas}`
                      : ''
              }</div></details>`
            : '';
    const uAsig = (app.usuariosCache || []).find(u => String(u.id) === String(p.tai));
    const rolAsig = uAsig ? normalizarRolStr(uAsig.rol) : '';
    const nAsig = (p.tai != null)
        ? `${findUser(p.tai) || ('id ' + p.tai)}${rolAsig ? ' · ' + rolAsig : ''}`
        : 'Sin asignar';
    const fasiStr = p.fasi ? new Date(p.fasi).toLocaleString('es-AR', {...tz, hour12:false}) : '';
    const labFirmaDet = etiquetaFirmaPersona();
    let chkResumen = '';
    try {
        const o = p.chkl ? JSON.parse(p.chkl) : null;
        if (o && typeof o === 'object') {
            chkResumen = `<div class="dr"><span class="dl">Checklist seguridad</span><span class="dv">${escDet(textoResumenChecklistSeguridad(o))}</span></div>`;
        }
    } catch (_) {}
    
    const fotosCount = Array.isArray(p.fotos) ? p.fotos.filter(Boolean).length : 0;

    let fotosHtml = '';
    if (p.fotos && p.fotos.length > 0) {
        fotosHtml = '<div class="fotos-container">';
        const imgLazy = gnDetalleImgAttrs();
        p.fotos.forEach((foto, idx) => {
            if (foto) {
                const ctxStr = JSON.stringify({ tipo: 'pedido_fotos', id: p.id, idx }).replace(/"/g, '&quot;');
                fotosHtml += `<img src="${foto}" class="foto-miniatura"${imgLazy} onclick="verFotoAmpliada(this.src, JSON.parse(this.dataset.ctx))" data-ctx="${ctxStr}">`;
            }
        });
        fotosHtml += '</div>';
    }

    const shellAndroid =
        typeof document !== 'undefined' && document.documentElement.classList.contains('gn-android-shell');
    const fotosSectionHtml =
        fotosCount > 0 && shellAndroid
            ? `<details class="gn-dm-section-collapsible gn-dm-fotos-lazy"><summary class="gn-dm-section-collapsible-sum">📸 Fotos del trabajo (${fotosCount})</summary><div class="ds gn-dm-fotos-lazy-host"><p style="font-size:.8rem;color:var(--tl);margin:0">Tocá para ver las fotos</p></div></details>`
            : fotosHtml
              ? `<details class="gn-dm-section-collapsible"><summary class="gn-dm-section-collapsible-sum">📸 Fotos del trabajo (${fotosCount})</summary><div class="ds">${fotosHtml}</div></details>`
              : '';
    
    
    const { la: laM, ln: lnM } = coordsEfectivasPedidoMapa(p);
    const pinMapaOk = coordsSonPinValidasMapaWgs84(laM, lnM);
    const hayDomicilioGeo = !!domicilioParaGeocodePedido(p);
    const bannerSinPinAdmin =
        esAdmin() && hayDomicilioGeo && !pinMapaOk
            ? '<p class="gn-pedido-sin-pin-banner" role="status">Sin ubicación válida en el mapa (WGS84). Revisá domicilio, usá <strong>Re-geocodificar</strong> o coordenadas manuales en admin. Esto no invalida por sí solo el texto del reclamo.</p>'
            : '';
    const usadaInferida = (p.la == null || p.ln == null) && laM != null && lnM != null;
    const latFormateada = laM != null ? laM.toFixed(6).replace('.', ',') : '';
    const lngFormateada = lnM != null ? lnM.toFixed(6).replace('.', ',') : '';
    const wgs84UnaLinea = laM != null && lnM != null ? `${latFormateada}, ${lngFormateada}` : '--';
    const gaudit = p.gaudit && typeof p.gaudit === 'object' ? p.gaudit : null;
    const txtModoUbic = gaudit ? etiquetaModoUbicPedido(gaudit) : '';
    const htmlBadgeUbicModo =
        esAdmin() && txtModoUbic
            ? `<p class="gn-ubic-modo-badge" style="font-size:.76rem;color:#1e293b;margin:.2rem 0 .55rem;padding:.4rem .55rem;background:#e0f2fe;border-left:3px solid #0284c7;border-radius:4px;line-height:1.45">${escDet(txtModoUbic)}</p>`
            : '';
    const wgeoDet = p.wgeo && typeof p.wgeo === 'object' ? p.wgeo : null;
    const htmlWgeoWa =
        esAdmin() && wgeoDet && String(p.orc || '').trim().toLowerCase() === 'whatsapp'
            ? `<details class="gn-wgeo-wa-details" style="margin:.45rem 0 .35rem;font-size:.74rem;line-height:1.45"><summary style="cursor:pointer;font-weight:600;color:#0e7490">Geocodificación WhatsApp (servidor)</summary>
            <p style="margin:.35rem 0 .25rem;color:#334155">Fuente final: <strong>${escDet(String(wgeoDet.fuente_final != null ? wgeoDet.fuente_final : wgeoDet.fuente || '—'))}</strong>${wgeoDet.pipeline ? ` · pipeline: ${escDet(String(wgeoDet.pipeline))}` : ''}</p>
            <div style="padding:.45rem .5rem;background:#f8fafc;border-radius:.35rem;border:1px solid #e2e8f0;max-height:240px;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:.72rem">${escDet(
                (Array.isArray(wgeoDet.log) ? wgeoDet.log : [])
                    .slice(0, 120)
                    .join('\n')
            )}</div></details>`
            : '';
    const pcDet = proyectarCoordPedido(laM, lnM);
    const cfgFam = ((window.EMPRESA_CFG || {}).coord_proy_familia || 'none').trim();
    let filasProyectadas = '';
    if (pcDet) {
        const qx = String(pcDet.vx).replace(/'/g, "\\'");
        const qy = String(pcDet.vy).replace(/'/g, "\\'");
        const titTip = String(pcDet.titulo || '').replace(/"/g, '&quot;');
        filasProyectadas = `
            <div class="coord-proy-meta"><span class="coord-faja" title="${titTip}">F${pcDet.z}</span><span class="coord-sys">${pcDet.vx} · ${pcDet.vy} m</span></div>
            <div class="dr coord-proy-row"><span class="dl">${pcDet.lx}</span><span class="dv">${pcDet.vx} <span class="dv-copy" onclick="copiarTexto('${qx}')"><i class="fas fa-copy"></i> Copiar</span></span></div>
            <div class="dr coord-proy-row"><span class="dl">${pcDet.ly}</span><span class="dv">${pcDet.vy} <span class="dv-copy" onclick="copiarTexto('${qy}')"><i class="fas fa-copy"></i> Copiar</span></span></div>`;
    } else if (cfgFam === 'none' && p.x_inchauspe && p.y_inchauspe) {
        const xi = String(p.x_inchauspe).replace('.', ',');
        const yi = String(p.y_inchauspe).replace('.', ',');
        filasProyectadas = `
            <div class="dr"><span class="dl">Inchauspe X (histórico al crear)</span><span class="dv">${xi} <span class="dv-copy" onclick="copiarTexto('${xi.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Copiar</span></span></div>
            <div class="dr"><span class="dl">Inchauspe Y (histórico al crear)</span><span class="dv">${yi} <span class="dv-copy" onclick="copiarTexto('${yi.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Copiar</span></span></div>`;
    }

    let htmlDerivacionAdminExterna = '';
    if (esAdmin() && pedidoEsDerivadoFuera(p)) {
        const fdx = p.fder ? new Date(p.fder).toLocaleString('es-AR', { ...tz, hour12: false }) : '—';
        const who = findUser(p.uider) || (p.uider != null ? 'id:' + p.uider : '—');
        htmlDerivacionAdminExterna = `<div class="ds" style="border-left:4px solid #64748b">
            <h4>➡️ Derivado a tercero</h4>
            <p style="font-size:.78rem;margin:0 0 .5rem;line-height:1.4">Este reclamo ya no está en la operativa habitual del tenant. Para verlo en el panel de pedidos, activá <strong>Derivados fuera</strong> en la barra del listado.</p>
            <div class="dr"><span class="dl">Fecha</span><span class="dv">${escDet(fdx)}</span></div>
            <div class="dr"><span class="dl">Destino (clave)</span><span class="dv">${escDet(p.dda || '—')}</span></div>
            <div class="dr"><span class="dl">Contacto</span><span class="dv">${escDet(p.ddn || '—')}</span></div>
            <div class="dr"><span class="dl">Registró</span><span class="dv">${escDet(who)}</span></div>
            ${p.dnota ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Motivo</span><div class="trb">${escDet(p.dnota)}</div></div>` : ''}
            ${p.dsnap ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Mensaje (auditoría)</span><div class="trb" style="white-space:pre-wrap;font-size:.78rem">${escDet(p.dsnap)}</div></div>` : ''}
        </div>`;
    } else if (
        esAdmin() &&
        !modoOffline &&
        NEON_OK &&
        _sql &&
        (p.es === 'Pendiente' || p.es === 'Asignado' || p.es === 'En ejecución') &&
        !pedidoEsDerivadoFuera(p) &&
        debeMostrarBotonDerivacion(p)
    ) {
        const esPendienteDerivAdmin = p.es === 'Pendiente';
        const opts = construirOpcionesDerivacionAdminHtml(escDet);
        const pidEsc = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        let motivoAdminTa = p.sdm ? escDet(p.sdm) : '';
        try {
            const bk = 'gn-admin-deriv-motivo-' + p.id;
            const sv = sessionStorage.getItem(bk);
            if (sv != null && String(sv).length) motivoAdminTa = escDet(sv);
        } catch (_) {}
        const sdmMot = String(p.sdm || '').trim();
        const bloqueMotivoTecnicoDer = sdmMot
            ? `<div style="font-size:.8rem;margin:0 0 .45rem;padding:.5rem;background:rgba(14,165,233,.08);border:1px solid var(--bo);border-radius:.45rem;white-space:pre-wrap;line-height:1.45"><strong>Motivo del técnico</strong> (referencia; editable debajo)<br>${escDet(sdmMot)}</div>`
            : '';
        let pendienteSolicitudHtml = '';
        if (p.sdpen) {
            const whoTec = findUser(p.sduid) || (p.sduid != null ? 'id:' + p.sduid : '—');
            const fxs = p.sdf
                ? new Date(p.sdf).toLocaleString('es-AR', { ...tz, hour12: false })
                : '—';
            pendienteSolicitudHtml = `<div class="ds" id="gn-focus-derivacion-pedido" style="border-left:4px solid #f97316;margin-bottom:.65rem">
            <h4>⚠ Solicitud de derivación pendiente</h4>
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .5rem;line-height:1.45">El técnico pidió derivar este reclamo a un tercero. Revisá el motivo, elegí destino y confirmá; o rechazá si no corresponde.</p>
            <div class="dr"><span class="dl">Técnico</span><span class="dv">${escDet(whoTec)}</span></div>
            <div class="dr"><span class="dl">Fecha pedido</span><span class="dv">${escDet(fxs)}</span></div>
            ${p.sdm ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Motivo</span><div class="trb">${escDet(p.sdm)}</div></div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.55rem">
            <button type="button" class="ba2" style="background:#64748b;color:#fff;border-color:#64748b" onclick="rechazarSolicitudDerivacionAdmin('${pidEsc}')"><i class="fas fa-times"></i> Rechazar solicitud</button>
            </div>
        </div>`;
        }
        const avisoApiDeriv =
            !puedeEnviarApiRestPedidos()
                ? `<p style="font-size:.74rem;color:#b45309;margin:0 0 .55rem;padding:.45rem .55rem;background:#fffbeb;border:1px solid #fcd34d;border-radius:.4rem;line-height:1.45"><strong>Sin API REST o sesión JWT</strong> (revisá <code style="font-size:.68rem">config.json</code> → <code style="font-size:.68rem">api.baseUrl</code> e iniciá sesión). Podés usar los enlaces <strong>Contactar…</strong> de arriba por WhatsApp; la confirmación por <strong>servidor</strong> requiere API.</p>`
                : '';
        htmlDerivacionAdminExterna = `${pendienteSolicitudHtml}<div class="ds" ${p.sdpen ? '' : 'id="gn-focus-derivacion-pedido"'} style="border-left:4px solid #0ea5e9">
            <h4>📲 Derivación operativa (admin)</h4>
            ${avisoApiDeriv}
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .55rem;line-height:1.4">Registrá la derivación al contacto configurado en <strong>Admin → Empresa</strong>. El <strong>mensaje final</strong> queda en auditoría y se envía al tercero por <strong>WhatsApp desde el servidor</strong> (Meta Cloud API); no se abre pestaña del navegador. Incluye enlace a Google Maps cuando hay coordenadas del pedido.</p>
            <div style="margin-bottom:.5rem"><label for="admin-derivar-destino" style="font-size:.78rem;font-weight:600">Destino</label>
            <select id="admin-derivar-destino" style="width:100%;margin-top:.25rem;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo)">${opts}</select></div>
            <div style="margin-bottom:.55rem"><label for="admin-derivar-motivo" style="font-size:.78rem;font-weight:600">Observaciones para el tercero <span style="font-weight:500;color:var(--tl)">(obligatorias si no hubo texto del técnico)</span></label>
            ${bloqueMotivoTecnicoDer}
            <textarea id="admin-derivar-motivo" rows="4" maxlength="2000" style="width:100%;margin-top:.25rem;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);resize:vertical;white-space:pre-wrap" placeholder="Si el técnico cargó una solicitud, el texto aparece acá para que lo revises o completes.">${motivoAdminTa}</textarea>
            <button type="button" class="btn-sm" id="ia-generar-derivacion" style="margin-top:.35rem;background:linear-gradient(135deg,#4285f4,#34a853);color:#fff;border:none;border-radius:.35rem;padding:.3rem .65rem;font-size:.76rem;cursor:pointer" onclick="window._gnGenerarMensajeDerivacionIA&&window._gnGenerarMensajeDerivacionIA('${pidEsc}')" title="Generar mensaje con IA">✨ Generar mensaje</button></div>
            <button type="button" class="ba2" style="background:#128C7E;color:#fff;border-color:#128C7E" onclick="abrirModalRevisionDerivacionAdmin('${pidEsc}')"><i class="fab fa-whatsapp"></i> Revisar y enviar (servidor)</button>
        </div>`;
    }
    
    const infoRowsHtml = `
            <div class="dr"><span class="dl">N° Pedido</span><span class="dv" style="font-weight:700;color:#1e3a8a">#${p.np}</span></div>
            <div class="dr"><span class="dl">Fecha Creación</span><span class="dv">${f}</span></div>
            ${p.es === 'Cerrado' ? 
                `<div class="dr"><span class="dl">Fecha Cierre</span><span class="dv">${fc}</span></div>` : 
                p.es === 'Derivado externo' && p.fder
                ? `<div class="dr"><span class="dl">Fecha derivación</span><span class="dv">${new Date(p.fder).toLocaleString('es-AR', {...tz, hour12:false})}</span></div>`
                : p.es === 'En ejecución' && fa ? 
                `<div class="dr"><span class="dl">Último Avance</span><span class="dv">${fa}</span></div>` : ''}
            <div class="dr" data-gn-dm-field="estado"><span class="dl">Estado</span><span class="dv"><span style="background:${bg[p.es]||'#e5e7eb'};color:${co[p.es]||'#374151'};padding:2px 10px;border-radius:12px;font-size:.82rem;font-weight:600">${p.es}</span></span></div>
            <div class="dr" data-gn-dm-field="prioridad"><span class="dl">Prioridad</span><span class="dv">${p.pr}</span></div>
            <div class="dr"><span class="dl">Tipo</span><span class="dv">${p.tt||'--'}</span></div>
            <div class="dr" data-gn-dm-field="tecnico"><span class="dl">Técnico asignado</span><span class="dv">${nAsig}${fasiStr ? ' · ' + fasiStr : ''}</span></div>
            <div class="dr" data-gn-dm-field="avance"><span class="dl">Avance</span><span class="dv">${p.av}% <div style="height:4px;background:#e2e8f0;border-radius:2px;width:100px;display:inline-block;vertical-align:middle;margin-left:6px;overflow:hidden"><div style="height:100%;width:${p.av}%;background:linear-gradient(90deg,#1e3a8a,#3b82f6)"></div></div></span></div>
            ${p.es === 'Desestimado' ? `<div class="dr" style="flex-direction:column;gap:.3rem;margin-top:.35rem;padding:.5rem .55rem;background:#fef2f2;border:1px solid #fecaca;border-radius:.45rem"><span class="dl">Motivo de desestimación</span><div class="trb" style="color:#7f1d1d;font-size:.88rem;line-height:1.45">${p.mdes ? escDet(p.mdes) : '<span style="color:var(--tl)">Sin registro.</span>'}</div></div>` : ''}`;

    const accionesBarHtml = `
            ${ed && p.es === 'En ejecución' ? `<div class="gn-dm-estado-ejecucion" role="status"><i class="fas fa-play-circle"></i> Pedido en ejecución — usá Cargar avance o Cerrar cuando corresponda.</div>` : ''}
            ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && p.es !== 'Desestimado' && (p.tai == null) ? `<button type="button" class="ba2" style="background:#059669;color:#fff;border-color:#059669" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-user-hard-hat"></i> Asignar técnico</button>` : ''}
            ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && p.es !== 'Desestimado' && (p.tai != null) ? `<button type="button" class="ba2" style="background:#ea580c;color:#fff;border-color:#ea580c" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-exchange-alt"></i> Reasignar técnico</button><button type="button" class="ba2" style="background:#64748b;color:#fff;border-color:#64748b" onclick="ejecutarDesasignarPedidoPorId('${p.id}', {confirmar:true})"><i class="fas fa-user-slash"></i> Desasignar</button>` : ''}
            ${ed && (p.es === 'Pendiente' || p.es === 'Asignado') && p.es !== 'Derivado externo' ? `<button type="button" class="ba2 p2" title="Marca el pedido como En ejecución. Con teléfono válido y WhatsApp del tenant, el servidor puede avisar al cliente." onclick="_a('i','${p.id}')"><i class="fas fa-play"></i> ${lblPonerEnEjecucion}</button><button type="button" class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button>` : ''}
            ${ed && p.es === 'En ejecución' ? `<button type="button" class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button><button type="button" class="ba2 p2" onclick="_a('av','${p.id}')"><i class="fas fa-percent"></i> Cargar Avance (${p.av}%)</button>` : ''}
            <button type="button" class="ba2 imprimir" onclick="imprimirPedidoPorId('${p.id}')"><i class="fas fa-print"></i> Imprimir</button>
            <button type="button" class="ba2" onclick="_xl('${p.id}')"><i class="fas fa-file-excel"></i> Exportar</button>`;

    const sectionInfo = `<h4>📋 Información General</h4>${infoRowsHtml}`;

    const sectionTrabajo = `<h4>🏢 Datos del Trabajo</h4>
            <div class="dr"><span class="dl">${etiquetaZonaPedido()}</span><span class="dv">${valorZonaPedidoUI(p) || (esMunicipioRubro() ? 'Sin barrio indicado' : esCooperativaAguaRubro() ? 'Sin ramal indicado' : '—')}</span></div>
            ${esCooperativaElectricaRubro() && String(p.trf || '').trim() ? `<div class="dr"><span class="dl">Trafo</span><span class="dv">${escDet(p.trf)}</span></div>` : ''}
            ${htmlDatosCliente}
            ${p.tel ? `<div class="dr"><span class="dl">Tel. contacto (WA)</span><span class="dv">${String(p.tel).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>` : ''}
            <div class="dr"><span class="dl">Descripción</span><span class="dv">${escDet(sanitizarTextoDescripcionPedidoVista(p.de))}</span></div>`;

    const sectionDerivacion = `${htmlDerivacionTercerosPedidoDetalle()}${htmlSolicitudDerivacionCoopElectricaTecnico(p)}${htmlDerivacionCoopElectrica}${htmlDerivacionAdminExterna}`;

    const sectionCierre =
        p.es === 'Cerrado'
            ? `<div class="ds">
            <h4>✅ Cierre del Pedido</h4>
            ${fc ? `<div class="dr"><span class="dl">Fecha cierre</span><span class="dv">${fc}</span></div>` : ''}
            ${p.tc ? `<div class="dr"><span class="dl">Técnico</span><span class="dv">${p.tc}</span></div>` : ''}
            ${p.tr ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Trabajo</span><div class="trb">${p.tr}</div></div>` : ''}
            ${p.foto_cierre ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">📸 Foto del cierre</div><img src="${p.foto_cierre}" class="foto-miniatura"${gnDetalleImgAttrs()} style="width:100%;max-height:200px;object-fit:contain;border-radius:.5rem;cursor:pointer;border:1px solid #e2e8f0" onclick="verFotoAmpliada(this.src, {tipo:'pedido_cierre',id:'${p.id}'})"></div>` : ''}
            ${chkResumen}
            ${p.firma ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">✍️ Firma del ${labFirmaDet}</div><img src="${p.firma}" class="foto-miniatura"${gnDetalleImgAttrs()} style="width:100%;max-height:180px;object-fit:contain;border-radius:.5rem;border:1px solid #e2e8f0" alt="Firma"></div>` : ''}
        </div>`
            : '';

    const showMateriales =
        !esTipoPedidoFactibilidad(p.tt) && incluirBloqueMaterialesEnDetallePedido(p);

    const sectionUbicacion = `<h4>📍 Ubicación</h4>
            ${htmlBadgeUbicModo}
            ${htmlWgeoWa}
            ${bannerSinPinAdmin}
            <div class="dr"><span class="dl">Provincia</span><span class="dv">${escDet(String(p.cpcia || '').trim() || '—')}</span></div>
            <div class="dr"><span class="dl">Código postal</span><span class="dv">${escDet(String(p.ccp || '').trim() || '—')}</span></div>
            ${usadaInferida ? '<p style="font-size:.76rem;color:#b45309;margin:0 0 .35rem;line-height:1.35">Ubicación aproximada por calle y número (el cliente no compartió GPS).</p>' : ''}
            <div class="dr"><span class="dl">WGS84</span><span class="dv">${wgs84UnaLinea}${laM != null && lnM != null ? ` <span class="dv-copy" onclick="copiarTexto('${latFormateada}')"><i class="fas fa-copy"></i> lat</span> <span class="dv-copy" onclick="copiarTexto('${lngFormateada}')"><i class="fas fa-copy"></i> lng</span>` : ''}</span></div>
            ${filasProyectadas}
            <button class="ba2" style="margin-top:.5rem" onclick="_zm('${p.id}')"><i class="fas fa-search-location"></i> Ver en mapa (zoom máximo)</button>
            ${esAdmin() ? `<button class="ba2" id="btn-regeocodificar" style="margin-top:.5rem;background:#0891b2;color:#fff;border-color:#0891b2" onclick="regeocodificarPedido('${p.id}')"><i class="fas fa-map-marker-alt"></i> Re-geocodificar</button>` : ''}`;

    let sectionTop3 = htmlOperativaTop3Section();
    if (shellAndroid) {
        sectionTop3 = sectionTop3.replace(/\s+open(?=[\s>])/i, '');
    }

    const sections = {
        info: sectionInfo,
        trabajo: sectionTrabajo,
        opinion: htmlOpinionCliente,
        derivacion: sectionDerivacion,
        cierre: sectionCierre,
        showMateriales,
        ubicacion: sectionUbicacion,
        top3: sectionTop3,
        auditoria: htmlBloqueCambiosAuditoria,
        fotos: fotosSectionHtml,
        acciones: accionesBarHtml,
    };

    const html = assembleDetalleHtmlFromSections(sections);

    return { html, infoRowsHtml, accionesBarHtml, htmlOpinionCliente, sections };
}

function assembleDetalleHtmlFromSections(sections) {
    const mat = sections.showMateriales
        ? `<div class="ds" id="materiales-detalle-wrap" data-pid="">
            <h4>🔧 Materiales</h4>
            <div id="materiales-detalle-body"><p style="font-size:.8rem;color:var(--tl)">Cargando…</p></div>
        </div>`
        : '';
    return `
        <div class="gn-dm-detail-scroll">
        <div class="ds gn-dm-block-info" data-gn-dm-block="info">${sections.info}</div>
        <div class="ds">${sections.trabajo}</div>
        <div id="dm-opinion-cliente-host">${sections.opinion}</div>
        ${sections.derivacion}
        ${sections.cierre}
        ${mat}
        <div class="ds">${sections.ubicacion}</div>
        ${sections.top3}
        ${sections.auditoria}
        ${sections.fotos}
        </div>
        <div class="gn-dm-actions-bar">
        <div class="da">${sections.acciones}</div>
        </div>
    `;
}

export function buildDetalleInfoBlockInner(p, deps) {
    return buildDetalleRenderParts(p, deps).infoRowsHtml;
}

export function buildDetalleAccionesBarHtml(p, deps) {
    return buildDetalleRenderParts(p, deps).accionesBarHtml;
}

export function buildDetallePedidoDmcHtml(p, deps) {
    return buildDetalleRenderParts(p, deps).html;
}

/** Secciones para hidratación del shell persistente (#dmc). */
export function buildDetalleSections(p, deps) {
    return buildDetalleRenderParts(p, deps).sections;
}
