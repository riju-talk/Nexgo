-- BOOK-001: a durable record of every courier booking in progress, written BEFORE the courier is called and closed only when the outcome is known.
--   started        the courier is being asked right now (or the process died while asking)
--   unknown        the courier did not answer clearly: it may or may not hold the parcel
--   accepted       the courier booked it (AWB known), our shipment + debit are not recorded yet
--   cancel_needed  the courier booked it but NEXGO must not keep it (e.g. no money left): the courier booking still has to be undone
-- Those four are "open": while one exists nothing else may book, edit or cancel the order. The worker resolves them (lib/bookingReconciler.ts).
--   recorded / refused / cancelled   finished; `context` (which holds the customer's details) is cleared.
CREATE TABLE booking_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id uuid,
  aggregator text,
  provider_code text NOT NULL,
  service_code text NOT NULL,
  idempotency_key text NOT NULL,
  state text NOT NULL DEFAULT 'started' CHECK (state IN ('started', 'unknown', 'accepted', 'cancel_needed', 'recorded', 'refused', 'cancelled')),
  awb text,
  provider_shipment_id text,
  routing_code text,
  pickup_hub_id text,
  context json, -- json, NOT jsonb: jsonb reorders keys, and the order reference at the courier is a hash of these details in this order
  error text,
  checks integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One open booking per order, whichever screen, tab, batch or process it came from.
CREATE UNIQUE INDEX booking_attempts_one_open ON booking_attempts (order_id) WHERE state IN ('started', 'unknown', 'accepted', 'cancel_needed');
CREATE INDEX booking_attempts_due ON booking_attempts (next_check_at) WHERE state IN ('started', 'unknown', 'accepted', 'cancel_needed');
CREATE INDEX booking_attempts_order ON booking_attempts (order_id, created_at DESC);
ALTER TABLE booking_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_attempts_tenant_scope ON booking_attempts USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- OPS-001: the process that works the queues says "I am alive" every few seconds, so everybody else can tell when it is not.
CREATE TABLE worker_heartbeats (
  name text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  beat_at timestamptz NOT NULL
);
