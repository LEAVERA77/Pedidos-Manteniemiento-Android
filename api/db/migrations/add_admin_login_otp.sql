-- OTP login admin (opcional, ADMIN_2FA_ENABLED=1).
-- made by leavera77

CREATE TABLE IF NOT EXISTS admin_login_otp (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_otp_user_exp
  ON admin_login_otp (user_id, expires_at DESC);
