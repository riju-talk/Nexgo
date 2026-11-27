-- The couriers Shiprocket currently offers, so Admin > Assign courier & rates lists them "via shiprocket" next to the Lorrigo ones.
-- Source: GET /v1/admin/aggregators/shiprocket/couriers on the live site on 2026-11-27 (Shiprocket's own courier_company_id as the external id).
-- Nothing is offered to a seller until an admin assigns the courier and a rate card. Re-running is safe.
INSERT INTO courier_aggregators (code, label) VALUES ('shiprocket', 'Shiprocket') ON CONFLICT (code) DO NOTHING;

INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse, aggregator)
VALUES
  ('delhivery-shiprocket', 'Delhivery', 'live', true, false, 'shiprocket'),
  ('dtdc-shiprocket', 'DTDC', 'live', true, false, 'shiprocket')
ON CONFLICT (code) DO NOTHING;

INSERT INTO courier_services (provider_id, code, display_name, service_type, service_provider, external_service_id)
SELECT p.id, v.code, v.display_name, v.service_type, 'Shiprocket', v.external_service_id
FROM (VALUES
  ('delhivery-shiprocket', 'delhivery-surface-43', 'Delhivery Surface', 'surface', '43'),
  ('delhivery-shiprocket', 'delhivery-air-10', 'Delhivery Air', 'air', '10'),
  ('dtdc-shiprocket', 'dtdc-surface-6', 'DTDC Surface', 'surface', '6'),
  ('dtdc-shiprocket', 'dtdc-air-500gm-196', 'DTDC Air 500gm', 'air', '196')
) AS v(provider_code, code, display_name, service_type, external_service_id)
JOIN courier_providers p ON p.code = v.provider_code AND p.aggregator = 'shiprocket'
ON CONFLICT (provider_id, code) DO UPDATE SET external_service_id = EXCLUDED.external_service_id, is_active = true;
