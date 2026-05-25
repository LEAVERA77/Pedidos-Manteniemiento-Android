/**
 * Tras login por API con contraseña bcrypt, no usar fallback Neon `password_hash = texto plano`.
 * made by leavera77
 */

/**
 * @param {{ status?: number, _loginFailed?: boolean, network?: boolean } | null | undefined} loginApiFallo
 * @param {() => string} getApiBaseUrlFn
 */
export function shouldSkipNeonPlaintextLoginFallback(loginApiFallo, getApiBaseUrlFn) {
  const base = typeof getApiBaseUrlFn === 'function' ? String(getApiBaseUrlFn() || '').trim() : '';
  if (!base) return false;
  if (!loginApiFallo?._loginFailed) return false;
  if (loginApiFallo.network) return false;
  const st = Number(loginApiFallo.status);
  if (st === 401 || st === 403 || st === 400 || st === 409) return true;
  return false;
}
