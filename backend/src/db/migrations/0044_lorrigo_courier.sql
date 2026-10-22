-- Lorrigo (app.lorrigo.com) courier aggregator: provider, its bookable courier services, and the ids needed to talk to its API.
-- Services come from GET /couriers (reverse/RVP and Ecom Express excluded). The provider is live but nothing is offered to a seller
-- until an admin gives that seller access and a rate card for these services, so no real bookings can happen by accident.
ALTER TABLE courier_services ADD COLUMN external_service_id text;
ALTER TABLE shipments ADD COLUMN provider_shipment_id text;

-- One Lorrigo pickup address (hub) per NEXGO warehouse, created on the first booking from that warehouse.
CREATE TABLE courier_pickup_hubs (
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  external_hub_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, provider_id)
);
ALTER TABLE courier_pickup_hubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY courier_pickup_hubs_tenant_scope ON courier_pickup_hubs USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse)
VALUES ('lorrigo', 'Lorrigo', 'live', true, false) ON CONFLICT (code) DO NOTHING;

INSERT INTO courier_services (provider_id, code, display_name, service_type, service_provider, external_service_id)
SELECT p.id, v.code, v.display_name, v.service_type, 'Lorrigo', v.external_service_id
FROM courier_providers p, (VALUES
    ('amazon-cod-surface-0-5-kg', 'Amazon COD surface 0.5 kg', 'surface', 'cme2svwvy0122og561oaz2lr4'),
    ('amazon-prepaid-surface-0-5-kg', 'Amazon Prepaid surface 0.5 kg', 'surface', 'cme2svwrr0120og565fq3618n'),
    ('bluedart-air-0-5kg', 'Bluedart air 0.5kg', 'air', 'cmmch4q92019lneno2an10eh3'),
    ('bluedart-express-flat-0-5-kg', 'Bluedart Express Flat 0.5 Kg', 'air', 'cmpe03eb614nwne2eq82fcn55'),
    ('bluedart-surface-0-5-kg', 'Bluedart Surface 0.5 kg', 'surface', 'cmlrrn0gv0i2snesgb3peogh2'),
    ('delhivery-air-0-5-kg', 'Delhivery air 0.5 kg', 'air', 'cme2svx040124og56d3co574d'),
    ('delhivery-surface-0-5-kg', 'Delhivery surface 0.5 kg', 'surface', 'cme8lu44m0065jso4ddig389c'),
    ('delhivery-surface-0-5-kg-flat', 'Delhivery Surface 0.5 Kg Flat', 'surface', 'cmqrpapva0b6wneqx7mjsrqbi'),
    ('delhivery-surface-5-kg', 'Delhivery surface 5 kg', 'surface', 'cme8ltl7e002njso4882og9g1'),
    ('dtdc-surface-2-kg', 'DTDC surface 2 kg', 'surface', 'cme2svyzh0132og56zj702dat'),
    ('ekart-surface-0-5-kg', 'Ekart surface 0.5 kg', 'surface', 'cme2svwnj011yog561vgipnkb'),
    ('xpressbees-surface-0-5-kg', 'Xpressbees surface 0.5 kg', 'surface', 'cme2svwj8011wog565ckt3p8q'),
    ('xpressbees-surface-1-kg', 'Xpressbees Surface 1 kg', 'surface', 'cme2svxgx012cog56vapprd1k'),
    ('xpressbees-surface-5-kg', 'Xpressbees Surface 5 kg', 'surface', 'cme2svxl4012eog56jore4hbv')
) AS v(code, display_name, service_type, external_service_id)
WHERE p.code = 'lorrigo'
ON CONFLICT (provider_id, code) DO UPDATE SET external_service_id = EXCLUDED.external_service_id;
