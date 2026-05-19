/**
 * Banner admin calificación baja: polling con marca de agua por fecha_opinion.
 * made by leavera77
 */

let _watermarkIso = null;

export function setOpinionBannerWatermarkIso(iso) {
    _watermarkIso = iso ? new Date(iso).toISOString() : null;
}

export function getOpinionBannerWatermarkIso() {
    return _watermarkIso;
}

/**
 * @param {object} ctx
 * @param {() => boolean} ctx.esAdmin
 * @param {() => boolean} ctx.modoOffline
 * @param {() => boolean} ctx.neonOk
 * @param {() => Promise<string>} ctx.pedidosFiltroTenantSql
 * @param {(sql: string) => Promise<{ rows: object[] }>} ctx.sqlSimple
 * @param {() => number|string} ctx.tenantIdActual
 * @param {(key: string) => Set<string>} ctx.persistedDismissKeys
 * @param {() => Set<string>} ctx.sessionDismissIds
 * @param {() => boolean} [ctx.puedeApiRest]
 */
export async function pollBannerOpinionClienteMejorado(ctx) {
    if (!ctx.esAdmin() || ctx.modoOffline() || !ctx.neonOk()) return;
    const box = document.getElementById('admin-banner-opinion-cliente');
    if (!box) return;
    try {
        const col = await ctx.sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'fecha_opinion_cliente' LIMIT 1`
        );
        if (!col.rows?.length) return;
        const tsql = await ctx.pedidosFiltroTenantSql();
        const wm = _watermarkIso ? new Date(_watermarkIso).toISOString() : null;
        const wmFrag = wm ? ` AND fecha_opinion_cliente > ${ctx.esc ? ctx.esc(wm) : `'${wm.replace(/'/g, "''")}'`}` : '';
        const r = await ctx.sqlSimple(
            `SELECT id, numero_pedido, tipo_trabajo, opinion_cliente, fecha_opinion_cliente,
                    telefono_contacto, opinion_cliente_estrellas
             FROM pedidos
             WHERE fecha_opinion_cliente IS NOT NULL
             AND opinion_cliente_estrellas IS NOT NULL
             AND opinion_cliente_estrellas < 3
             AND COALESCE(opinion_banner_admin_descartado, FALSE) = FALSE
             ${wmFrag}
             ${tsql}
             ORDER BY fecha_opinion_cliente DESC LIMIT 1`
        );
        const row = r.rows?.[0];
        if (!row) {
            if (box.dataset.visible === '1') {
                box.style.display = 'none';
                delete box.dataset.visible;
                delete box.dataset.pedidoId;
            }
            return;
        }
        const nid = Number(row.id);
        const dismissKey = `${ctx.tenantIdActual()}:${nid}`;
        if (ctx.persistedDismissKeys().has(dismissKey)) return;
        if (ctx.sessionDismissIds().has(String(nid))) return;

        const fop = row.fecha_opinion_cliente;
        const opin = String(row.opinion_cliente || '').trim();
        const snip = opin.length > 140 ? `${opin.slice(0, 137)}…` : opin;
        const estrellas = Number(row.opinion_cliente_estrellas);
        const txt = document.getElementById('admin-banner-opinion-cliente-txt');
        const btnHc = document.getElementById('admin-banner-opinion-hc');
        const wTel = typeof ctx.normalizarTel === 'function' ? ctx.normalizarTel(row.telefono_contacto || '') : '';
        const waOk = /^\+\d{8,22}$/.test(wTel);
        if (btnHc) {
            const apiOk = typeof ctx.puedeApiRest === 'function' ? ctx.puedeApiRest() : false;
            btnHc.style.display = estrellas < 3 && apiOk && waOk ? 'inline-flex' : 'none';
        }
        box.dataset.waTelE164 = waOk ? wTel : '';
        box.dataset.estrellasOpinion = String(estrellas);
        if (txt) {
            const np = row.numero_pedido || nid;
            const tit = (row.tipo_trabajo || '').trim();
            txt.textContent = `Calificación baja — conviene hablar con el cliente. Observación · #${np}${tit ? ` · ${tit}` : ''}${snip ? ` — «${snip}»` : ''} · ${estrellas}/5`;
        }
        box.style.display = 'flex';
        box.dataset.visible = '1';
        box.dataset.pedidoId = String(nid);
        if (fop) box.dataset.fechaOpinionIso = new Date(fop).toISOString();
    } catch (e) {
        console.warn('[poll-banner-opinion]', e?.message || e);
    }
}
