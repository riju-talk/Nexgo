-- Courier aggregators become plugins (backend/src/couriers/aggregators/<id>): the database no longer hard-codes 'lorrigo'.

-- 1. The CHECK that only allowed 'lorrigo' goes (whatever it was called); a lookup table replaces it so a new aggregator needs no migration.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'courier_providers'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%aggregator%'
  LOOP EXECUTE format('ALTER TABLE courier_providers DROP CONSTRAINT %I', c); END LOOP;
END $$;

CREATE TABLE courier_aggregators (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9-]{2,40}$'),
  label text NOT NULL
);
-- The application also upserts a row for every plugin at start-up; this one keeps existing couriers valid from the first moment.
INSERT INTO courier_aggregators (code, label) VALUES ('lorrigo', 'Lorrigo');
ALTER TABLE courier_providers ADD CONSTRAINT courier_providers_aggregator_fk FOREIGN KEY (aggregator) REFERENCES courier_aggregators (code);

-- 2. API keys / tokens entered on the admin Integrations page, encrypted by the application (AES-GCM, like channel_connections).
--    Empty = the server environment (LORRIGO_API_KEY ...) is used, so existing deployments keep working.
CREATE TABLE aggregator_credentials (
  aggregator text PRIMARY KEY REFERENCES courier_aggregators (code),
  encrypted_credentials bytea NOT NULL,
  key_reference text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
