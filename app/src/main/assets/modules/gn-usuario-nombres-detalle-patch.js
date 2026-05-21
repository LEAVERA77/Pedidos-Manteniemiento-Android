/**
 * Tras prefetch de nombres, actualiza secciones del detalle (#dm) con nombres resueltos.
 * made by leavera77
 */
import { queryDetalleSection } from './pedido-detalle-shell.js';

/**
 * @param {Record<string, unknown>} p
 * @param {(p: object, d: object) => Record<string, string|boolean>} buildDetalleSections
 * @param {object} deps
 */
export function gnParchAuditoriaDetalleTrasNombres(p, buildDetalleSections, deps) {
    try {
        const sections = buildDetalleSections(p, deps);
        const pairs = [
            ['trabajo', sections.trabajo],
            ['derivacion', sections.derivacion],
            ['auditoria', sections.auditoria],
        ];
        for (const [name, html] of pairs) {
            const el = queryDetalleSection(name);
            if (!el || html == null) continue;
            const next = String(html);
            if (el.innerHTML !== next) el.innerHTML = next;
        }
    } catch (_) {}
}
