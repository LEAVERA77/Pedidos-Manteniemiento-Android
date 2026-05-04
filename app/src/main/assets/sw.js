// =============================================================
//  SERVICE WORKER — Pedidos MG
//  Cachea los tiles de OpenStreetMap para Entre Ríos (zooms 5-11)
//  en la primera instalación para usar el mapa sin internet.
//
//  Total tiles precargados: 713 (zooms 5-11, ~14 MB estimado)
//  Bbox: lat -33.2 a -29.8, lon -60.8 a -57.2 (Entre Ríos + margen)
//
//  IMPORTANTE: este archivo debe estar en la RAÍZ del repositorio
//  junto a index.html para que funcione correctamente.
// =============================================================

const CACHE_TILES = 'pmg-tiles-v6';
const CACHE_SHELL = 'pmg-shell-v39';
const SW_VERSION  = '1.2.9';

/** Tiles de mapa usados en producción (Carto, Esri fallback, OSM precache). */
function isMapTileRequest(url) {
  const h = url.hostname;
  return (
    h.includes('tile.openstreetmap.org') ||
    h.endsWith('.basemaps.cartocdn.com') ||
    h === 'server.arcgisonline.com'
  );
}

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
    j('app.js'),
    j('modules/utils.js'),
    j('map.js'),
    j('map-view.js'),
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

