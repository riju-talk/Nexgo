-- Pickup pending / missed use one definition (lib/metrics.ts). A shipment the courier cancelled on its side is not "pending" any more.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS courier_cancelled_at timestamptz;

-- Every shipment waiting for a pickup gets the standard 24-hour deadline (bookings made from now on set it themselves).
UPDATE shipments SET pickup_deadline_at = booked_at + interval '24 hours'
WHERE pickup_deadline_at IS NULL AND booked_at IS NOT NULL AND state IN ('booked','pickup_pending','pickup_scheduled');

-- Indexes for the dashboard queries. The windows are now written without casts on the column, so these can be used.
CREATE INDEX IF NOT EXISTS shipments_created_idx ON shipments (created_at);
CREATE INDEX IF NOT EXISTS shipments_booked_idx ON shipments (booked_at);
CREATE INDEX IF NOT EXISTS shipments_provider_created_idx ON shipments (provider_id, created_at);
CREATE INDEX IF NOT EXISTS shipments_seller_delivered_idx ON shipments (seller_id, delivered_at) WHERE state = 'delivered';
CREATE INDEX IF NOT EXISTS shipments_pickup_pending_seller_idx ON shipments (seller_id, booked_at) WHERE state IN ('booked','pickup_pending','pickup_scheduled') AND courier_cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_pickup_pending_all_idx ON shipments (booked_at) WHERE state IN ('booked','pickup_pending','pickup_scheduled') AND courier_cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_seller_live_idx ON shipments (seller_id, state) WHERE state IN ('booked','pickup_pending','pickup_scheduled','in_transit','out_for_delivery','ndr');
CREATE INDEX IF NOT EXISTS shipments_seller_rto_idx ON shipments (seller_id, rto_initiated_at DESC) WHERE state IN ('rto','rto_in_transit');
CREATE INDEX IF NOT EXISTS orders_seller_created_idx ON orders (seller_id, created_at DESC);

-- A returned parcel without a start time gets the time it was last updated (once), so the RTO page can filter by India date.
UPDATE shipments SET rto_initiated_at = updated_at WHERE state IN ('rto','rto_in_transit') AND rto_initiated_at IS NULL;
