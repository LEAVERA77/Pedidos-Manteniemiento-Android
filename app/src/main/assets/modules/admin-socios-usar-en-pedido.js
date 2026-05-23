/**
 * Desde Admin → Socios: cargar socio/vecino en el modal de pedido nuevo (#pm) del mapa.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { esc } from './utils.js';
import { aplicarPadronAlPedidoNuevo } from './padron-aplicar-a-pedido-nuevo.js';

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 *   normalizarRubroEmpresa: () => string|null,
 *   esCooperativaElectricaRubro: () => boolean,
 *   esMunicipioRubro: () => boolean,
 *   esCooperativaAguaRubro: () => boolean,
 *   ensureDistribuidoresCargados?: () => Promise<void>,
 *   neonOk: () => boolean,
 * }} deps
 */
export function installAdminSociosUsarEnPedido(deps) {
    window.usarSocioEnPedidoNuevo = async function usarSocioEnPedidoNuevo(socioId, padronSource) {
        const pm = document.getElementById('pm');
        if (!pm) {
            toast('No se encontró el formulario de pedido en el mapa', 'error');
            return;
        }
        if (!pm.classList.contains('active')) {
            toast('Primero abrí un pedido nuevo en el mapa (tocá el mapa o «Nuevo pedido»)', 'warning', 5000);
            return;
        }
        if (!deps.neonOk()) {
            toast('Se requiere conexión a la base', 'error');
            return;
        }
        const sid = Number(socioId);
        const src = padronSource === 'clientes_finales' ? 'clientes_finales' : 'socios_catalogo';
        if (!Number.isFinite(sid) || sid <= 0) return;

        let row = null;
        try {
            if (src === 'clientes_finales') {
                const tid = deps.tenantIdActual();
                const r = await deps.sqlSimple(
                    `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
                     FROM clientes_finales
                     WHERE id = ${esc(sid)} AND cliente_id = ${esc(tid)} AND COALESCE(activo, TRUE) = TRUE
                     LIMIT 1`
                );
                const db = r.rows?.[0];
                if (db) {
                    row = {
                        nombre: [db.nombre, db.apellido]
                            .map((x) => (x != null ? String(x).trim() : ''))
                            .filter(Boolean)
                            .join(' '),
                        nis: db.nis,
                        medidor: db.medidor,
                        nis_medidor: db.medidor || db.nis || db.numero_cliente,
                        numero_cliente: db.numero_cliente,
                        calle: db.calle,
                        numero: db.numero_puerta,
                        localidad: db.localidad,
                        barrio: db.barrio,
                        telefono: db.telefono,
                    };
                }
            } else {
                const hasT = await deps.sociosCatalogoTieneTenantId();
                const wf = hasT ? ` AND tenant_id = ${esc(deps.tenantIdActual())}` : '';
                const r = await deps.sqlSimple(
                    `SELECT id, nombre, nis, medidor, nis_medidor, calle, numero, localidad, barrio, telefono,
                            transformador, distribuidor_codigo, tipo_conexion, fases
                     FROM socios_catalogo WHERE id = ${esc(sid)}${wf} LIMIT 1`
                );
                row = r.rows?.[0] || null;
            }
        } catch (e) {
            toast('No se pudo leer el padrón', 'error');
            return;
        }
        if (!row) {
            toast('Socio no encontrado', 'warning');
            return;
        }

        try {
            await aplicarPadronAlPedidoNuevo(deps, row);
            toast('Datos cargados en el pedido del mapa', 'success');
            try {
                document.getElementById('pm')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (_) {}
        } catch (e) {
            console.warn('[usarSocioEnPedido]', e?.message || e);
            toast('No se pudieron aplicar los datos al pedido', 'error');
        }
    };
}
