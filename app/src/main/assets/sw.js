// Service worker de Pedidos MG: los mapas usan la caché HTTP normal del navegador.
const CACHE_SHELL = 'pmg-shell-v291';
const CACHE_API   = 'pmg-api-v1';
const SW_VERSION  = '1.9.5';

function shellAssetUrls() {
  const { origin, pathname } = self.location;
  const dir = pathname.replace(/[^/]*$/, '') || '/';
  const base = origin + dir;
  const j = (p) => base + p.replace(/^\//, '');
  return [
    j('index.html'),
    j('index.min.html'),
    j('styles.css'),
    j('admin-web-responsive.css'),
    j('gn-android-shell-perf.css'),
    j('gn-trust-ui.css'),
    j('status.html'),
    j('seguridad.html'),
    j('app.js'),
    j('modules/gn-sql-cache-client.js'),
    j('modules/password-facil-sugerido.js'),
    j('modules/recuperar-contrasena-mail.js'),
    j('modules/gn-window-dialogs-patch.js'),
    j('modules/gn-trust-ui-bootstrap.js'),
    j('modules/gn-login-alto-contraste.js'),
    j('modules/gn-login-android-submit-ui.js'),
    j('gn-login-screen.css'),
    j('gn-wizard-screen.css'),
    j('modules/gn-terminos-privacidad.js'),
    j('modules/gn-footer-version.js'),
    j('modules/gn-error-messages.js'),
    j('modules/gn-session-idle-warning.js'),
    j('modules/gn-skeleton-map-loader.js'),
    j('modules/gn-tooltips.js'),
    j('modules/gn-oleada2-bootstrap.js'),
    j('modules/gn-offline-banner-enhanced.js'),
    j('modules/gn-sw-update-prompt.js'),
    j('modules/gn-admin-operacion-audit-ui.js'),
    j('modules/gn-oleada3-bootstrap.js'),
    j('modules/gn-global-search-ui.js'),
    j('modules/gn-global-search-detalle-stack.js'),
    j('modules/gn-admin-2fa-login.js'),
    j('modules/gn-zona-servicio-ui.js'),
    j('modules/gn-oleada4-bootstrap.js'),
    j('modules/gn-admin-setup-checklist-ui.js'),
    j('modules/gn-export-audit-csv.js'),
    j('modules/gn-oleada5-bootstrap.js'),
    j('modules/gn-geo-calidad-admin-ui.js'),
    j('modules/gn-keyboard-shortcuts-help.js'),
    j('modules/gn-zona-servicio-pedido-guard.js'),
    j('modules/gn-oleada6-bootstrap.js'),
    j('modules/gn-evento-corte-masivo-ui.js'),
    j('modules/gn-evento-corte-masivo-launcher.js'),
    j('modules/gn-admin-sistema-salud-ui.js'),
    j('modules/gn-pedidos-sin-coords-modal.js'),
    j('modules/gn-notif-prefs-ui.js'),
    j('modules/gn-zona-servicio-mapa-preview.js'),
    j('modules/gn-app-version-gate.js'),
    j('modules/gn-session-post-login.js'),
    j('modules/gn-lazy-optional-ui-bootstrap.js'),
    j('modules/filtros-estado.js'),
    j('modules/admin-desestimar-reclamo.js'),
    j('modules/normalizar-telefono.js'),
    j('modules/graficos-colores.js'),
    j('modules/derivaciones-reclamos-admin.js'),
    j('modules/estadisticas-desestimados.js'),
    j('modules/estadisticas-chart-hbar-layout.js'),
    j('modules/estadisticas-chart-distribuidores-red.js'),
    j('modules/admin-estadisticas-stat-cards-ui.js'),
    j('modules/mapa-interaccion.js'),
    j('modules/etiqueta-identificador-pedido.js'),
    j('modules/est-csv-tipo-filtro.js'),
    j('modules/pedido-dm-pm-drag.js'),
    j('modules/pedido-detalle-html-helpers.js'),
    j('modules/utils.js'),
    j('modules/ui-utils.js'),
    j('modules/export-excel.js'),
    j('modules/gn-tenant-reload-veil.js'),
    j('modules/cfgi-wizard-tenant-selectors-sync.js'),
    j('modules/admin-wizard.js'),
    j('modules/gn-offline-shell-refresh.js'),
    j('modules/gn-android-shell-perf.js'),
    j('modules/gn-pedido-chat-interno-android.js'),
    j('modules/pedido-chat-interno-notif-ui.js'),
    j('modules/pedido-operativa-top3-ui.js'),
    j('modules/gn-dm-modal-perf-android.js'),
    j('modules/pedido-nuevo-reverse-geo.js'),
    j('modules/pedido-opinion-cliente-ui.js'),
    j('modules/pedido-opinion-descargo-save.js'),
    j('modules/pedido-opinion-descargo-ciclo.js'),
    j('modules/pedido-detalle-render.js'),
    j('modules/pedido-detalle-puede-ejecutar.js'),
    j('modules/pedido-panel-lista-tecnico.js'),
    j('modules/pedido-detalle-shell.js'),
    j('modules/pedido-detalle-infer-ubicacion-nominatim.js'),
    j('modules/pedido-detalle-hydrate.js'),
    j('modules/gn-usuario-nombres.js'),
    j('modules/gn-usuario-nombres-detalle-patch.js'),
    j('modules/pedido-detalle-incremental.js'),
    j('modules/pedido-fotos-campo-android.js'),
    j('modules/gn-android-cerrar-ui-para-mapa-zoom.js'),
    j('modules/gn-map-throttle-when-modal.js'),
    j('modules/gn-modal-z-index-stack.js'),
    j('modules/gn-overlay-stack-android.js'),
    j('modules/gn-login-ingresar-bridge.js'),
    j('modules/gn-post-login-lazy-bootstrap.js'),
    j('modules/gn-offline-status-bar.js'),
    j('modules/gn-clipboard-copy.js'),
    j('modules/gn-map-goto-preview-marker.js'),
    j('modules/gn-tenant-acceso-tecnico-unificado.js'),
    j('modules/setup-technician-api.js'),
    j('modules/gn-tenant-force-sync-android-boot.js'),
    j('modules/wizard-nuevo-tenant-tecnico.js'),
    j('modules/tenant-nuevo-admin-creds-ui.js'),
    j('modules/tenant-primer-ingreso-bootstrap.js'),
    j('modules/auth-login-neon-fallback.js'),
    j('modules/password-visibility-toggle.js'),
    j('modules/admin-tab-distribuidores-policy.js'),
    j('modules/nivel-tension-kv-format.js'),
    j('modules/ia-sugerir-reclamo.js'),
    j('modules/ia-analisis-reclamos.js'),
    j('modules/ia-kpi-sugeridos.js'),
    j('modules/ia-informe-unificado.js'),
    j('modules/android-image-share.js'),
    j('modules/cfgi-wizard-tenant-select.js'),
    j('modules/admin-socios.js'),
    j('modules/socios-catalogo-col-defs.js'),
    j('modules/socios-catalogo-export-wysiwyg.js'),
    j('modules/map-pedidos-markers.js'),
    j('modules/admin-socios-export-xlsx-completo.js'),
    j('modules/bot-menus.js'),
    j('modules/catalogoReclamoPorRubro.js'),
    j('modules/conversor-coordenadas.js'),
    j('modules/derivaciones-terceros.js'),
    j('modules/derivacion-revision-admin-modal.js'),
    j('modules/android-app-update-neon.js'),
    j('modules/pedido-form-labels-rubro.js'),
    j('modules/pedido-alta-derivacion-api.js'),
    j('modules/admin-distribuidores-formato.js'),
    j('modules/admin-saidi-distrib-excel.js'),
    j('modules/admin-red-electrica-infra.js'),
    j('modules/admin-red-electrica-import-flow.js'),
    j('modules/admin-red-electrica-export.js'),
    j('modules/admin-subestaciones-infra.js'),
    j('modules/admin-subestaciones-import-flow.js'),
    j('modules/admin-subestaciones-export.js'),
    j('modules/admin-subestaciones-tab-hook.js'),
    j('modules/admin-demo-tormenta.js'),
    j('modules/pedido-trafo-subestaciones-catalogo.js'),
    j('modules/admin-distribuidores-catalogo-import.js'),
    j('modules/admin-distribuidores-catalogo-ui.js'),
    j('modules/admin-socios-export-api-completo.js'),
    j('modules/admin-import-result-panel.js'),
    j('modules/admin-socios-import-sync.js'),
    j('modules/admin-socios-listado-api.js'),
    j('modules/admin-socios-tab-load.js'),
    j('modules/estadisticas-datos-red-saifi.js'),
    j('modules/estadisticas-saifi-saidi-charts.js'),
    j('modules/estadisticas-chart-plugins.js'),
    j('modules/informes-estadisticas-pdf-capture.js'),
    j('modules/informes-estadisticas-print.js'),
    j('modules/admin-empresa-whatsapp-derivaciones.js'),
    j('modules/whatsapp-human-chat-admin.js'),
    j('modules/gn-wa-geo-ops-panel.js'),
    j('modules/pedido-detalle-derivacion-html.js'),
    j('modules/app-admin-panel-deferred.js'),
    j('modules/gn-panel-docks.js'),
    j('modules/gn-pedido-match-identificador.js'),
    j('modules/socios-busqueda-apellido-padron.js'),
    j('modules/socios-busqueda-direccion-padron.js'),
    j('modules/admin-socios-busqueda-padron.js'),
    j('modules/busqueda-apellido.js'),
    j('modules/busqueda-direccion-historial.js'),
    j('modules/gn-socio-catalogo-match-sql.js'),
    j('modules/gn-app-global-bridge.js'),
    j('modules/pedido-formulario-global-hooks.js'),
    j('modules/pedido-oficina-guardar-ubicacion.js'),
    j('modules/padron-fetch-socio-completo.js'),
    j('modules/padron-campos-requeridos-pedido.js'),
    j('modules/padron-aplicar-resultado-ui.js'),
    j('modules/padron-rubro-helpers.js'),
    j('modules/pedido-nuevo-nominatim-padron-guard.js'),
    j('modules/pedido-nuevo-aplicar-padron.js'),
    j('modules/padron-distribuidor-resolver.js'),
    j('modules/padron-barrio-municipio.js'),
    j('modules/padron-fila-completar.js'),
    j('modules/padron-aplicar-a-pedido-nuevo.js'),
    j('modules/admin-socios-usar-en-pedido.js'),
    j('modules/admin-socios-busqueda-limpieza.js'),
    j('modules/pedido-nuevo-oficina.js'),
    j('modules/pedido-nuevo-desde-punto-coords.js'),
    j('modules/pedido-di2-distribuidores.js'),
    j('modules/pedido-trafo-socios-catalogo.js'),
    j('modules/pedido-nuevo-padron-modales.js'),
    j('modules/pedido-nuevo-padron-toast.js'),
    j('modules/padron-distribuidor-socio-di2.js'),
    j('modules/padron-socio-campos-resolver.js'),
    j('modules/pedido-nuevo-suministro-padron.js'),
    j('modules/pedido-nuevo-nis-busqueda.js'),
    j('modules/pedido-nuevo-padron-busqueda.js'),
    j('modules/gn-abrir-detalle-pedido.js'),
    j('modules/admin-socios-historial-pedidos.js'),
    j('modules/admin-historicos-filtros.js'),
    j('modules/pedido-volver-pendiente.js'),
    j('modules/pedido-ver-imagen.js'),
    j('modules/incidencias.js'),
    j('modules/incidencias-coop-electrica-reglas.js'),
    j('modules/incidencias-infra-electrica.js'),
    j('modules/pedido-manual-foto.js'),
    j('modules/kpi-pdf-charts.js'),
    j('modules/kpi-pdf-explicacion-ia.js'),
    j('modules/kpi-pdf-ia-render.js'),
    j('modules/kpi-informe-textos.js'),
    j('modules/ia-priorizacion-bp2.js'),
    j('modules/ia-duplicados-pedido.js'),
    j('modules/admin-clave-provisoria.js'),
    j('modules/auth-login-api-body.js'),
    j('modules/socios-catalogo-filtro-sesion.js'),
    j('modules/socios-catalogo-schema-cache.js'),
    j('modules/socios-catalogo-listado-fetch.js'),
    j('modules/socios-catalogo-export-vista.js'),
    j('modules/socios-catalogo-export-proyeccion.js'),
    j('modules/password-policy-gestornova.js'),
    j('modules/ia-derivacion-mensaje.js'),
    j('modules/panel-clima.js'),
    j('modules/ia-analisis-pedidos-bp2.js'),
    j('modules/gn-bp2-fullscreen.js'),
    j('modules/gn-bp2-panel-android.js'),
    j('modules/gn-bp2-android-float.js'),
    j('modules/gn-bp2-lista-densa.js'),
    j('modules/gn-dm-frente-paneles.js'),
    j('modules/suggest-change-creds.js'),
    j('modules/nuevo-pedido-desde-gps-mapa.js'),
    j('map.js'),
    j('map-view.js'),
    j('vendor/offline/entre-rios-ne-v1.js'),
    j('vendor/offline/er-offline-render-v1.js'),
    j('vendor/offline/er-osm-index-v1.js'),
    j('vendor/leaflet-1.9.4/leaflet.js'),
    j('vendor/leaflet-1.9.4/leaflet.css'),
    j('vendor/leaflet-1.9.4/images/marker-icon.png'),
    j('vendor/leaflet-1.9.4/images/marker-icon-2x.png'),
    j('vendor/leaflet-1.9.4/images/marker-shadow.png'),
    j('vendor/leaflet-1.9.4/images/layers.png'),
    j('vendor/leaflet-1.9.4/images/layers-2x.png'),
    j('offline.js'),
    j('sync-worker.js'),
    j('gestornova-logo.png')
  ];
}

async function precacheShellAssets() {
  const cache = await caches.open(CACHE_SHELL);
  await Promise.all(
    shellAssetUrls().map(async (url) => {
      try {
        if (await cache.match(url)) return;
        const resp = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (!resp.ok) return;
        const copy = resp.clone();
        await cache.put(url, copy);
      } catch (_) {}
    })
  );
}

async function cacheFirstShell(request) {
  const cache = await caches.open(CACHE_SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const copy = resp.clone();
      await cache.put(request, copy);
    }
    return resp;
  } catch (_) {
    return cached;
  }
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const copy = resp.clone();
      await cache.put(request, copy);
    }
    return resp;
  } catch (e) {
    let cached = await cache.match(request);
    if (!cached && request.url.endsWith('/')) {
      cached = await cache.match(request.url + 'index.html');
    }
    if (!cached) {
      const u = new URL(request.url);
      if (u.pathname.endsWith('/') && u.pathname.length > 1) {
        const noSlash = u.pathname.replace(/\/$/, '');
        cached = await cache.match(u.origin + noSlash + '/index.html');
      }
    }
    if (cached) return cached;
    throw e;
  }
}

