-- Onboarding gate: a seller must accept the platform agreement and submit KYC before creating orders,
-- and have KYC verified by an admin before booking shipments.

-- Who accepted which version of the agreement, and when (evidence for disputes).
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_accepted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS agreement_version text;

-- Identity proof is any verifiable government ID, not only Aadhaar. Only the last 4 characters are stored.
ALTER TABLE seller_kyc
  ADD COLUMN IF NOT EXISTS id_proof_type text NOT NULL DEFAULT 'aadhaar'
    CHECK (id_proof_type IN ('aadhaar', 'passport', 'voter_id', 'driving_licence')),
  ADD COLUMN IF NOT EXISTS id_proof_last4 text;

UPDATE seller_kyc SET id_proof_last4 = aadhaar_last4 WHERE id_proof_last4 IS NULL AND aadhaar_last4 IS NOT NULL;

-- Scans of the ID proof (front / optional back) live in the bucket next to the PAN scan.
ALTER TABLE seller_files DROP CONSTRAINT IF EXISTS seller_files_purpose_check;
ALTER TABLE seller_files ADD CONSTRAINT seller_files_purpose_check CHECK (purpose IN
  ('logo', 'signature', 'kyc_pan', 'kyc_aadhaar', 'kyc_aadhaar_front', 'kyc_aadhaar_back', 'kyc_id_front', 'kyc_id_back', 'kyc_gst', 'kyc_bank'));
