-- Pickup manifests: the list a courier driver signs when collecting parcels. One manifest = one courier + one pickup address + one day.
-- A shipment can be on one manifest only. How many parcels were collected is read from the shipments themselves, never stored.
CREATE TABLE pickup_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  manifest_no text NOT NULL,
  provider_id uuid NOT NULL REFERENCES courier_providers(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, manifest_no)
);
CREATE INDEX pickup_manifests_seller_recent ON pickup_manifests (seller_id, created_at DESC);

CREATE TABLE pickup_manifest_items (
  manifest_id uuid NOT NULL REFERENCES pickup_manifests(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  PRIMARY KEY (manifest_id, shipment_id),
  UNIQUE (shipment_id)
);
CREATE INDEX pickup_manifest_items_seller ON pickup_manifest_items (seller_id);

ALTER TABLE pickup_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_manifest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pickup_manifests_tenant_scope ON pickup_manifests USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
CREATE POLICY pickup_manifest_items_tenant_scope ON pickup_manifest_items USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
