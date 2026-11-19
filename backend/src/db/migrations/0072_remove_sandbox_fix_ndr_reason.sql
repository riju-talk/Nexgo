-- 1. The sandbox (test) courier is removed completely, with the test shipments that were booked on it, so no admin figure counts them.
--    Wallet ledger rows are append-only and stay (they hold no foreign key to shipments).
DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO ids FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE cp.code = 'sandbox';
  IF ids IS NOT NULL THEN
    DELETE FROM manifest_shipments WHERE shipment_id = ANY(ids);
    DELETE FROM weight_disputes WHERE shipment_id = ANY(ids);
    DELETE FROM ndr_cases WHERE shipment_id = ANY(ids);
    DELETE FROM shipments WHERE id = ANY(ids);
  END IF;
  BEGIN
    DELETE FROM seller_courier_access WHERE service_id IN (SELECT cs.id FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.code = 'sandbox');
    DELETE FROM courier_providers WHERE code = 'sandbox';
  EXCEPTION WHEN foreign_key_violation THEN
    -- something else still points at it (a rate card row): keep the provider switched off and hidden instead
    UPDATE courier_services SET is_active = false WHERE provider_id IN (SELECT id FROM courier_providers WHERE code = 'sandbox');
    UPDATE courier_providers SET integration_state = 'disabled' WHERE code = 'sandbox';
  END;
END $$;

-- 2. "Code verified cancellation" was filed as "Payment not ready" because the word "code" contains "cod". It is a customer cancellation.
UPDATE ndr_cases SET ndr_reason = 'refused_delivery'
WHERE ndr_reason = 'payment_not_ready' AND coalesce(reason_detail, courier_notes, '') ~* 'cancel';
