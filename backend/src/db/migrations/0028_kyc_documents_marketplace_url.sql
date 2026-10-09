-- KYC: Aadhaar is collected as last-4 only (never the full number), and GST can be marked not applicable.
ALTER TABLE seller_kyc ADD COLUMN aadhaar_last4 char(4) CHECK (aadhaar_last4 ~ '^[0-9]{4}$');
ALTER TABLE seller_kyc ADD COLUMN gst_applicable boolean NOT NULL DEFAULT true;
ALTER TABLE seller_kyc ADD COLUMN pan_holder_name text;

-- Marketplace connections remember the storefront URL.
ALTER TABLE channel_connections ADD COLUMN store_url text CHECK (store_url IS NULL OR store_url ~* '^https?://[^\s]+$');
