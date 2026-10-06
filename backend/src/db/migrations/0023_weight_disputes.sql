-- Phase 1: Weight Dispute Management System

-- Weight dispute status enum
CREATE TYPE dispute_status_enum AS ENUM (
  'open',           -- Raised by courier, seller not yet responded
  'disputed',       -- Seller formally disputed with evidence
  'accepted',       -- Seller accepted the charge
  'won',            -- Seller won the dispute, amount released
  'lost',           -- Seller lost the dispute, amount deducted
  'withdrawn'       -- Seller withdrew the dispute
);

-- Weight disputes table
CREATE TABLE weight_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  
  -- Weight information
  declared_weight_g integer NOT NULL CHECK (declared_weight_g > 0),
  billed_weight_g integer NOT NULL CHECK (billed_weight_g > 0),
  difference_g integer GENERATED ALWAYS AS (billed_weight_g - declared_weight_g) STORED,
  
  -- Financial impact
  original_charge_paise integer NOT NULL CHECK (original_charge_paise >= 0),
  disputed_charge_paise integer NOT NULL CHECK (disputed_charge_paise >= 0),
  additional_charge_paise integer GENERATED ALWAYS AS (disputed_charge_paise - original_charge_paise) STORED,
  held_amount_paise integer NOT NULL CHECK (held_amount_paise >= 0),
  
  -- Dispute lifecycle
  raised_at timestamptz NOT NULL DEFAULT now(),
  raised_by_provider uuid NOT NULL REFERENCES courier_providers(id) ON DELETE RESTRICT,
  dispute_deadline timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  
  status dispute_status_enum NOT NULL DEFAULT 'open',
  
  -- Evidence and resolution
  courier_evidence_document_ids uuid[] DEFAULT ARRAY[]::uuid[],
  seller_evidence_document_ids uuid[] DEFAULT ARRAY[]::uuid[],
  courier_notes text,
  seller_notes text,
  resolution_notes text,
  
  -- Audit trail
  disputed_at timestamptz,
  disputed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CHECK (billed_weight_g > declared_weight_g),
  CHECK (disputed_charge_paise > original_charge_paise),
  CHECK (status <> 'disputed' OR disputed_at IS NOT NULL),
  CHECK (status NOT IN ('won', 'lost', 'accepted', 'withdrawn') OR resolved_at IS NOT NULL),
  
  UNIQUE (shipment_id)
);

-- Indexes for performance
CREATE INDEX weight_disputes_seller_status_idx ON weight_disputes (seller_id, status, raised_at DESC);
CREATE INDEX weight_disputes_deadline_idx ON weight_disputes (seller_id, status, dispute_deadline) 
  WHERE status IN ('open', 'disputed');
CREATE INDEX weight_disputes_provider_idx ON weight_disputes (raised_by_provider, status, raised_at DESC);

-- Row level security
ALTER TABLE weight_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY weight_disputes_tenant_scope ON weight_disputes 
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Status transition history
CREATE TABLE weight_dispute_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES weight_disputes(id) ON DELETE CASCADE,
  from_status dispute_status_enum,
  to_status dispute_status_enum NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX weight_dispute_history_lookup ON weight_dispute_history (dispute_id, created_at DESC);

-- View for urgent disputes approaching deadline
CREATE VIEW weight_disputes_urgent AS
SELECT 
  wd.*,
  s.awb,
  o.order_number,
  cp.name AS courier_name,
  cs.display_name AS service_name,
  EXTRACT(EPOCH FROM (wd.dispute_deadline - now())) / 86400 AS days_until_deadline,
  CASE 
    WHEN array_length(wd.seller_evidence_document_ids, 1) > 0 THEN true 
    ELSE false 
  END AS has_evidence
FROM weight_disputes wd
JOIN shipments s ON s.id = wd.shipment_id
JOIN orders o ON o.id = s.order_id
JOIN courier_providers cp ON cp.id = wd.raised_by_provider
JOIN courier_services cs ON cs.id = s.service_id
WHERE wd.status IN ('open', 'disputed')
  AND wd.dispute_deadline > now()
ORDER BY wd.dispute_deadline ASC;

COMMENT ON VIEW weight_disputes_urgent IS 'Open weight disputes sorted by deadline urgency for queue display';

-- Aggregate view for dispute summary by courier
CREATE VIEW weight_dispute_summary_by_courier AS
SELECT 
  seller_id,
  raised_by_provider,
  cp.name AS courier_name,
  COUNT(*) FILTER (WHERE status = 'open') AS open_count,
  COUNT(*) FILTER (WHERE status = 'disputed') AS disputed_count,
  COUNT(*) FILTER (WHERE status = 'won') AS won_count,
  COUNT(*) FILTER (WHERE status = 'lost') AS lost_count,
  COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count,
  SUM(held_amount_paise) FILTER (WHERE status IN ('open', 'disputed')) AS total_held_paise,
  SUM(additional_charge_paise) FILTER (WHERE status = 'won') AS total_saved_paise,
  SUM(additional_charge_paise) FILTER (WHERE status IN ('lost', 'accepted')) AS total_cost_paise
FROM weight_disputes wd
JOIN courier_providers cp ON cp.id = wd.raised_by_provider
GROUP BY seller_id, raised_by_provider, cp.name;

COMMENT ON VIEW weight_dispute_summary_by_courier IS 'Weight dispute metrics aggregated by courier for analytics';
