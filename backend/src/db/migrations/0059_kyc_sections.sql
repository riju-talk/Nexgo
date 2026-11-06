-- KYC details are saved one section at a time (business, identity, bank), each with its own Save button, so nobody has to fill one
-- long form in a single go. "Submit for verification" assembles the saved sections into the normal seller_kyc row.
CREATE TABLE seller_kyc_sections (
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('business', 'identity', 'bank')),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, section)
);
ALTER TABLE seller_kyc_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_kyc_sections_tenant_scope ON seller_kyc_sections
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
