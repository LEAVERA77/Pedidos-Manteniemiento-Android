/**
 * Exportar auditoría operativa a CSV (admin).
 * made by leavera77
 */

function escCsv(v) {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return `"${s}"`;
}

export async function exportarAuditoriaOperativaCsv({ apiUrl, getApiToken, limit = 200 }) {
    const tok = getApiToken?.();
    if (!tok) throw new Error('Sin sesión');
    const r = await fetch(apiUrl(`/api/admin/operacion-audit?limit=${limit}`), {
        headers: { Authorization: `Bearer ${tok}` },
        cache: 'no-store',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    const rows = data.registros || [];
    const header = ['fecha', 'pedido_id', 'usuario', 'accion', 'estado_anterior', 'estado_nuevo'];
    const lines = [
        header.join(','),
        ...rows.map((row) =>
            [
                escCsv(row.created_at),
                escCsv(row.pedido_id),
                escCsv(row.usuario_nombre || row.usuario_email),
                escCsv(row.accion),
                escCsv(row.estado_anterior),
                escCsv(row.estado_nuevo),
            ].join(',')
        ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auditoria-operativa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export function wireExportAuditoriaButton(host) {
    if (!host || host.dataset.gnAuditExportWired === '1') return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin:.35rem 0 .65rem;font-size:.75rem';
    btn.innerHTML = '<i class="fas fa-file-csv"></i> Exportar CSV';
    btn.addEventListener('click', async () => {
        try {
            await exportarAuditoriaOperativaCsv({
                apiUrl: window.apiUrl,
                getApiToken: window.getApiToken,
            });
            window.toast?.('CSV descargado', 'ok');
        } catch (e) {
            window.toast?.(e.message || 'Error al exportar', 'err');
        }
    });
    host.prepend(btn);
    host.dataset.gnAuditExportWired = '1';
}
