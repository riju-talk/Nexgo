-- Client feedback round 3.

-- Business type "Individual" (a seller who is a person, not a registered entity).
ALTER TABLE seller_kyc DROP CONSTRAINT IF EXISTS seller_kyc_entity_type_check;
ALTER TABLE seller_kyc ADD CONSTRAINT seller_kyc_entity_type_check CHECK (entity_type IN ('individual', 'proprietorship', 'partnership', 'private_limited', 'llp', 'public_limited'));

-- Aadhaar is uploaded as two files, front and back. The old single "kyc_aadhaar" stays valid for documents already on file.
ALTER TABLE seller_files DROP CONSTRAINT IF EXISTS seller_files_purpose_check;
ALTER TABLE seller_files ADD CONSTRAINT seller_files_purpose_check CHECK (purpose IN ('logo', 'signature', 'kyc_pan', 'kyc_aadhaar', 'kyc_aadhaar_front', 'kyc_aadhaar_back', 'kyc_gst', 'kyc_bank'));

-- The courier's sort / routing code, printed on the shipping label when the courier gives one.
ALTER TABLE shipments ADD COLUMN routing_code text;
