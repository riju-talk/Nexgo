-- One unique, human-readable NEXGO code per seller (NXS000001, ...), shown in the admin sellers list.
CREATE SEQUENCE seller_code_seq START 1;
ALTER TABLE sellers ADD COLUMN nexgo_code text NOT NULL DEFAULT ('NXS' || lpad(nextval('seller_code_seq')::text, 6, '0'));
ALTER TABLE sellers ADD CONSTRAINT sellers_nexgo_code_key UNIQUE (nexgo_code);
