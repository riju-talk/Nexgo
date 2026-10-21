-- COD order confirmation: one record per COD order, created when the seller has the feature on for the order's channel.
-- The customer's answer (confirm / decline) arrives from the IVR or WhatsApp provider once one is connected, or is recorded by hand.
CREATE TABLE cod_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  channel text NOT NULL, message text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'confirmed', 'declined')),
  queued_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz, responded_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX cod_confirmations_seller ON cod_confirmations (seller_id, state, queued_at DESC);
ALTER TABLE cod_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cod_confirmations_tenant_scope ON cod_confirmations USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
