-- In-app notifications for sellers: what happened to their parcels, wallet and account, kept so nothing is missed (the bell shows the unread ones).
CREATE TABLE seller_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('delivered', 'rto', 'ndr', 'pickup_missed', 'wallet', 'cod', 'weight', 'kyc', 'ticket', 'batch', 'system')),
  title text NOT NULL,
  body text,
  screen text,            -- the screen id the notification opens (for example 'ndr', 'billing', 'shipments')
  entity_id text,         -- the shipment / order / ticket it is about
  dedupe_key text,        -- the same event is stored once (a webhook retry, a repeated check)
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE UNIQUE INDEX seller_notifications_dedupe ON seller_notifications (seller_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX seller_notifications_recent ON seller_notifications (seller_id, created_at DESC);
CREATE INDEX seller_notifications_unread ON seller_notifications (seller_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE seller_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_notifications_tenant_scope ON seller_notifications USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
