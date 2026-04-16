import { loadTenantBusinessContext } from "../utils/businessScope.js";

/**
 * Tras `authMiddleware`: fija `req.activeBusinessType` y `req.businessTypeFilterEnabled`.
 */
export async function businessContextMiddleware(req, res, next) {
  if (req.tenantId == null || !Number.isFinite(Number(req.tenantId))) {
    return next();
  }
  try {
    const ctx = await loadTenantBusinessContext(Number(req.tenantId));
    req.activeBusinessType = ctx.activeBusinessType;
    req.businessTypeFilterEnabled = ctx.businessTypeFilterEnabled;
  } catch (e) {
    req.activeBusinessType = "electricidad";
    req.businessTypeFilterEnabled = false;
  }
  next();
}
