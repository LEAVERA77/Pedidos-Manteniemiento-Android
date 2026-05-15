/**
 * Pestaña admin: import Excel métricas SAIDI/SAIFI por distribuidor (solo cooperativa eléctrica).
 * made by leavera77
 */

let _bound = false;

/**
 * @param {{ toast: Function, toastError?: Function, getApiBaseUrl: () => string, getApiToken: () => string, cargarListaDistribuidoresAdmin?: () => void }} ctx
 */
export function initAdminSaidiDistribExcelBindings(ctx) {
  if (_bound) return;
  const inp = document.getElementById('saidi-dist-file');
  const btn = document.getElementById('saidi-dist-btn-upload');
  const out = document.getElementById('saidi-dist-result');
  if (!inp || !btn) return;
  _bound = true;

  btn.addEventListener('click', async () => {
    const file = inp.files && inp.files[0];
    if (!file) {
      ctx.toast('Elegí un archivo .xlsx o .xls', 'warning');
      return;
    }
    const base = String(ctx.getApiBaseUrl?.() || '').replace(/\/+$/, '');
    const tok = String(ctx.getApiToken?.() || '').trim();
    if (!base || !tok) {
      ctx.toast('Iniciá sesión con API (token) para subir el archivo.', 'error');
      return;
    }
    if (out) {
      out.textContent = 'Subiendo e importando…';
      out.style.color = 'var(--tm)';
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${base}/api/distribuidores/import-saidi-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j.error || j.detail || `HTTP ${r.status}`);
      }
      const msg = `Listo: nuevas ${j.inserted ?? 0}, actualizadas ${j.updated ?? 0}, sin cambios ${j.unchanged ?? 0} (filas con código: ${j.parseadas ?? 0}).`;
      ctx.toast(msg, 'success');
      if (out) {
        out.textContent = msg;
        out.style.color = '#166534';
      }
      try {
        ctx.cargarListaDistribuidoresAdmin?.();
      } catch (_) {}
      inp.value = '';
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      if (out) {
        out.textContent = m;
        out.style.color = 'var(--re)';
      }
      try {
        ctx.toastError?.('saidi-excel', e);
      } catch (_) {
        ctx.toast(m, 'error');
      }
    }
  });
}