// ── Tiles de Entre Ríos zooms 5-11 ───────────────────────────
// Generados automáticamente para bbox lat[-33.2,-29.8] lon[-60.8,-57.2]
const TILES_ER = [
"https://a.tile.openstreetmap.org/5/10/18.png","https://b.tile.openstreetmap.org/5/10/19.png",
"https://c.tile.openstreetmap.org/6/21/37.png","https://a.tile.openstreetmap.org/6/21/38.png",
"https://b.tile.openstreetmap.org/7/42/75.png","https://c.tile.openstreetmap.org/7/42/76.png",
"https://a.tile.openstreetmap.org/7/43/75.png","https://b.tile.openstreetmap.org/7/43/76.png",
"https://c.tile.openstreetmap.org/8/84/150.png","https://a.tile.openstreetmap.org/8/84/151.png",
"https://b.tile.openstreetmap.org/8/84/152.png","https://c.tile.openstreetmap.org/8/85/150.png",
"https://a.tile.openstreetmap.org/8/85/151.png","https://b.tile.openstreetmap.org/8/85/152.png",
"https://c.tile.openstreetmap.org/8/86/150.png","https://a.tile.openstreetmap.org/8/86/151.png",
"https://b.tile.openstreetmap.org/8/86/152.png","https://c.tile.openstreetmap.org/8/87/150.png",
"https://a.tile.openstreetmap.org/8/87/151.png","https://b.tile.openstreetmap.org/8/87/152.png",
"https://c.tile.openstreetmap.org/9/169/300.png","https://a.tile.openstreetmap.org/9/169/301.png",
"https://b.tile.openstreetmap.org/9/169/302.png","https://c.tile.openstreetmap.org/9/169/303.png",
"https://a.tile.openstreetmap.org/9/170/300.png","https://b.tile.openstreetmap.org/9/170/301.png",
"https://c.tile.openstreetmap.org/9/170/302.png","https://a.tile.openstreetmap.org/9/170/303.png",
"https://b.tile.openstreetmap.org/9/171/300.png","https://c.tile.openstreetmap.org/9/171/301.png",
"https://a.tile.openstreetmap.org/9/171/302.png","https://b.tile.openstreetmap.org/9/171/303.png",
"https://c.tile.openstreetmap.org/9/172/300.png","https://a.tile.openstreetmap.org/9/172/301.png",
"https://b.tile.openstreetmap.org/9/172/302.png","https://c.tile.openstreetmap.org/9/172/303.png",
"https://a.tile.openstreetmap.org/9/173/300.png","https://b.tile.openstreetmap.org/9/173/301.png",
"https://c.tile.openstreetmap.org/9/173/302.png","https://a.tile.openstreetmap.org/9/173/303.png",
"https://b.tile.openstreetmap.org/9/174/300.png","https://c.tile.openstreetmap.org/9/174/301.png",
"https://a.tile.openstreetmap.org/9/174/302.png","https://b.tile.openstreetmap.org/9/174/303.png",
"https://c.tile.openstreetmap.org/10/338/600.png","https://a.tile.openstreetmap.org/10/338/601.png",
"https://b.tile.openstreetmap.org/10/338/602.png","https://c.tile.openstreetmap.org/10/338/603.png",
"https://a.tile.openstreetmap.org/10/338/604.png","https://b.tile.openstreetmap.org/10/338/605.png",
"https://c.tile.openstreetmap.org/10/338/606.png","https://a.tile.openstreetmap.org/10/338/607.png",
"https://b.tile.openstreetmap.org/10/339/600.png","https://c.tile.openstreetmap.org/10/339/601.png",
"https://a.tile.openstreetmap.org/10/339/602.png","https://b.tile.openstreetmap.org/10/339/603.png",
"https://c.tile.openstreetmap.org/10/339/604.png","https://a.tile.openstreetmap.org/10/339/605.png",
"https://b.tile.openstreetmap.org/10/339/606.png","https://c.tile.openstreetmap.org/10/339/607.png",
"https://a.tile.openstreetmap.org/10/340/600.png","https://b.tile.openstreetmap.org/10/340/601.png",
"https://c.tile.openstreetmap.org/10/340/602.png","https://a.tile.openstreetmap.org/10/340/603.png",
"https://b.tile.openstreetmap.org/10/340/604.png","https://c.tile.openstreetmap.org/10/340/605.png",
"https://a.tile.openstreetmap.org/10/340/606.png","https://b.tile.openstreetmap.org/10/340/607.png",
"https://c.tile.openstreetmap.org/10/341/600.png","https://a.tile.openstreetmap.org/10/341/601.png",
"https://b.tile.openstreetmap.org/10/341/602.png","https://c.tile.openstreetmap.org/10/341/603.png",
"https://a.tile.openstreetmap.org/10/341/604.png","https://b.tile.openstreetmap.org/10/341/605.png",
"https://b.tile.openstreetmap.org/10/341/606.png","https://c.tile.openstreetmap.org/10/341/607.png",
"https://a.tile.openstreetmap.org/10/342/600.png","https://b.tile.openstreetmap.org/10/342/601.png",
"https://c.tile.openstreetmap.org/10/342/602.png","https://a.tile.openstreetmap.org/10/342/603.png",
"https://b.tile.openstreetmap.org/10/342/604.png","https://c.tile.openstreetmap.org/10/342/605.png",
"https://a.tile.openstreetmap.org/10/342/606.png","https://b.tile.openstreetmap.org/10/342/607.png",
"https://c.tile.openstreetmap.org/10/343/600.png","https://a.tile.openstreetmap.org/10/343/601.png",
"https://b.tile.openstreetmap.org/10/343/602.png","https://c.tile.openstreetmap.org/10/343/603.png",
"https://a.tile.openstreetmap.org/10/343/604.png","https://b.tile.openstreetmap.org/10/343/605.png",
"https://c.tile.openstreetmap.org/10/343/606.png","https://a.tile.openstreetmap.org/10/343/607.png",
"https://b.tile.openstreetmap.org/10/344/600.png","https://c.tile.openstreetmap.org/10/344/601.png",
"https://a.tile.openstreetmap.org/10/344/602.png","https://b.tile.openstreetmap.org/10/344/603.png",
"https://c.tile.openstreetmap.org/10/344/604.png","https://a.tile.openstreetmap.org/10/344/605.png",
"https://b.tile.openstreetmap.org/10/344/606.png","https://c.tile.openstreetmap.org/10/344/607.png",
"https://a.tile.openstreetmap.org/10/345/600.png","https://b.tile.openstreetmap.org/10/345/601.png",
"https://c.tile.openstreetmap.org/10/345/602.png","https://a.tile.openstreetmap.org/10/345/603.png",
"https://b.tile.openstreetmap.org/10/345/604.png","https://c.tile.openstreetmap.org/10/345/605.png",
"https://a.tile.openstreetmap.org/10/345/606.png","https://b.tile.openstreetmap.org/10/345/607.png",
"https://c.tile.openstreetmap.org/10/346/600.png","https://a.tile.openstreetmap.org/10/346/601.png",
"https://b.tile.openstreetmap.org/10/346/602.png","https://c.tile.openstreetmap.org/10/346/603.png",
"https://a.tile.openstreetmap.org/10/346/604.png","https://b.tile.openstreetmap.org/10/346/605.png",
"https://c.tile.openstreetmap.org/10/346/606.png","https://a.tile.openstreetmap.org/10/346/607.png",
"https://b.tile.openstreetmap.org/10/347/600.png","https://c.tile.openstreetmap.org/10/347/601.png",
"https://a.tile.openstreetmap.org/10/347/602.png","https://b.tile.openstreetmap.org/10/347/603.png",
"https://c.tile.openstreetmap.org/10/347/604.png","https://a.tile.openstreetmap.org/10/347/605.png",
"https://b.tile.openstreetmap.org/10/347/606.png","https://c.tile.openstreetmap.org/10/347/607.png",
"https://a.tile.openstreetmap.org/10/348/600.png","https://b.tile.openstreetmap.org/10/348/601.png",
"https://c.tile.openstreetmap.org/10/348/602.png","https://a.tile.openstreetmap.org/10/348/603.png",
"https://b.tile.openstreetmap.org/10/348/604.png","https://c.tile.openstreetmap.org/10/348/605.png",
"https://a.tile.openstreetmap.org/10/348/606.png","https://b.tile.openstreetmap.org/10/348/607.png",
"https://c.tile.openstreetmap.org/11/676/1200.png","https://a.tile.openstreetmap.org/11/676/1201.png",
"https://b.tile.openstreetmap.org/11/676/1202.png","https://c.tile.openstreetmap.org/11/676/1203.png",
"https://a.tile.openstreetmap.org/11/676/1204.png","https://b.tile.openstreetmap.org/11/676/1205.png",
"https://c.tile.openstreetmap.org/11/676/1206.png","https://a.tile.openstreetmap.org/11/676/1207.png",
"https://b.tile.openstreetmap.org/11/676/1208.png","https://c.tile.openstreetmap.org/11/676/1209.png",
"https://a.tile.openstreetmap.org/11/676/1210.png","https://b.tile.openstreetmap.org/11/676/1211.png",
"https://c.tile.openstreetmap.org/11/676/1212.png","https://a.tile.openstreetmap.org/11/676/1213.png",
"https://b.tile.openstreetmap.org/11/676/1214.png","https://c.tile.openstreetmap.org/11/676/1215.png",
"https://a.tile.openstreetmap.org/11/677/1200.png","https://b.tile.openstreetmap.org/11/677/1201.png",
"https://c.tile.openstreetmap.org/11/677/1202.png","https://a.tile.openstreetmap.org/11/677/1203.png",
"https://b.tile.openstreetmap.org/11/677/1204.png","https://c.tile.openstreetmap.org/11/677/1205.png",
"https://a.tile.openstreetmap.org/11/677/1206.png","https://b.tile.openstreetmap.org/11/677/1207.png",
"https://c.tile.openstreetmap.org/11/677/1208.png","https://a.tile.openstreetmap.org/11/677/1209.png",
"https://b.tile.openstreetmap.org/11/677/1210.png","https://c.tile.openstreetmap.org/11/677/1211.png",
"https://a.tile.openstreetmap.org/11/677/1212.png","https://b.tile.openstreetmap.org/11/677/1213.png",
"https://c.tile.openstreetmap.org/11/677/1214.png","https://a.tile.openstreetmap.org/11/677/1215.png",
"https://b.tile.openstreetmap.org/11/678/1200.png","https://c.tile.openstreetmap.org/11/678/1201.png",
"https://a.tile.openstreetmap.org/11/678/1202.png","https://b.tile.openstreetmap.org/11/678/1203.png",
"https://c.tile.openstreetmap.org/11/678/1204.png","https://a.tile.openstreetmap.org/11/678/1205.png",
"https://b.tile.openstreetmap.org/11/678/1206.png","https://c.tile.openstreetmap.org/11/678/1207.png",
"https://a.tile.openstreetmap.org/11/678/1208.png","https://b.tile.openstreetmap.org/11/678/1209.png",
"https://c.tile.openstreetmap.org/11/678/1210.png","https://a.tile.openstreetmap.org/11/678/1211.png",
"https://b.tile.openstreetmap.org/11/678/1212.png","https://c.tile.openstreetmap.org/11/678/1213.png",
"https://a.tile.openstreetmap.org/11/678/1214.png","https://b.tile.openstreetmap.org/11/678/1215.png",
"https://c.tile.openstreetmap.org/11/679/1200.png","https://a.tile.openstreetmap.org/11/679/1201.png",
"https://b.tile.openstreetmap.org/11/679/1202.png","https://c.tile.openstreetmap.org/11/679/1203.png",
"https://a.tile.openstreetmap.org/11/679/1204.png","https://b.tile.openstreetmap.org/11/679/1205.png",
"https://c.tile.openstreetmap.org/11/679/1206.png","https://a.tile.openstreetmap.org/11/679/1207.png",
"https://b.tile.openstreetmap.org/11/679/1208.png","https://c.tile.openstreetmap.org/11/679/1209.png",
"https://a.tile.openstreetmap.org/11/679/1210.png","https://b.tile.openstreetmap.org/11/679/1211.png",
"https://c.tile.openstreetmap.org/11/679/1212.png","https://a.tile.openstreetmap.org/11/679/1213.png",
"https://b.tile.openstreetmap.org/11/679/1214.png","https://c.tile.openstreetmap.org/11/679/1215.png",
"https://a.tile.openstreetmap.org/11/680/1200.png","https://b.tile.openstreetmap.org/11/680/1201.png",
"https://c.tile.openstreetmap.org/11/680/1202.png","https://a.tile.openstreetmap.org/11/680/1203.png",
"https://b.tile.openstreetmap.org/11/680/1204.png","https://c.tile.openstreetmap.org/11/680/1205.png",
"https://a.tile.openstreetmap.org/11/680/1206.png","https://b.tile.openstreetmap.org/11/680/1207.png",
"https://c.tile.openstreetmap.org/11/680/1208.png","https://a.tile.openstreetmap.org/11/680/1209.png",
"https://b.tile.openstreetmap.org/11/680/1210.png","https://c.tile.openstreetmap.org/11/680/1211.png",
"https://a.tile.openstreetmap.org/11/680/1212.png","https://b.tile.openstreetmap.org/11/680/1213.png",
"https://c.tile.openstreetmap.org/11/680/1214.png","https://a.tile.openstreetmap.org/11/680/1215.png",
"https://b.tile.openstreetmap.org/11/681/1200.png","https://c.tile.openstreetmap.org/11/681/1201.png",
"https://a.tile.openstreetmap.org/11/681/1202.png","https://b.tile.openstreetmap.org/11/681/1203.png",
"https://c.tile.openstreetmap.org/11/681/1204.png","https://a.tile.openstreetmap.org/11/681/1205.png",
"https://b.tile.openstreetmap.org/11/681/1206.png","https://c.tile.openstreetmap.org/11/681/1207.png",
"https://a.tile.openstreetmap.org/11/681/1208.png","https://b.tile.openstreetmap.org/11/681/1209.png",
"https://c.tile.openstreetmap.org/11/681/1210.png","https://a.tile.openstreetmap.org/11/681/1211.png",
"https://b.tile.openstreetmap.org/11/681/1212.png","https://c.tile.openstreetmap.org/11/681/1213.png",
"https://a.tile.openstreetmap.org/11/681/1214.png","https://b.tile.openstreetmap.org/11/681/1215.png",
"https://c.tile.openstreetmap.org/11/682/1200.png","https://a.tile.openstreetmap.org/11/682/1201.png",
"https://b.tile.openstreetmap.org/11/682/1202.png","https://c.tile.openstreetmap.org/11/682/1203.png",
"https://a.tile.openstreetmap.org/11/682/1204.png","https://b.tile.openstreetmap.org/11/682/1205.png",
"https://c.tile.openstreetmap.org/11/682/1206.png","https://a.tile.openstreetmap.org/11/682/1207.png",
"https://b.tile.openstreetmap.org/11/682/1208.png","https://c.tile.openstreetmap.org/11/682/1209.png",
"https://a.tile.openstreetmap.org/11/682/1210.png","https://b.tile.openstreetmap.org/11/682/1211.png",
"https://c.tile.openstreetmap.org/11/682/1212.png","https://a.tile.openstreetmap.org/11/682/1213.png",
"https://b.tile.openstreetmap.org/11/682/1214.png","https://c.tile.openstreetmap.org/11/682/1215.png",
"https://a.tile.openstreetmap.org/11/683/1200.png","https://b.tile.openstreetmap.org/11/683/1201.png",
"https://c.tile.openstreetmap.org/11/683/1202.png","https://a.tile.openstreetmap.org/11/683/1203.png",
"https://b.tile.openstreetmap.org/11/683/1204.png","https://c.tile.openstreetmap.org/11/683/1205.png",
"https://a.tile.openstreetmap.org/11/683/1206.png","https://b.tile.openstreetmap.org/11/683/1207.png",
"https://c.tile.openstreetmap.org/11/683/1208.png","https://a.tile.openstreetmap.org/11/683/1209.png",
"https://b.tile.openstreetmap.org/11/683/1210.png","https://c.tile.openstreetmap.org/11/683/1211.png",
"https://a.tile.openstreetmap.org/11/683/1212.png","https://b.tile.openstreetmap.org/11/683/1213.png",
"https://c.tile.openstreetmap.org/11/683/1214.png","https://a.tile.openstreetmap.org/11/683/1215.png",
"https://b.tile.openstreetmap.org/11/684/1200.png","https://c.tile.openstreetmap.org/11/684/1201.png",
"https://a.tile.openstreetmap.org/11/684/1202.png","https://b.tile.openstreetmap.org/11/684/1203.png",
"https://c.tile.openstreetmap.org/11/684/1204.png","https://a.tile.openstreetmap.org/11/684/1205.png",
"https://b.tile.openstreetmap.org/11/684/1206.png","https://c.tile.openstreetmap.org/11/684/1207.png",
"https://a.tile.openstreetmap.org/11/684/1208.png","https://b.tile.openstreetmap.org/11/684/1209.png",
"https://c.tile.openstreetmap.org/11/684/1210.png","https://a.tile.openstreetmap.org/11/684/1211.png",
"https://b.tile.openstreetmap.org/11/684/1212.png","https://c.tile.openstreetmap.org/11/684/1213.png",
"https://a.tile.openstreetmap.org/11/684/1214.png","https://b.tile.openstreetmap.org/11/684/1215.png",
"https://c.tile.openstreetmap.org/11/685/1200.png","https://a.tile.openstreetmap.org/11/685/1201.png",
"https://b.tile.openstreetmap.org/11/685/1202.png","https://c.tile.openstreetmap.org/11/685/1203.png",
"https://a.tile.openstreetmap.org/11/685/1204.png","https://b.tile.openstreetmap.org/11/685/1205.png",
"https://c.tile.openstreetmap.org/11/685/1206.png","https://a.tile.openstreetmap.org/11/685/1207.png",
"https://b.tile.openstreetmap.org/11/685/1208.png","https://c.tile.openstreetmap.org/11/685/1209.png",
"https://a.tile.openstreetmap.org/11/685/1210.png","https://b.tile.openstreetmap.org/11/685/1211.png",
"https://c.tile.openstreetmap.org/11/685/1212.png","https://a.tile.openstreetmap.org/11/685/1213.png",
"https://b.tile.openstreetmap.org/11/685/1214.png","https://c.tile.openstreetmap.org/11/685/1215.png",
"https://a.tile.openstreetmap.org/11/686/1200.png","https://b.tile.openstreetmap.org/11/686/1201.png",
"https://c.tile.openstreetmap.org/11/686/1202.png","https://a.tile.openstreetmap.org/11/686/1203.png",
"https://b.tile.openstreetmap.org/11/686/1204.png","https://c.tile.openstreetmap.org/11/686/1205.png",
"https://a.tile.openstreetmap.org/11/686/1206.png","https://b.tile.openstreetmap.org/11/686/1207.png",
"https://c.tile.openstreetmap.org/11/686/1208.png","https://a.tile.openstreetmap.org/11/686/1209.png",
"https://b.tile.openstreetmap.org/11/686/1210.png","https://c.tile.openstreetmap.org/11/686/1211.png",
"https://a.tile.openstreetmap.org/11/686/1212.png","https://b.tile.openstreetmap.org/11/686/1213.png",
"https://c.tile.openstreetmap.org/11/686/1214.png","https://a.tile.openstreetmap.org/11/686/1215.png",
"https://b.tile.openstreetmap.org/11/687/1200.png","https://c.tile.openstreetmap.org/11/687/1201.png",
"https://a.tile.openstreetmap.org/11/687/1202.png","https://b.tile.openstreetmap.org/11/687/1203.png",
"https://c.tile.openstreetmap.org/11/687/1204.png","https://a.tile.openstreetmap.org/11/687/1205.png",
"https://b.tile.openstreetmap.org/11/687/1206.png","https://c.tile.openstreetmap.org/11/687/1207.png",
"https://a.tile.openstreetmap.org/11/687/1208.png","https://b.tile.openstreetmap.org/11/687/1209.png",
"https://c.tile.openstreetmap.org/11/687/1210.png","https://a.tile.openstreetmap.org/11/687/1211.png",
"https://b.tile.openstreetmap.org/11/687/1212.png","https://c.tile.openstreetmap.org/11/687/1213.png",
"https://a.tile.openstreetmap.org/11/687/1214.png","https://b.tile.openstreetmap.org/11/687/1215.png",
"https://c.tile.openstreetmap.org/11/688/1200.png","https://a.tile.openstreetmap.org/11/688/1201.png",
"https://b.tile.openstreetmap.org/11/688/1202.png","https://c.tile.openstreetmap.org/11/688/1203.png",
"https://a.tile.openstreetmap.org/11/688/1204.png","https://b.tile.openstreetmap.org/11/688/1205.png",
"https://c.tile.openstreetmap.org/11/688/1206.png","https://a.tile.openstreetmap.org/11/688/1207.png",
"https://b.tile.openstreetmap.org/11/688/1208.png","https://c.tile.openstreetmap.org/11/688/1209.png",
"https://a.tile.openstreetmap.org/11/688/1210.png","https://b.tile.openstreetmap.org/11/688/1211.png",
"https://c.tile.openstreetmap.org/11/688/1212.png","https://a.tile.openstreetmap.org/11/688/1213.png",
"https://b.tile.openstreetmap.org/11/688/1214.png","https://c.tile.openstreetmap.org/11/688/1215.png",
"https://a.tile.openstreetmap.org/11/689/1200.png","https://b.tile.openstreetmap.org/11/689/1201.png",
"https://c.tile.openstreetmap.org/11/689/1202.png","https://a.tile.openstreetmap.org/11/689/1203.png",
"https://b.tile.openstreetmap.org/11/689/1204.png","https://c.tile.openstreetmap.org/11/689/1205.png",
"https://a.tile.openstreetmap.org/11/689/1206.png","https://b.tile.openstreetmap.org/11/689/1207.png",
"https://c.tile.openstreetmap.org/11/689/1208.png","https://a.tile.openstreetmap.org/11/689/1209.png",
"https://b.tile.openstreetmap.org/11/689/1210.png","https://c.tile.openstreetmap.org/11/689/1211.png",
"https://a.tile.openstreetmap.org/11/689/1212.png","https://b.tile.openstreetmap.org/11/689/1213.png",
"https://c.tile.openstreetmap.org/11/689/1214.png","https://a.tile.openstreetmap.org/11/689/1215.png",
"https://b.tile.openstreetmap.org/11/690/1200.png","https://c.tile.openstreetmap.org/11/690/1201.png",
"https://a.tile.openstreetmap.org/11/690/1202.png","https://b.tile.openstreetmap.org/11/690/1203.png",
"https://c.tile.openstreetmap.org/11/690/1204.png","https://a.tile.openstreetmap.org/11/690/1205.png",
"https://b.tile.openstreetmap.org/11/690/1206.png","https://c.tile.openstreetmap.org/11/690/1207.png",
"https://a.tile.openstreetmap.org/11/690/1208.png","https://b.tile.openstreetmap.org/11/690/1209.png",
"https://c.tile.openstreetmap.org/11/690/1210.png","https://a.tile.openstreetmap.org/11/690/1211.png",
"https://b.tile.openstreetmap.org/11/690/1212.png","https://c.tile.openstreetmap.org/11/690/1213.png",
"https://a.tile.openstreetmap.org/11/690/1214.png","https://b.tile.openstreetmap.org/11/690/1215.png",
"https://c.tile.openstreetmap.org/11/691/1200.png","https://a.tile.openstreetmap.org/11/691/1201.png",
"https://b.tile.openstreetmap.org/11/691/1202.png","https://c.tile.openstreetmap.org/11/691/1203.png",
"https://a.tile.openstreetmap.org/11/691/1204.png","https://b.tile.openstreetmap.org/11/691/1205.png",
"https://c.tile.openstreetmap.org/11/691/1206.png","https://a.tile.openstreetmap.org/11/691/1207.png",
"https://b.tile.openstreetmap.org/11/691/1208.png","https://c.tile.openstreetmap.org/11/691/1209.png",
"https://a.tile.openstreetmap.org/11/691/1210.png","https://b.tile.openstreetmap.org/11/691/1211.png",
"https://c.tile.openstreetmap.org/11/691/1212.png","https://a.tile.openstreetmap.org/11/691/1213.png",
"https://b.tile.openstreetmap.org/11/691/1214.png","https://c.tile.openstreetmap.org/11/691/1215.png",
"https://a.tile.openstreetmap.org/11/692/1200.png","https://b.tile.openstreetmap.org/11/692/1201.png",
"https://c.tile.openstreetmap.org/11/692/1202.png","https://a.tile.openstreetmap.org/11/692/1203.png",
"https://b.tile.openstreetmap.org/11/692/1204.png","https://c.tile.openstreetmap.org/11/692/1205.png",
"https://a.tile.openstreetmap.org/11/692/1206.png","https://b.tile.openstreetmap.org/11/692/1207.png",
"https://c.tile.openstreetmap.org/11/692/1208.png","https://a.tile.openstreetmap.org/11/692/1209.png",
"https://b.tile.openstreetmap.org/11/692/1210.png","https://c.tile.openstreetmap.org/11/692/1211.png",
"https://a.tile.openstreetmap.org/11/692/1212.png","https://b.tile.openstreetmap.org/11/692/1213.png",
"https://c.tile.openstreetmap.org/11/692/1214.png","https://a.tile.openstreetmap.org/11/692/1215.png",
"https://b.tile.openstreetmap.org/11/693/1200.png","https://c.tile.openstreetmap.org/11/693/1201.png",
"https://a.tile.openstreetmap.org/11/693/1202.png","https://b.tile.openstreetmap.org/11/693/1203.png",
"https://c.tile.openstreetmap.org/11/693/1204.png","https://a.tile.openstreetmap.org/11/693/1205.png",
"https://b.tile.openstreetmap.org/11/693/1206.png","https://c.tile.openstreetmap.org/11/693/1207.png",
"https://a.tile.openstreetmap.org/11/693/1208.png","https://b.tile.openstreetmap.org/11/693/1209.png",
"https://c.tile.openstreetmap.org/11/693/1210.png","https://a.tile.openstreetmap.org/11/693/1211.png",
"https://b.tile.openstreetmap.org/11/693/1212.png","https://c.tile.openstreetmap.org/11/693/1213.png",
"https://a.tile.openstreetmap.org/11/693/1214.png","https://b.tile.openstreetmap.org/11/693/1215.png",
"https://c.tile.openstreetmap.org/11/694/1200.png","https://a.tile.openstreetmap.org/11/694/1201.png",
"https://b.tile.openstreetmap.org/11/694/1202.png","https://c.tile.openstreetmap.org/11/694/1203.png",
"https://a.tile.openstreetmap.org/11/694/1204.png","https://b.tile.openstreetmap.org/11/694/1205.png",
"https://c.tile.openstreetmap.org/11/694/1206.png","https://a.tile.openstreetmap.org/11/694/1207.png",
"https://b.tile.openstreetmap.org/11/694/1208.png","https://c.tile.openstreetmap.org/11/694/1209.png",
"https://a.tile.openstreetmap.org/11/694/1210.png","https://b.tile.openstreetmap.org/11/694/1211.png",
"https://c.tile.openstreetmap.org/11/694/1212.png","https://a.tile.openstreetmap.org/11/694/1213.png",
"https://b.tile.openstreetmap.org/11/694/1214.png","https://c.tile.openstreetmap.org/11/694/1215.png",
"https://a.tile.openstreetmap.org/11/695/1200.png","https://b.tile.openstreetmap.org/11/695/1201.png",
"https://c.tile.openstreetmap.org/11/695/1202.png","https://a.tile.openstreetmap.org/11/695/1203.png",
"https://b.tile.openstreetmap.org/11/695/1204.png","https://c.tile.openstreetmap.org/11/695/1205.png",
"https://a.tile.openstreetmap.org/11/695/1206.png","https://b.tile.openstreetmap.org/11/695/1207.png",
"https://c.tile.openstreetmap.org/11/695/1208.png","https://a.tile.openstreetmap.org/11/695/1209.png",
"https://b.tile.openstreetmap.org/11/695/1210.png","https://c.tile.openstreetmap.org/11/695/1211.png",
"https://a.tile.openstreetmap.org/11/695/1212.png","https://b.tile.openstreetmap.org/11/695/1213.png",
"https://c.tile.openstreetmap.org/11/695/1214.png","https://a.tile.openstreetmap.org/11/695/1215.png",
"https://b.tile.openstreetmap.org/11/696/1200.png","https://c.tile.openstreetmap.org/11/696/1201.png",
"https://a.tile.openstreetmap.org/11/696/1202.png","https://b.tile.openstreetmap.org/11/696/1203.png",
"https://c.tile.openstreetmap.org/11/696/1204.png","https://a.tile.openstreetmap.org/11/696/1205.png",
"https://b.tile.openstreetmap.org/11/696/1206.png","https://c.tile.openstreetmap.org/11/696/1207.png",
"https://a.tile.openstreetmap.org/11/696/1208.png","https://b.tile.openstreetmap.org/11/696/1209.png",
"https://c.tile.openstreetmap.org/11/696/1210.png","https://a.tile.openstreetmap.org/11/696/1211.png",
"https://b.tile.openstreetmap.org/11/696/1212.png","https://c.tile.openstreetmap.org/11/696/1213.png",
"https://a.tile.openstreetmap.org/11/696/1214.png","https://b.tile.openstreetmap.org/11/696/1215.png",
"https://c.tile.openstreetmap.org/11/697/1200.png","https://a.tile.openstreetmap.org/11/697/1201.png",
"https://b.tile.openstreetmap.org/11/697/1202.png","https://c.tile.openstreetmap.org/11/697/1203.png",
"https://a.tile.openstreetmap.org/11/697/1204.png","https://b.tile.openstreetmap.org/11/697/1205.png",
"https://c.tile.openstreetmap.org/11/697/1206.png","https://a.tile.openstreetmap.org/11/697/1207.png",
"https://b.tile.openstreetmap.org/11/697/1208.png","https://c.tile.openstreetmap.org/11/697/1209.png",
"https://a.tile.openstreetmap.org/11/697/1210.png","https://b.tile.openstreetmap.org/11/697/1211.png",
"https://c.tile.openstreetmap.org/11/697/1212.png","https://a.tile.openstreetmap.org/11/697/1213.png",
"https://b.tile.openstreetmap.org/11/697/1214.png","https://c.tile.openstreetmap.org/11/697/1215.png",
"https://a.tile.openstreetmap.org/11/698/1200.png","https://b.tile.openstreetmap.org/11/698/1201.png",
"https://c.tile.openstreetmap.org/11/698/1202.png","https://a.tile.openstreetmap.org/11/698/1203.png",
"https://b.tile.openstreetmap.org/11/698/1204.png","https://c.tile.openstreetmap.org/11/698/1205.png",
"https://a.tile.openstreetmap.org/11/698/1206.png","https://b.tile.openstreetmap.org/11/698/1207.png",
"https://c.tile.openstreetmap.org/11/698/1208.png","https://a.tile.openstreetmap.org/11/698/1209.png",
"https://b.tile.openstreetmap.org/11/698/1210.png","https://c.tile.openstreetmap.org/11/698/1211.png",
"https://a.tile.openstreetmap.org/11/698/1212.png","https://b.tile.openstreetmap.org/11/698/1213.png",
"https://c.tile.openstreetmap.org/11/698/1214.png","https://a.tile.openstreetmap.org/11/698/1215.png"
];

