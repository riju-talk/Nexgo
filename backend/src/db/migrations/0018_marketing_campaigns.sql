CREATE TABLE marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  audience text NOT NULL CHECK (char_length(audience) BETWEEN 2 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 2 AND 4000),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'queued', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_campaigns_seller_lookup ON marketing_campaigns (seller_id, channel, created_at DESC);
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_campaigns_tenant_scope ON marketing_campaigns
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
