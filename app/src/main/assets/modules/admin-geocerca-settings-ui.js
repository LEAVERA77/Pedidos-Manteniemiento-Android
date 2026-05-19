/**
 * Panel admin Empresa: configuración geocerca por tenant.
 * made by leavera77
 */

export function htmlGeocercaSettingsAdminBlock() {
    return `<div id="gn-admin-geocerca-block" class="gn-admin-geocerca" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg)">
<h4 style="margin:0 0 .5rem;font-size:.95rem"><i class="fas fa-map-pin"></i> Geocerca (validación en campo)</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .6rem">Al iniciar un pedido, el técnico debe estar dentro del radio respecto al pin del reclamo.</p>
<label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;margin-bottom:.5rem">
  <input type="checkbox" id="gn-geocerca-habilitada" checked> Habilitada
</label>
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Radio máximo (metros, 10–5000)</label>
<input type="number" id="gn-geocerca-radio" min="10" max="5000" value="100" style="width:6rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
<button type="button" class="btn-sm primary" id="gn-geocerca-guardar" style="margin-left:.5rem">Guardar geocerca</button>
<span id="gn-geocerca-msg" style="font-size:.75rem;color:var(--tl);margin-left:.5rem"></span>
</div>`;
}

export async function initAdminGeocercaSettingsUI({ toast, esAdmin }) {
    if (!esAdmin || typeof window.gnOperativaTenantGeocercaGet !== 'function') return;
    const block = document.getElementById('gn-admin-geocerca-block');
    if (!block) return;
    const chk = document.getElementById('gn-geocerca-habilitada');
    const rad = document.getElementById('gn-geocerca-radio');
    const msg = document.getElementById('gn-geocerca-msg');
    try {
        const cfg = await window.gnOperativaTenantGeocercaGet();
        if (chk) chk.checked = cfg.habilitada !== false;
        if (rad && cfg.radio_metros != null) rad.value = String(cfg.radio_metros);
        if (msg && cfg.tabla_ok === false) {
            msg.textContent = 'Migración Neon pendiente (NEON_top3_operativa_cooperativa.sql)';
        }
    } catch (e) {
        if (msg) msg.textContent = e.message || 'Sin API';
    }
    document.getElementById('gn-geocerca-guardar')?.addEventListener('click', async () => {
        try {
            await window.gnOperativaTenantGeocercaPut(
                chk?.checked !== false,
                parseInt(rad?.value, 10) || 100
            );
            if (typeof toast === 'function') toast('Geocerca guardada', 'success');
            if (msg) msg.textContent = 'Guardado';
        } catch (e) {
            if (typeof toast === 'function') toast(e.message || 'Error', 'error');
        }
    });
}
