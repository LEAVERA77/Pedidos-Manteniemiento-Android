import { tableHasColumn } from "./tenantScope.js";

/**
 * WHERE para export / lecturas API de `socios_catalogo`: tenant de sesión y línea de negocio
 * cuando `req.businessTypeFilterEnabled` (misma regla que pedidos vía businessContext).
 * made by leavera77
 */
export async function sociosCatalogoWhereForApi(req) {
    const params = [];
    const parts = [];
    const hasT = await tableHasColumn("socios_catalogo", "tenant_id");
    if (hasT) {
        const tid = Number(req?.tenantId);
        if (Number.isFinite(tid) && tid > 0) {
            params.push(tid);
            parts.push(`tenant_id = $${params.length}`);
        } else {
            parts.push("FALSE");
        }
    }
    const hasBt = await tableHasColumn("socios_catalogo", "business_type");
    if (hasBt && req?.businessTypeFilterEnabled && req?.activeBusinessType) {
        const bt = String(req.activeBusinessType).trim().toLowerCase();
        if (["electricidad", "agua", "municipio"].includes(bt)) {
            params.push(bt);
            parts.push(
                `(business_type = $${params.length} OR business_type IS NULL OR TRIM(COALESCE(business_type::text, '')) = '')`
            );
        }
    }
    if (!parts.length) return { where: "", params: [] };
    return { where: ` WHERE ${parts.join(" AND ")}`, params };
}
