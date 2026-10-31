-- Re-seed the couriers that Lorrigo (aggregator) currently offers, so Admin > Assign courier & rates has couriers to pick.
-- Source: GET https://app.lorrigo.com/api/v2/couriers on 2026-10-31 with our API key (7 active, non-reverse services; Ecom Express/RVP excluded).
-- Each courier points at the aggregator (courier_providers.aggregator='lorrigo'); courier_services.external_service_id is Lorrigo's id.
-- Nothing is offered to a seller until an admin assigns the courier and a rate card. Re-running is safe.
INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse, aggregator)
VALUES
  ('amazon-lorrigo', 'Amazon', 'live', true, false, 'lorrigo'),
  ('delhivery-lorrigo', 'Delhivery', 'live', true, false, 'lorrigo'),
  ('ekart-lorrigo', 'Ekart', 'live', true, false, 'lorrigo'),
  ('shadowfax-lorrigo', 'Shadowfax', 'live', true, false, 'lorrigo'),
  ('xpressbees-lorrigo', 'Xpressbees', 'live', true, false, 'lorrigo')
ON CONFLICT (code) DO NOTHING;

INSERT INTO courier_services (provider_id, code, display_name, service_type, service_provider, external_service_id)
SELECT p.id, v.code, v.display_name, 'surface', 'Lorrigo', v.external_service_id
FROM (VALUES
  ('amazon-lorrigo', 'amazon-surface-0-25-kg', 'Amazon Surface 0.25 kg', 'cme2svzmn013cog5609013n45'),
  ('delhivery-lorrigo', 'delhivery-250-gms', 'Delhivery 250 gms', 'cmrkpryqw0s4aneruiaqwucpn'),
  ('delhivery-lorrigo', 'delhivery-spcl-500-gm', 'Delhivery Spcl 500 gm', 'cmrj2u4xf09oanez0444kap9l'),
  ('ekart-lorrigo', 'ekart-0-5-kg-flat', 'Ekart 0.5 Kg flat', 'cmu8bdxi50050ne5r18oog1x5'),
  ('shadowfax-lorrigo', 'shadowfax-dr', 'Shadowfax DR', 'cmuo9g9qh0001jmp18pl2z5u7'),
  ('xpressbees-lorrigo', 'xpressbees-surface-0-25-kg', 'Xpressbees Surface 0.25 kg', 'cme2svzig013aog569435rk3p'),
  ('xpressbees-lorrigo', 'xpressbees-surface-0-5-kg', 'Xpressbees Surface 0.5 kg', 'cme2svwj8011wog565ckt3p8q')
) AS v(provider_code, code, display_name, external_service_id)
JOIN courier_providers p ON p.code = v.provider_code AND p.aggregator = 'lorrigo'
ON CONFLICT (provider_id, code) DO UPDATE SET external_service_id = EXCLUDED.external_service_id, is_active = true;
