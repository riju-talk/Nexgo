-- Seller files (invoice logo/signature, KYC documents) live in object storage; this table is the index.
CREATE TABLE seller_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('logo', 'signature', 'kyc_pan', 'kyc_aadhaar', 'kyc_gst', 'kyc_bank')),
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_files_lookup ON seller_files (seller_id, purpose, created_at DESC);
ALTER TABLE seller_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_files_tenant_scope ON seller_files USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Scheduled email reports (Control Tower > Email scheduler). Delivery needs an email provider.
CREATE TABLE email_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('pickup_pending', 'delivery', 'delivery_failed')),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  run_times text[] NOT NULL CHECK (cardinality(run_times) BETWEEN 1 AND 6),
  from_days_ago smallint CHECK (from_days_ago BETWEEN 0 AND 365),
  to_days_ago smallint CHECK (to_days_ago BETWEEN 0 AND 365),
  to_emails text[] NOT NULL CHECK (cardinality(to_emails) BETWEEN 1 AND 20),
  cc_emails text[] NOT NULL DEFAULT '{}',
  bcc_emails text[] NOT NULL DEFAULT '{}',
  status_filter text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_days_ago IS NULL OR to_days_ago IS NULL OR from_days_ago >= to_days_ago)
);
CREATE INDEX email_schedules_seller ON email_schedules (seller_id, created_at);
ALTER TABLE email_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_schedules_tenant_scope ON email_schedules USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
