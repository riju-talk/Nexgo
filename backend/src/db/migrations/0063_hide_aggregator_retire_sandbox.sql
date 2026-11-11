-- 1. Courier codes lose the aggregator suffix ("delhivery-lorrigo" -> "delhivery"): codes reach sellers' screens and must not name the aggregator.
--    A code is only renamed when the plain code is free. Courier priority lists store courier NAMES, lane refusals and rates use ids, so nothing else changes.
UPDATE courier_providers cp
SET code = regexp_replace(cp.code, '-lorrigo$', '')
WHERE cp.code LIKE '%-lorrigo'
  AND NOT EXISTS (SELECT 1 FROM courier_providers o WHERE o.code = regexp_replace(cp.code, '-lorrigo$', ''));

-- Batches still waiting in the assignment queue carry the courier code the seller picked.
UPDATE assign_batches SET provider_code = regexp_replace(provider_code, '-lorrigo$', '') WHERE provider_code LIKE '%-lorrigo';

-- 2. The test (sandbox) courier is retired: it can no longer be quoted or booked. History (shipments already booked with it) stays readable.
UPDATE courier_services SET is_active = false WHERE provider_id IN (SELECT id FROM courier_providers WHERE code = 'sandbox');
UPDATE courier_providers SET integration_state = 'disabled' WHERE code = 'sandbox';
DELETE FROM seller_courier_access WHERE service_id IN (SELECT cs.id FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.code = 'sandbox');
