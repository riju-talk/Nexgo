-- COD remittance rebuilt around the shipment itself: every delivered COD parcel is linked to the payout cycle that pays it.
-- (Before, "already paid" was guessed from date ranges, so a parcel whose delivery scan arrived late could be missed or counted twice.)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cod_cycle_id uuid REFERENCES cod_remittance_cycles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shipments_cod_unsettled_idx ON shipments (seller_id, delivered_at) WHERE state = 'delivered' AND cod_cycle_id IS NULL;
CREATE INDEX IF NOT EXISTS shipments_cod_cycle_idx ON shipments (cod_cycle_id) WHERE cod_cycle_id IS NOT NULL;

-- Existing cycles keep the shipments they were cut from (the old rule: delivery day, UTC date, inside the cycle's range).
UPDATE shipments sh SET cod_cycle_id = c.id
FROM cod_remittance_cycles c, orders o
WHERE o.id = sh.order_id AND o.payment_mode = 'cod' AND sh.state = 'delivered' AND sh.cod_cycle_id IS NULL
  AND c.seller_id = sh.seller_id AND COALESCE(sh.delivered_at, sh.booked_at)::date BETWEEN c.cycle_start AND c.cycle_end;

-- Cycles are generated automatically every day, so a day can get a second cycle (a late delivery scan): the unique date range goes.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'cod_remittance_cycles'::regclass AND contype = 'u' LOOP
    EXECUTE format('ALTER TABLE cod_remittance_cycles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE cod_remittance_cycles ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;
