import { it, expect, vi } from 'vitest';
const mockQuery = vi.fn();
vi.mock('../db/neon.js', () => ({ query: (...args) => mockQuery(...args) }));
import { verificarDesafioOtpAdmin } from '../services/adminLoginOtp.js';
it('consume el OTP en una sola operación y evita reutilizarlo', async () => {
  let consumed = false;
  mockQuery.mockImplementation(async sql => {
    if (sql.includes('DELETE FROM admin_login_otp WHERE id = $1 AND code_hash = $2')) {
      if (consumed) return { rows: [] };
      consumed = true; return { rows: [{ user_id: 8 }] };
    }
    return { rows: [] };
  });
  expect(await verificarDesafioOtpAdmin('challenge', '123456')).toEqual({ user_id: 8 });
  expect(await verificarDesafioOtpAdmin('challenge', '123456')).toBe(null);
  const deletion = mockQuery.mock.calls.find(([sql]) => sql.includes('RETURNING user_id'));
  expect(deletion[0]).toContain('expires_at > NOW()');
  expect(deletion[1][1]).not.toBe('123456');
});
