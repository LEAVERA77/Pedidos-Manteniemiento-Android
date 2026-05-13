/**
 * Panel flotante de clima usando Open-Meteo (gratis, sin API key).
 * Se muestra en la esquina del mapa con clima actual y pronostico 3 dias.
 * made by leavera77
 */

let _wired = false;
const PANEL_ID = 'gn-clima-panel';
const REFRESH_MS = 30 * 60_000;
let _lastFetch = 0;

const WMO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌧️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};
const WMO_DESC = {
  0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha',
  51: 'Llovizna leve', 53: 'Llovizna', 55: 'Llovizna intensa',
  61: 'Lluvia leve', 63: 'Lluvia', 65: 'Lluvia intensa',
  71: 'Nieve leve', 73: 'Nieve', 75: 'Nieve intensa',
  80: 'Chubascos leves', 81: 'Chubascos', 82: 'Chubascos intensos',
  95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta fuerte con granizo',
};

function getCoords() {
  const cfg = window.EMPRESA_CFG || {};
  const la = parseFloat(cfg.oficina_lat || cfg.lat);
  const lo = parseFloat(cfg.oficina_lng || cfg.lng);
  if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lon: lo };
  const mapCenter = window.app?.map?.getCenter?.();
  if (mapCenter) return { lat: mapCenter.lat, lon: mapCenter.lng };
  return { lat: -31.63, lon: -60.7 };
}

function getOrCreatePanel() {
  let p = document.getElementById(PANEL_ID);
  if (p) return p;

  p = document.createElement('div');
  p.id = PANEL_ID;
  p.style.cssText =
    'position:absolute;bottom:2.5rem;left:.5rem;z-index:1005;width:230px;' +
    'background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-radius:.65rem;' +
    'box-shadow:0 4px 18px rgba(0,0,0,.15);border:1px solid var(--bo);overflow:hidden;' +
    'font-size:.78rem;color:var(--td,#1e293b);cursor:default;transition:opacity .2s';

  const hd = document.createElement('div');
  hd.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:.35rem .55rem;' +
    'background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;font-weight:600;font-size:.8rem;cursor:grab;user-select:none';
  hd.innerHTML = '<span><i class="fas fa-cloud-sun" style="margin-right:.3rem"></i>Clima</span>';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:.1rem';

  const mkBtn = (ico, tip, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = tip;
    b.innerHTML = `<i class="fas ${ico}"></i>`;
    b.style.cssText = 'background:rgba(255,255,255,.2);border:none;color:#fff;width:22px;height:22px;border-radius:.25rem;cursor:pointer;font-size:.72rem;display:flex;align-items:center;justify-content:center';
    b.addEventListener('click', fn);
    return b;
  };

  actions.appendChild(mkBtn('fa-sync-alt', 'Refrescar', () => fetchClima(true)));
  actions.appendChild(mkBtn('fa-times', 'Ocultar', () => { p.style.display = 'none'; }));
  hd.appendChild(actions);
  p.appendChild(hd);

  const body = document.createElement('div');
  body.id = 'gn-clima-body';
  body.style.cssText = 'padding:.45rem .55rem;line-height:1.45';
  body.innerHTML = '<div style="text-align:center;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>';
  p.appendChild(body);

  const mapWrap = document.getElementById('map') || document.getElementById('mp');
  if (mapWrap) mapWrap.style.position = 'relative';
  (mapWrap || document.body).appendChild(p);
  setupDrag(p, hd);
  return p;
}

function setupDrag(panel, handle) {
  let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;
  const onDown = (e) => {
    if (e.target.closest('button')) return;
    dragging = true; handle.style.cursor = 'grabbing';
    const ev = e.touches ? e.touches[0] : e;
    ox = ev.clientX; oy = ev.clientY;
    const r = panel.getBoundingClientRect();
    sx = r.left; sy = r.top;
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const ev = e.touches ? e.touches[0] : e;
    panel.style.left = `${sx + (ev.clientX - ox)}px`;
    panel.style.top = `${sy + (ev.clientY - oy)}px`;
    panel.style.bottom = 'auto'; panel.style.right = 'auto';
    panel.style.position = 'fixed';
  };
  const onUp = () => { dragging = false; handle.style.cursor = 'grab'; };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
}

async function fetchClima(force) {
  if (!force && Date.now() - _lastFetch < REFRESH_MS) return;
  const body = document.getElementById('gn-clima-body');
  if (!body) return;

  const { lat, lon } = getCoords();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=America/Argentina/Buenos_Aires&forecast_days=3`;

  try {
    const r = await fetch(url);
    const d = await r.json();
    _lastFetch = Date.now();

    const c = d.current || {};
    const wc = c.weather_code ?? 0;
    const ico = WMO_ICONS[wc] || '🌡️';
    const desc = WMO_DESC[wc] || '';
    let h = `<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem">`;
    h += `<span style="font-size:1.5rem">${ico}</span>`;
    h += `<div><div style="font-size:1.05rem;font-weight:700">${Math.round(c.temperature_2m || 0)}°C</div>`;
    h += `<div style="font-size:.7rem;color:#64748b">${desc}</div></div></div>`;
    h += `<div style="font-size:.72rem;color:#475569">Humedad: ${c.relative_humidity_2m || 0}% · Viento: ${Math.round(c.wind_speed_10m || 0)} km/h</div>`;

    const daily = d.daily;
    if (daily && daily.time) {
      h += '<div style="margin-top:.4rem;border-top:1px solid #e2e8f0;padding-top:.35rem;font-size:.72rem">';
      h += '<div style="font-weight:600;margin-bottom:.2rem">Próximos días</div>';
      for (let i = 1; i < Math.min(daily.time.length, 3); i++) {
        const dia = new Date(daily.time[i] + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
        const dIco = WMO_ICONS[daily.weather_code[i]] || '🌡️';
        const mn = Math.round(daily.temperature_2m_min[i]);
        const mx = Math.round(daily.temperature_2m_max[i]);
        const rain = daily.precipitation_probability_max?.[i] ?? 0;
        h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:.1rem 0">`;
        h += `<span>${dIco} ${dia}</span><span>${mn}°/${mx}°${rain > 20 ? ` 💧${rain}%` : ''}</span></div>`;
      }
      h += '</div>';
    }
    body.innerHTML = h;
  } catch (e) {
    console.warn('[panel-clima]', e);
    body.innerHTML = '<div style="color:#dc2626;font-size:.74rem">No se pudo obtener el clima.</div>';
  }
}

function initClima() {
  if (_wired) return;
  if (!document.getElementById('map') && !document.getElementById('mp')) return;
  _wired = true;
  getOrCreatePanel();
  fetchClima(true);
  setInterval(() => fetchClima(false), REFRESH_MS);
}

export { initClima };
