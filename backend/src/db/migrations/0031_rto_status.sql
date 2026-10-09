-- RTO sub-status for the RTO dashboard tabs. NULL means "in transit back" (or delivered back when rto_delivered_at is set),
-- so existing RTO shipments keep working without a backfill.
ALTER TABLE shipments ADD COLUMN rto_status text
  CHECK (rto_status IN ('in_transit', 'out_for_delivery', 'delivered', 'lost', 'damaged', 'undelivered'));
CREATE INDEX shipments_rto_lookup ON shipments (seller_id, rto_status) WHERE state = 'rto';
