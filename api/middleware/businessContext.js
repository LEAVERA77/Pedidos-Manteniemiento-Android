import { loadTenantBusinessContext } from "../utils/businessScope.js";
import { ensureWhatsappBotActiveTargetSeeded } from "../services/whatsappBotTargetStore.js";

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
    void ensureWhatsappBotActiveTargetSeeded({
      tenantId: Number(req.tenantId),
      businessType: ctx.activeBusinessType,
      source: "business_context_seed",
      userId: req.user?.id ?? null,
    }).catch(() => {});
  } catch (e) {
    req.activeBusinessType = "electricidad";
    req.businessTypeFilterEnabled = false;
  }
  next();
}
