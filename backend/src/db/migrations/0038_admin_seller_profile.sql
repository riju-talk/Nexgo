-- Admin seller profile (Milestone 1 QA): POC details, debit limit, per-seller pincode blocks, impersonation trail.
ALTER TABLE sellers ADD COLUMN kam_name text;
ALTER TABLE sellers ADD COLUMN account_opened_by text;
ALTER TABLE sellers ADD COLUMN wallet_debit_limit_paise bigint NOT NULL DEFAULT 0 CHECK (wallet_debit_limit_paise >= 0);
ALTER TABLE sellers ADD COLUMN wallet_debit_approval_paise bigint NOT NULL DEFAULT 0 CHECK (wallet_debit_approval_paise >= 0);
ALTER TABLE sellers ADD COLUMN wallet_debit_approved_by text;

-- service_id NULL = blocked for every courier of this seller.
CREATE TABLE seller_pincode_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES courier_services(id) ON DELETE CASCADE,
  pincode char(6) NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX seller_pincode_blocks_unique ON seller_pincode_blocks (seller_id, COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid), pincode);
CREATE INDEX seller_pincode_blocks_lookup ON seller_pincode_blocks (seller_id, pincode);

-- A session created by "View as seller". Its writes are audited against the admin.
CREATE TABLE impersonation_sessions (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
