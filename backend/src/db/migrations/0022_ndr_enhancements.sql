-- Phase 1: NDR Enhancements with attempt tracking, detailed reasons, and SLA deadlines

-- Add structured NDR reason enum
CREATE TYPE ndr_reason_enum AS ENUM (
  'customer_unavailable',
  'address_incomplete',
  'address_incorrect',
  'refused_delivery',
  'payment_not_ready',
  'customer_requested_reschedule',
  'premises_closed',
  'customer_not_contactable',
  'incorrect_product',
  'damaged_product',
  'other'
);

-- Add NDR action enum for resolution tracking
CREATE TYPE ndr_action_enum AS ENUM (
  'reattempt',
  'rto',
  'address_update',
  'customer_contact',
  'delivery_rescheduled',
  'cancelled'
);

-- Enhance ndr_cases table with attempt tracking and SLA
ALTER TABLE ndr_cases ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number BETWEEN 1 AND 3);
ALTER TABLE ndr_cases ADD COLUMN max_attempts integer NOT NULL DEFAULT 3;
ALTER TABLE ndr_cases ADD COLUMN ndr_reason ndr_reason_enum;
ALTER TABLE ndr_cases ADD COLUMN sla_deadline_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');
ALTER TABLE ndr_cases ADD COLUMN resolution_action ndr_action_enum;
ALTER TABLE ndr_cases ADD COLUMN resolution_notes text;
ALTER TABLE ndr_cases ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ndr_cases ADD COLUMN courier_notes text;
ALTER TABLE ndr_cases ADD COLUMN customer_phone text;
ALTER TABLE ndr_cases ADD COLUMN customer_alternate_phone text;

-- Update existing ndr_cases to populate ndr_reason from reason_code
UPDATE ndr_cases SET ndr_reason = 
  CASE 
    WHEN reason_code ILIKE '%unavailable%' THEN 'customer_unavailable'::ndr_reason_enum
    WHEN reason_code ILIKE '%address%' THEN 'address_incomplete'::ndr_reason_enum
    WHEN reason_code ILIKE '%refused%' THEN 'refused_delivery'::ndr_reason_enum
    WHEN reason_code ILIKE '%payment%' THEN 'payment_not_ready'::ndr_reason_enum
    ELSE 'other'::ndr_reason_enum
  END
WHERE ndr_reason IS NULL;

-- Make ndr_reason required after backfill
ALTER TABLE ndr_cases ALTER COLUMN ndr_reason SET NOT NULL;

-- Add index for SLA monitoring
CREATE INDEX ndr_cases_sla_deadline_idx ON ndr_cases (seller_id, state, sla_deadline_at) WHERE state = 'open';
CREATE INDEX ndr_cases_attempt_tracking_idx ON ndr_cases (seller_id, attempt_number, state);

-- NDR attempt history table for tracking all reattempts
CREATE TABLE ndr_attempt_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ndr_case_id uuid NOT NULL REFERENCES ndr_cases(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  ndr_reason ndr_reason_enum NOT NULL,
  courier_notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ndr_attempt_history_case_lookup ON ndr_attempt_history (ndr_case_id, attempt_number DESC);

-- Create view for unactioned NDRs approaching deadline
CREATE VIEW ndr_urgent_cases AS
SELECT 
  nc.*,
  s.awb,
  o.order_number,
  o.cod_amount_paise,
  c.full_name AS customer_name,
  c.city AS customer_city,
  c.pincode AS customer_pincode,
  c.phone AS customer_contact_phone,
  cp.name AS courier_name,
  EXTRACT(EPOCH FROM (nc.sla_deadline_at - now())) / 3600 AS hours_until_deadline
FROM ndr_cases nc
JOIN shipments s ON s.id = nc.shipment_id
JOIN orders o ON o.id = s.order_id
JOIN customers c ON c.id = o.customer_id
JOIN courier_providers cp ON cp.id = s.provider_id
WHERE nc.state = 'open' 
  AND nc.sla_deadline_at > now()
ORDER BY nc.sla_deadline_at ASC;

COMMENT ON VIEW ndr_urgent_cases IS 'Unactioned NDR cases sorted by urgency for dashboard queue display';