// ── INSTALL: precargar tiles en segundo plano ─────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      precacheShellAssets(),
      (async () => {
      const cache = await caches.open(CACHE_TILES);
      let ok = 0, skip = 0, fail = 0;
      // Lotes de 10 para respetar el rate limit de OSM (máx ~2 req/s por IP)
      const BATCH = 10;
      for (let i = 0; i < TILES_ER.length; i += BATCH) {
        const lote = TILES_ER.slice(i, i + BATCH);
        await Promise.all(lote.map(async url => {
          try {
            if (await cache.match(url)) { skip++; return; } // ya cacheado
            const resp = await fetch(url, { mode: 'cors' });
            if (resp.ok) {
              const copy = resp.clone();
              await cache.put(url, copy);
              ok++;
            }
          } catch(_) { fail++; }
        }));
        // Pequeña pausa entre lotes para no sobrecargar OSM
        if (i + BATCH < TILES_ER.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
      console.log(`[SW] Tiles Entre Ríos: ${ok} nuevos, ${skip} ya cacheados, ${fail} fallidos`);
    })()
    ])
  );
});

// ── ACTIVATE: limpiar versiones anteriores ────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([CACHE_TILES, CACHE_SHELL]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: app shell (JS/CSS/img/HTML) + tiles OSM ─────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (isMapTileRequest(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_TILES);
        const cached = await cache.match(event.request);
        const netP = fetch(event.request)
          .then(async (resp) => {
            if (resp.ok) {
              try {
                await cache.put(event.request, resp.clone());
              } catch (_) {}
            }
            return resp;
          })
          .catch(() => null);
        if (cached) {
          netP.catch(() => {});
          return cached;
        }
        const fresh = await netP;
        if (fresh) return fresh;
        return new Response(
          Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
            0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xd8, 0xd8, 0xd8, 0x00, 0x00, 0x00,
            0x04, 0x00, 0x01, 0xa9, 0xf1, 0x9e, 0x7d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
            0x60, 0x82
          ]).buffer,
          { headers: { 'Content-Type': 'image/png' } }
        );
      })()
    );
    return;
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

  event.respondWith(isHtml ? networkFirstShell(req) : cacheFirstShell(req));
});
