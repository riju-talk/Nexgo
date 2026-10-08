-- New enum values must be committed before use, so they get their own migration (applied before 0025_shipment_enhancements_sla.sql).
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'pickup_pending';
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'pickup_scheduled';
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'rto_in_transit';
