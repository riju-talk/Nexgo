-- Background courier assignment: the page queues a batch and returns at once; the worker books the orders with a per-seller and a
-- global concurrency limit, so a big batch no longer depends on the browser staying open or on one request finishing in 60 seconds.
CREATE TABLE assign_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  provider_code text,
  service_code text,
  total integer NOT NULL CHECK (total > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX assign_batches_seller_recent ON assign_batches (seller_id, created_at DESC);

CREATE TABLE assign_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES assign_batches(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'ok', 'failed')),
  awb text,
  courier text,
  error text,
  duration_ms integer,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (batch_id, order_id)
);
-- An order can be waiting in only one batch at a time.
CREATE UNIQUE INDEX assign_batch_items_one_active_per_order ON assign_batch_items (order_id) WHERE state IN ('queued', 'running');
CREATE INDEX assign_batch_items_queue ON assign_batch_items (state, seller_id) WHERE state IN ('queued', 'running');

ALTER TABLE assign_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assign_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY assign_batches_tenant_scope ON assign_batches USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
CREATE POLICY assign_batch_items_tenant_scope ON assign_batch_items USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Sandbox courier for test accounts: no aggregator, so it books through the deterministic in-process adapter (instant, no real shipment, no real
-- cost). A seller sees it only when its rate card has rates for it (an admin switches that on per seller).
INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse, aggregator)
SELECT 'sandbox', 'Sandbox courier', 'live', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM courier_providers WHERE code = 'sandbox');
INSERT INTO courier_services (provider_id, code, display_name, service_type, service_provider, external_service_id)
SELECT cp.id, 'sandbox-surface', 'Sandbox Surface (test only)', 'surface', NULL, NULL
FROM courier_providers cp WHERE cp.code = 'sandbox'
  AND NOT EXISTS (SELECT 1 FROM courier_services cs WHERE cs.provider_id = cp.id AND cs.code = 'sandbox-surface');