// No se precargan regiones: las teselas se solicitan solo al navegar el mapa.
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(precacheShellAssets());
});

// ── ACTIVATE: limpiar versiones anteriores ────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([CACHE_SHELL, CACHE_API]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── HELPERS CACHÉ AGRESIVA API / SQL EN SERVICE WORKER ────────
function swFastHash(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function swClassifySqlTtl(rawSql) {
  const s = String(rawSql || '').replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'([^']|'')*'/g, "''").replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const verb = (s.split(' ')[0] || '').toUpperCase();
  if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE' || verb === 'ALTER' || verb === 'CREATE' || verb === 'TRUNCATE') {
    return { isWrite: true };
  }
  if (verb !== 'SELECT' && verb !== 'WITH') return null;
  if (verb === 'WITH' && /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i.test(s)) {
    return { isWrite: true };
  }
  if (/\b(NEXTVAL|SETVAL|RANDOM\s*\(|FOR\s+UPDATE|RETURNING|password_hash|reset_token)\b/i.test(s)) {
    return null;
  }
  if (/\b(information_schema|pg_catalog|localidades_argentinas|codigos_area_argentina|calles_normalizadas|calles_geometrias)\b/i.test(s)) {
    return { isWrite: false, freshMs: 15 * 60 * 1000, swrMs: 60 * 60 * 1000 };
  }
  if (/\b(clientes|configuracion|tipos_reclamo|distribuidores|subestaciones_catalogo|socios_catalogo|tenant_localidades)\b/i.test(s) && !/\bpedidos\b/i.test(s)) {
    return { isWrite: false, freshMs: 3 * 60 * 1000, swrMs: 15 * 60 * 1000 };
  }
  return { isWrite: false, freshMs: 6 * 1000, swrMs: 15 * 1000 };
}

