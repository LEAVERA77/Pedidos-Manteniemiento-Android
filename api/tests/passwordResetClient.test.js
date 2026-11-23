import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const frontPath = existsSync(resolve("../app.js"))
  ? resolve("../app.js") : resolve("../app/src/main/assets/app.js");
const source = readFileSync(frontPath, "utf8");
const start = source.indexOf("async function pasoResetPw() {");
const end = source.indexOf("\nwindow.pasoResetPw = pasoResetPw;", start);
if (start < 0 || end < 0) throw new Error("No se encontró la función de recuperación");
const fn = source.slice(start, end);

function setup(api, responses = []) {
  const elements = {
    "reset-msg": { textContent: "", style: {} },
    "btn-reset-pw": { style: {} },
    "reset-email": { value: "admin" },
    "reset-codigo": { value: "123456" },
    "reset-nueva-pw": { value: "ClaveSegura2026" },
    "reset-codigo-wrap": { style: {} },
  };
  const fetch = vi.fn(async () => responses.shift());
  const sqlSimple = vi.fn(() => { throw new Error("No debe ejecutar SQL de recuperación"); });
  const ctx = vm.createContext({
    document: { getElementById: (id) => elements[id] }, fetch, sqlSimple,
    getApiBaseUrl: () => api, apiUrl: (url) => url, tenantIdActual: () => 1,
    _normalizarCodigoResetPw: (s) => s, _errMsg: (e) => e.message,
  });
  vm.runInContext(`let _resetPaso = 1; let _resetTargetUserId = null; ${fn}`, ctx);
  return { ctx, elements, fetch, sqlSimple };
}

describe("Recuperación en cliente", () => {
  it("sin API informa el problema y no usa SQL ni expone un código", async () => {
    const c = setup("");
    await c.ctx.pasoResetPw();
    expect(c.elements["reset-msg"].textContent).toContain("requiere conexión");
    expect(c.fetch).not.toHaveBeenCalled();
    expect(c.sqlSimple).not.toHaveBeenCalled();
  });

  it("envía el identificador devuelto por la API al confirmar", async () => {
    const c = setup("https://api.example.test", [
      { ok: true, json: async () => ({ ok: true, user_id: 7 }) },
      { ok: true, json: async () => ({ ok: true }) },
    ]);
    await c.ctx.pasoResetPw();
    await c.ctx.pasoResetPw();
    const sent = JSON.parse(c.fetch.mock.calls[1][1].body);
    expect(sent.user_id).toBe(7);
    expect(sent.codigo).toBe("123456");
    expect(c.sqlSimple).not.toHaveBeenCalled();
    expect(c.elements["reset-msg"].textContent).toContain("Contraseña actualizada");
  });
});
