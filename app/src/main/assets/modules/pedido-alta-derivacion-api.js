/**
 * Derivación externa vía API al crear un pedido Pendiente (admin).
 * made by leavera77
 */

/**
 * @param {{
 *   url: string,
 *   asegurarJwtApiRest?: () => Promise<unknown>,
 *   getToken?: () => string | null | undefined,
 *   whatsappTercero: string,
 *   nombreTercero?: string,
 *   motivo?: string,
 *   lat?: unknown,
 *   lng?: unknown,
 * }} p
 */
export async function postDerivarExternoDesdeAltaNuevoPedido(p) {
  const url = String(p?.url || "").trim();
  try {
    if (typeof p.asegurarJwtApiRest === "function") await p.asegurarJwtApiRest();
    const tok = typeof p.getToken === "function" ? String(p.getToken() || "").trim() : "";
    if (!tok || !url) return { ok: false, error: "missing_auth_or_url" };
    const wa = String(p.whatsappTercero || "").trim();
    if (!wa) return { ok: false, error: "missing_whatsapp_tercero" };
    const body = {
      destino: "otro",
      whatsapp_tercero: wa,
      nombre_tercero: String(p.nombreTercero || "").trim() || "Tercero",
      motivo:
        String(p.motivo || "").trim() ||
        "Derivación al dar de alta el pedido desde el panel de administración.",
      desde_alta_pedido_nuevo: true,
    };
    const lx = Number(p.lat);
    const ly = Number(p.lng);
    if (Number.isFinite(lx) && Number.isFinite(ly) && (Math.abs(lx) > 1e-7 || Math.abs(ly) > 1e-7)) {
      body.lat = lx;
      body.lng = ly;
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.error || data.detail || `HTTP ${resp.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
