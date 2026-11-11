-- Background cancellation: the page queues the shipments (or never-shipped orders) to cancel and returns at once; the worker cancels them one by one
-- through the same cancelShipment() the single-cancel button uses, so each refund is exact and happens once. The page shows progress by polling.
CREATE TABLE cancel_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  total integer NOT NULL CHECK (total > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX cancel_batches_seller_recent ON cancel_batches (seller_id, created_at DESC);

CREATE TABLE cancel_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES cancel_batches(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('shipment', 'order')),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'ok', 'failed')),
  refunded_paise bigint NOT NULL DEFAULT 0,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  CHECK ((kind = 'shipment' AND shipment_id IS NOT NULL) OR (kind = 'order' AND order_id IS NOT NULL))
);
-- A shipment or order can be waiting in only one batch at a time (a double click never cancels twice).
CREATE UNIQUE INDEX cancel_items_one_active_shipment ON cancel_batch_items (shipment_id) WHERE shipment_id IS NOT NULL AND state IN ('queued', 'running');
CREATE UNIQUE INDEX cancel_items_one_active_order ON cancel_batch_items (order_id) WHERE order_id IS NOT NULL AND state IN ('queued', 'running');
CREATE INDEX cancel_items_queue ON cancel_batch_items (state, seller_id) WHERE state IN ('queued', 'running');
CREATE INDEX cancel_items_batch ON cancel_batch_items (batch_id);

ALTER TABLE cancel_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancel_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancel_batches_tenant_scope ON cancel_batches USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
CREATE POLICY cancel_batch_items_tenant_scope ON cancel_batch_items USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
