-- Admin password recovery: a short-lived, e-mailed temporary password. It never replaces the real password (so a stranger
-- asking for a reset cannot lock an admin out) and signing in with it opens no session: it only hands out a one-time
-- reset token so the admin can choose their own password.
CREATE TABLE admin_temp_passwords (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
