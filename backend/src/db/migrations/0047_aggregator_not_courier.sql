-- Lorrigo is an aggregator (the pipe a booking goes through), not a courier. Couriers (Delhivery, Bluedart, ...) are added by an admin and
-- point at an aggregator; the aggregator's own id for each service is courier_services.external_service_id.
ALTER TABLE courier_providers ADD COLUMN aggregator text CHECK (aggregator IN ('lorrigo'));

-- A pickup address is created once per warehouse per aggregator, shared by every courier that books through it.
ALTER TABLE courier_pickup_hubs ADD COLUMN aggregator text;
UPDATE courier_pickup_hubs SET aggregator = 'lorrigo';
ALTER TABLE courier_pickup_hubs ALTER COLUMN aggregator SET NOT NULL;
ALTER TABLE courier_pickup_hubs DROP COLUMN provider_id; -- also drops the old (warehouse_id, provider_id) key
ALTER TABLE courier_pickup_hubs ADD PRIMARY KEY (warehouse_id, aggregator);

-- Migration 0044 seeded "Lorrigo" as a courier with 14 services. Remove it; if shipments already reference it, hide it instead.
DO $$
BEGIN
  DELETE FROM courier_providers WHERE code = 'lorrigo';
EXCEPTION WHEN foreign_key_violation THEN
  UPDATE courier_providers SET integration_state = 'disabled', aggregator = 'lorrigo' WHERE code = 'lorrigo';
  UPDATE courier_services SET is_active = false WHERE provider_id IN (SELECT id FROM courier_providers WHERE code = 'lorrigo');
END $$;
