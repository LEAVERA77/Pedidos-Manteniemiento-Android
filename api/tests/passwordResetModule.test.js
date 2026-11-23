import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = existsSync(resolve('../modules/recuperar-contrasena-mail.js'))
  ? resolve('../modules/recuperar-contrasena-mail.js')
  : resolve('../app/src/main/assets/modules/recuperar-contrasena-mail.js');
const mod = await import(pathToFileURL(file).href);

function setup(apiBase) {
  const elements = {
    'reset-msg': { textContent: '', style: {} },
    'btn-reset-pw': { style: {}, innerHTML: '' },
    'reset-email': { value: 'administrador' },
    'reset-codigo': { value: '123 456' },
    'reset-nueva-pw': { value: 'clave-segura' },
    'reset-codigo-wrap': { style: {} },
  };
  const sqlSimple = vi.fn();
  const purge = vi.fn();
  vi.stubGlobal('window', { APP_CONFIG: { api: { baseUrl: apiBase } }, _gnTenantId: () => 7, __gnPurgarHuellaGuardadaExplicitamente: purge });
  vi.stubGlobal('document', { getElementById: (id) => elements[id] });
  vi.stubGlobal('fetch', vi.fn());
  mod.initRecuperarContrasenaMail({ sqlSimple });
  window.reiniciarModalResetPwUi();
  elements['reset-codigo'].value = '123 456';
  elements['reset-nueva-pw'].value = 'clave-segura';
  return { elements, sqlSimple, purge };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('módulo alternativo de recuperación', () => {
  it('sin API falla cerrado y no usa SQL, incluso con dependencias heredadas', async () => {
    const c = setup('');
    await window.pasoResetPw();
    expect(c.elements['reset-msg'].textContent).toContain('requiere conexión');
    expect(c.sqlSimple).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('solo usa la API, confirma el usuario y limpia biometría al finalizar', async () => {
    const c = setup('https://api.example.test/');
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user_id: 4 }) });
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await window.pasoResetPw();
    await window.pasoResetPw();
    const [u1, req1] = globalThis.fetch.mock.calls[0];
    const [u2, req2] = globalThis.fetch.mock.calls[1];
    expect(u1).toBe('https://api.example.test/api/auth/password-reset/request');
    expect(JSON.parse(req1.body)).toEqual({ usuario: 'administrador', tenant_id: 7 });
    expect(u2).toContain('/password-reset/confirm');
    expect(JSON.parse(req2.body)).toMatchObject({ user_id: 4, codigo: '123456' });
    expect(c.purge).toHaveBeenCalledTimes(1);
    expect(c.sqlSimple).not.toHaveBeenCalled();
  });
});
