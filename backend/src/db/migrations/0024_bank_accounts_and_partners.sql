-- Phase 2: Bank Accounts & Marketplace Partners

-- Extract bank account data from seller_kyc to dedicated table for better management
CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  -- Account details
  account_holder_name text NOT NULL CHECK (length(account_holder_name) BETWEEN 2 AND 120),
  account_number_encrypted bytea NOT NULL,
  ifsc_code text NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name text NOT NULL,
  branch_name text,
  account_type text CHECK (account_type IN ('savings', 'current', 'overdraft')),
  
  -- Verification
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'rejected')),
  verified_at timestamptz,
  verification_method text CHECK (verification_method IN ('penny_drop', 'manual', 'document')),
  verification_reference text,
  
  -- Primary account flag
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Encryption key reference (for account_number_encrypted)
  key_reference text NOT NULL,
  
  -- Additional metadata
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one primary account per seller
CREATE UNIQUE INDEX bank_accounts_one_primary ON bank_accounts (seller_id) WHERE is_primary = true;

CREATE INDEX bank_accounts_seller_lookup ON bank_accounts (seller_id, is_active, is_primary);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_tenant_scope ON bank_accounts 
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Migrate existing bank account data from seller_kyc (if any)
INSERT INTO bank_accounts (
  seller_id, 
  account_holder_name, 
  account_number_encrypted, 
  ifsc_code, 
  bank_name,
  verification_status,
  is_primary,
  key_reference
)
SELECT 
  k.seller_id,
  COALESCE(k.bank_account_holder, sl.legal_name) AS account_holder_name,
  k.bank_account_number_encrypted,
  k.bank_ifsc,
  CASE 
    WHEN k.bank_ifsc IS NOT NULL THEN substring(k.bank_ifsc from 1 for 4)
    ELSE 'UNKNOWN'
  END AS bank_name,
  CASE 
    WHEN k.status = 'verified' THEN 'verified'
    ELSE 'pending'
  END AS verification_status,
  true AS is_primary,
  k.key_reference
FROM seller_kyc k
JOIN sellers sl ON sl.id = k.seller_id
WHERE k.bank_account_number_encrypted IS NOT NULL 
  AND k.bank_ifsc IS NOT NULL
  AND k.key_reference IS NOT NULL
ON CONFLICT DO NOTHING;

-- Link COD remittance cycles to bank accounts
ALTER TABLE cod_remittance_cycles ADD COLUMN bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX cod_remittance_bank_lookup ON cod_remittance_cycles (bank_account_id, status);

-- Update existing COD cycles to link to primary bank account
UPDATE cod_remittance_cycles crc
SET bank_account_id = ba.id
FROM bank_accounts ba
WHERE ba.seller_id = crc.seller_id 
  AND ba.is_primary = true
  AND crc.bank_account_id IS NULL;

-- ============================================================================
-- MARKETPLACE PARTNERS & DROPSHIPPING
-- ============================================================================

-- Partner status enum
CREATE TYPE partner_status_enum AS ENUM (
  'onboarding',    -- Initial setup in progress
  'active',        -- Actively sending orders
  'suspended',     -- Temporarily disabled
  'terminated'     -- Permanently ended
);

-- Marketplace partners table (for dropshipping)
CREATE TABLE marketplace_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Partner identification
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  legal_name text,
  
  -- Contact information
  contact_person text,
  contact_email text CHECK (contact_email ~ '^[^@]+@[^@]+\.[^@]+$'),
  contact_phone text,
  
  -- Business details
  gstin text CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  
  -- Status and settings
  status partner_status_enum NOT NULL DEFAULT 'onboarding',
  onboarded_at timestamptz,
  suspended_at timestamptz,
  terminated_at timestamptz,
  
  -- Commission and pricing
  commission_percentage numeric(5,2) CHECK (commission_percentage BETWEEN 0 AND 100),
  fulfillment_fee_paise integer DEFAULT 0 CHECK (fulfillment_fee_paise >= 0),
  
  -- Integration settings
  api_key_hash text,
  webhook_url text,
  webhook_secret text,
  
  -- Additional metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (status <> 'active' OR onboarded_at IS NOT NULL),
  CHECK (status <> 'suspended' OR suspended_at IS NOT NULL),
  CHECK (status <> 'terminated' OR terminated_at IS NOT NULL)
);

