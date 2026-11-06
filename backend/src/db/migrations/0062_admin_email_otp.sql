-- Admins created through the admin API sign in with their password AND a 6-digit code e-mailed to them.
-- Existing admins are not affected (the column defaults to false).
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS email_otp_required boolean NOT NULL DEFAULT false;

-- One live code per admin. Only a hash of the code is stored; it expires, and is locked after too many wrong tries.
CREATE TABLE IF NOT EXISTS admin_email_otps (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  token_hash text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