function swClassifyGetApiTtl(pathname) {
  if (/\/api\/(webhooks|auth\/login|auth\/password-reset|debug)/i.test(pathname)) return null;
  if (/\/(export|xlsx|pdf|download)\b/i.test(pathname)) return null;
  if (/\/api\/(admin\/socios-catalogo|distribuidores|admin\/subestaciones-catalogo|admin\/red-electrica|calles-normalizadas|clientes\/mi-config|config\/ubicacion-central|setup\/technician\/tenants|tenant-operativa-settings|tenant\/businesses)/i.test(pathname)) {
    return { freshMs: 2 * 60 * 1000, swrMs: 15 * 60 * 1000 };
  }
  if (/\/api\/(pedidos|incidencias|notificaciones|estadisticas)/i.test(pathname)) {
    return { freshMs: 6 * 1000, swrMs: 15 * 1000 };
  }
  return null;
}

async function swPutStampedJsonResponse(cache, cacheKeyReq, resp) {
  try {
    const bodyBuf = await resp.clone().arrayBuffer();
    if (bodyBuf.byteLength > 2 * 1024 * 1024) return;
    const headers = new Headers(resp.headers);
    headers.set('X-SW-Cached-At', String(Date.now()));
    const stamped = new Response(bodyBuf, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
    await cache.put(cacheKeyReq, stamped);
  } catch (_) {}
}

function swCloneWithHeader(resp, statusLabel) {
  const headers = new Headers(resp.headers);
  headers.set('X-SW-Cache', statusLabel);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function swServeWithTtlAndSwr(cacheKeyUrl, fetchFactory, freshMs, swrMs) {
  const cache = await caches.open(CACHE_API);
  const cacheKeyReq = new Request(cacheKeyUrl, { method: 'GET' });
  const cached = await cache.match(cacheKeyReq);
  const now = Date.now();

  if (cached) {
    const cachedAt = Number(cached.headers.get('X-SW-Cached-At') || 0);
    const age = now - cachedAt;
    if (age >= 0 && age <= freshMs) {
      return swCloneWithHeader(cached.clone(), 'HIT-FRESH');
    }
    if (age >= 0 && age <= swrMs) {
      fetchFactory()
        .then(async (netResp) => {
          if (netResp && netResp.ok) {
            await swPutStampedJsonResponse(cache, cacheKeyReq, netResp);
          }
        })
        .catch(() => {});
      return swCloneWithHeader(cached.clone(), 'HIT-SWR');
    }
  }

  try {
    const netResp = await fetchFactory();
    if (netResp && netResp.ok) {
      await swPutStampedJsonResponse(cache, cacheKeyReq, netResp);
    }
    return netResp;
  } catch (err) {
    if (cached) {
      return swCloneWithHeader(cached.clone(), 'HIT-OFFLINE-FALLBACK');
    }
    throw err;
  }
}

async function swPurgeApiCache() {
  try {
    await caches.delete(CACHE_API);
  } catch (_) {}
}

self.addEventListener('message', event => {
  const data = event?.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'PMG_INVALIDATE_API_CACHE' || data.type === 'PMG_CLEAR_API_CACHE') {
    event.waitUntil(swPurgeApiCache());
  }
});

// ── FETCH: app shell (JS/CSS/img/HTML) + API/SQL cache + tiles OSM ──
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Interceptar llamadas a la API (/api/*) para reducir consultas repetidas hacia Render y Neon
  if (url.pathname.startsWith('/api/')) {
    const authScope = swFastHash(
      (req.headers.get('Authorization') || '') + '|' + (req.headers.get('X-GestorNova-Technician-Key') || '')
    );

    if (req.method === 'POST' && url.pathname.endsWith('/api/sql/query')) {
      event.respondWith(
        (async () => {
          let bodyObj = null;
          try {
            bodyObj = await req.clone().json();
          } catch (_) {}
          const rawQuery = bodyObj && typeof bodyObj.query === 'string' ? bodyObj.query : '';
          if (!rawQuery || bodyObj?.noCache) {
            return fetch(req);
          }
          const rule = swClassifySqlTtl(rawQuery);
          if (!rule) {
            return fetch(req);
          }
          if (rule.isWrite) {
            const writeResp = await fetch(req);
            await swPurgeApiCache();
            return writeResp;
          }
          const normQ = rawQuery.replace(/\s+/g, ' ').trim();
          const syntheticUrl = `https://sw-api-cache.gestornova.local/sql/${authScope}/${swFastHash(normQ)}`;
          return swServeWithTtlAndSwr(
            syntheticUrl,
            () => fetch(req.clone()),
            rule.freshMs,
            rule.swrMs
          );
        })()
      );
      return;
    }

    if (req.method === 'GET') {
      const getRule = swClassifyGetApiTtl(url.pathname);
      if (getRule) {
        const syntheticUrl = `https://sw-api-cache.gestornova.local/get/${authScope}/${swFastHash(url.href)}`;
        event.respondWith(
          swServeWithTtlAndSwr(
            syntheticUrl,
            () => fetch(req),
            getRule.freshMs,
            getRule.swrMs
          )
        );
        return;
      }
    } else if (req.method !== 'OPTIONS' && req.method !== 'HEAD') {
      // Cualquier mutación REST invalida la caché de lecturas API/SQL del Service Worker
      event.respondWith(
        (async () => {
          const resp = await fetch(req);
          await swPurgeApiCache();
          return resp;
        })()
      );
      return;
    }
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppStatic =
    /\.(js|mjs|css|png|webp|svg|woff2?|html)$/i.test(path) ||
    path.endsWith('/') ||
    /\/index\.min\.html$/i.test(path);

  if (!isAppStatic) return;

  const isHtml =
    /\.html$/i.test(path) ||
    path.endsWith('/') ||
    /\/index(\.min)?\.html$/i.test(path);

  const isMainJs = path.endsWith('/app.js') || path.endsWith('/sw.js');
  /** Evita app.js nuevo + módulos viejos en caché (rompe imports y el login no registra). */
  const isShellJs =
    isMainJs || /\/modules\//.test(path) || /\/js\//.test(path);
  event.respondWith((isHtml || isShellJs) ? networkFirstShell(req) : cacheFirstShell(req));
});