CREATE INDEX marketplace_partners_status_idx ON marketplace_partners (status, name);
CREATE INDEX marketplace_partners_code_lookup ON marketplace_partners (code) WHERE status = 'active';

-- Partner-seller relationships (which sellers fulfill for which partners)
CREATE TABLE partner_seller_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES marketplace_partners(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  -- Mapping configuration
  is_active boolean NOT NULL DEFAULT true,
  auto_accept_orders boolean NOT NULL DEFAULT false,
  
  -- Product catalog mapping
  sku_prefix text,  -- Partner SKU prefix that maps to this seller
  
  -- Financial terms specific to this seller
  custom_commission_percentage numeric(5,2) CHECK (custom_commission_percentage BETWEEN 0 AND 100),
  custom_fulfillment_fee_paise integer CHECK (custom_fulfillment_fee_paise >= 0),
  
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  
  UNIQUE (partner_id, seller_id)
);

CREATE INDEX partner_seller_active_idx ON partner_seller_mappings (partner_id, is_active);
CREATE INDEX seller_partner_active_idx ON partner_seller_mappings (seller_id, is_active);

ALTER TABLE partner_seller_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_seller_tenant_scope ON partner_seller_mappings 
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Add partner reference to orders table
ALTER TABLE orders ADD COLUMN partner_id uuid REFERENCES marketplace_partners(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN partner_order_reference text;
ALTER TABLE orders ADD COLUMN partner_commission_paise integer CHECK (partner_commission_paise >= 0);
ALTER TABLE orders ADD COLUMN partner_fulfillment_fee_paise integer CHECK (partner_fulfillment_fee_paise >= 0);

CREATE INDEX orders_partner_lookup ON orders (partner_id, created_at DESC) WHERE order_flow = 'dropship';
CREATE INDEX orders_partner_reference_lookup ON orders (partner_id, partner_order_reference) WHERE partner_order_reference IS NOT NULL;

-- Add constraint to ensure dropship orders have partner
ALTER TABLE orders ADD CONSTRAINT orders_dropship_partner_check 
  CHECK (order_flow <> 'dropship' OR partner_id IS NOT NULL);

-- Partner order statistics view
CREATE VIEW partner_order_stats AS
SELECT 
  p.id AS partner_id,
  p.code AS partner_code,
  p.name AS partner_name,
  p.status,
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.state = 'new') AS new_orders,
  COUNT(o.id) FILTER (WHERE o.state = 'ready_to_ship') AS ready_orders,
  COUNT(o.id) FILTER (WHERE o.state = 'booked') AS shipped_orders,
  COUNT(o.id) FILTER (WHERE o.state = 'cancelled') AS cancelled_orders,
  SUM(o.total_paise) AS total_order_value_paise,
  SUM(o.partner_commission_paise) AS total_commission_paise,
  SUM(o.partner_fulfillment_fee_paise) AS total_fulfillment_fee_paise,
  MAX(o.created_at) AS last_order_at
FROM marketplace_partners p
LEFT JOIN orders o ON o.partner_id = p.id
WHERE o.order_flow = 'dropship' OR o.order_flow IS NULL
GROUP BY p.id, p.code, p.name, p.status;

COMMENT ON VIEW partner_order_stats IS 'Marketplace partner order statistics for admin dashboard';

-- Insert some common partners (examples)
INSERT INTO marketplace_partners (code, name, legal_name, status, onboarded_at, commission_percentage, fulfillment_fee_paise) VALUES
  ('nestasia', 'Nestasia', 'Nestasia Home Decor Pvt Ltd', 'active', now(), 15.00, 0),
  ('pepperfry', 'Pepperfry', 'Pepperfry Limited', 'active', now(), 12.00, 0),
  ('tatacliq', 'Tata CLiQ', 'Tata UniStore Limited', 'active', now(), 18.00, 0)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE marketplace_partners IS 'Marketplace and dropshipping partners who send orders to sellers';
COMMENT ON TABLE partner_seller_mappings IS 'Defines which sellers fulfill orders for which marketplace partners';
COMMENT ON TABLE bank_accounts IS 'Seller bank accounts for COD remittance and payouts';
