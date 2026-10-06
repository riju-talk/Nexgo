-- Phase 3: Shipment State Enhancements & SLA Tracking

-- Add missing shipment states to match frontend PIPELINE
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'pickup_pending';
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'pickup_scheduled';
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'rto_in_transit';

-- Note: Can't reorder enum values, so new values append to the end
-- Frontend will handle display order

-- Add SLA and promise tracking to shipments
ALTER TABLE shipments ADD COLUMN promised_delivery_at timestamptz;
ALTER TABLE shipments ADD COLUMN pickup_scheduled_at timestamptz;
ALTER TABLE shipments ADD COLUMN pickup_completed_at timestamptz;
ALTER TABLE shipments ADD COLUMN pickup_deadline_at timestamptz;
ALTER TABLE shipments ADD COLUMN delivered_at timestamptz;
ALTER TABLE shipments ADD COLUMN rto_initiated_at timestamptz;
ALTER TABLE shipments ADD COLUMN rto_delivered_at timestamptz;

-- Add route information
ALTER TABLE shipments ADD COLUMN origin_pincode text CHECK (origin_pincode ~ '^\d{6}$');
ALTER TABLE shipments ADD COLUMN destination_pincode text CHECK (destination_pincode ~ '^\d{6}$');
ALTER TABLE shipments ADD COLUMN origin_city text;
ALTER TABLE shipments ADD COLUMN destination_city text;

-- Add service categorization
ALTER TABLE shipments ADD COLUMN service_category text CHECK (service_category IN ('surface', 'air_express', 'hyperlocal'));

-- Update existing shipments to populate route information from warehouse and customer
UPDATE shipments s
SET 
  origin_pincode = w.pincode,
  origin_city = w.city,
  destination_pincode = c.pincode,
  destination_city = c.city
FROM orders o
JOIN warehouses w ON w.id = o.warehouse_id
JOIN customers c ON c.id = o.customer_id
WHERE s.order_id = o.id
  AND s.origin_pincode IS NULL;

-- Add indexes for SLA monitoring
CREATE INDEX shipments_pickup_sla_idx ON shipments (seller_id, state, pickup_deadline_at) 
  WHERE pickup_deadline_at IS NOT NULL AND state IN ('pickup_pending', 'pickup_scheduled');

CREATE INDEX shipments_delivery_promise_idx ON shipments (seller_id, state, promised_delivery_at)
  WHERE promised_delivery_at IS NOT NULL AND state IN ('in_transit', 'out_for_delivery');

CREATE INDEX shipments_route_lookup ON shipments (origin_pincode, destination_pincode, state);

-- ============================================================================
-- COURIER SERVICE CATEGORIZATION
-- ============================================================================

CREATE TYPE service_category_enum AS ENUM ('surface', 'air_express', 'hyperlocal', 'international');

ALTER TABLE courier_services ADD COLUMN service_category service_category_enum;
ALTER TABLE courier_services ADD COLUMN typical_delivery_days integer CHECK (typical_delivery_days > 0);
ALTER TABLE courier_services ADD COLUMN max_delivery_days integer CHECK (max_delivery_days >= typical_delivery_days);

-- Update common service patterns
UPDATE courier_services 
SET service_category = 'air_express', 
    typical_delivery_days = 1,
    max_delivery_days = 2
WHERE display_name ILIKE '%express%' OR display_name ILIKE '%air%';

UPDATE courier_services 
SET service_category = 'surface',
    typical_delivery_days = 3,
    max_delivery_days = 5
WHERE service_category IS NULL AND (display_name ILIKE '%surface%' OR display_name ILIKE '%standard%');

UPDATE courier_services
SET service_category = 'hyperlocal',
    typical_delivery_days = 1,
    max_delivery_days = 1
WHERE display_name ILIKE '%hyperlocal%' OR display_name ILIKE '%same day%';

-- Default to surface for remaining services
UPDATE courier_services 
SET service_category = 'surface',
    typical_delivery_days = 4,
    max_delivery_days = 6
WHERE service_category IS NULL;

-- ============================================================================
-- SLA BREACH TRACKING
-- ============================================================================

CREATE TYPE sla_breach_type AS ENUM (
  'pickup_delay',
  'delivery_delay',
  'missed_pickup',
  'multiple_ndr',
  'excessive_transit_time'
);

CREATE TABLE sla_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  
  breach_type sla_breach_type NOT NULL,
  
  -- Timeline
  expected_at timestamptz NOT NULL,
  actual_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  
  -- Impact
  delay_hours numeric(10,2),
  
  -- Accountability
  responsible_party text CHECK (responsible_party IN ('courier', 'seller', 'customer', 'force_majeure')),
  
  -- Resolution
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  -- Additional context
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sla_breaches_seller_lookup ON sla_breaches (seller_id, breach_type, detected_at DESC);
CREATE INDEX sla_breaches_shipment_lookup ON sla_breaches (shipment_id);
CREATE INDEX sla_breaches_unresolved_idx ON sla_breaches (seller_id, is_resolved, detected_at DESC) 
  WHERE is_resolved = false;

ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_breaches_tenant_scope ON sla_breaches 
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- ============================================================================
-- PICKUP MANAGEMENT
-- ============================================================================

CREATE TYPE pickup_status_enum AS ENUM (
  'scheduled',
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE pickup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES courier_providers(id) ON DELETE RESTRICT,
  
  -- Pickup details
  scheduled_date date NOT NULL,
  time_slot_start time NOT NULL,
  time_slot_end time NOT NULL,
  
  status pickup_status_enum NOT NULL DEFAULT 'scheduled',
  
  -- Shipments in this pickup
  shipment_count integer NOT NULL DEFAULT 0,
  actual_shipment_count integer,
  
  -- External references
  provider_pickup_id text,
  
  -- Timeline
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  pickup_started_at timestamptz,
  pickup_completed_at timestamptz,
  failed_at timestamptz,
  
  -- Failure details
  failure_reason text,
  rider_notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (time_slot_end > time_slot_start),
  CHECK (status <> 'completed' OR pickup_completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failed_at IS NOT NULL)
);

CREATE INDEX pickup_requests_seller_schedule ON pickup_requests (seller_id, scheduled_date, status);
CREATE INDEX pickup_requests_warehouse_schedule ON pickup_requests (warehouse_id, scheduled_date);
CREATE INDEX pickup_requests_provider_lookup ON pickup_requests (provider_id, scheduled_date);

ALTER TABLE pickup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY pickup_requests_tenant_scope ON pickup_requests 
  USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

-- Link shipments to pickup requests
ALTER TABLE shipments ADD COLUMN pickup_request_id uuid REFERENCES pickup_requests(id) ON DELETE SET NULL;
CREATE INDEX shipments_pickup_lookup ON shipments (pickup_request_id) WHERE pickup_request_id IS NOT NULL;

-- ============================================================================
-- PERFORMANCE METRICS MATERIALIZED VIEW
-- ============================================================================

CREATE MATERIALIZED VIEW daily_shipment_metrics AS
SELECT 
  s.seller_id,
  s.provider_id,
  cp.name AS courier_name,
  DATE(s.created_at) AS metric_date,
  
  -- Volume metrics
  COUNT(*) AS total_shipments,
  COUNT(*) FILTER (WHERE s.state = 'delivered') AS delivered_count,
  COUNT(*) FILTER (WHERE s.state = 'in_transit') AS in_transit_count,
  COUNT(*) FILTER (WHERE s.state = 'ndr') AS ndr_count,
  COUNT(*) FILTER (WHERE s.state = 'rto') AS rto_count,
  COUNT(*) FILTER (WHERE s.state = 'cancelled') AS cancelled_count,
  
  -- Performance rates
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'delivered') / NULLIF(COUNT(*), 0), 2) AS delivery_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'ndr') / NULLIF(COUNT(*), 0), 2) AS ndr_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'rto') / NULLIF(COUNT(*), 0), 2) AS rto_rate,
  
  -- Timing metrics
  AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.booked_at)) / 86400) 
    FILTER (WHERE s.delivered_at IS NOT NULL) AS avg_delivery_days,
  
  -- Financial
  SUM(s.shipping_charge_paise) AS total_freight_paise,
  AVG(s.shipping_charge_paise) AS avg_freight_paise,
  
  -- Weight
  AVG(s.chargeable_weight_g) AS avg_weight_g,
  
  now() AS last_refreshed_at
FROM shipments s
JOIN courier_providers cp ON cp.id = s.provider_id
WHERE s.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY s.seller_id, s.provider_id, cp.name, DATE(s.created_at);

CREATE UNIQUE INDEX daily_shipment_metrics_unique_idx ON daily_shipment_metrics (seller_id, provider_id, metric_date);
CREATE INDEX daily_shipment_metrics_date_idx ON daily_shipment_metrics (metric_date DESC);

COMMENT ON MATERIALIZED VIEW daily_shipment_metrics IS 'Daily aggregated shipment performance metrics by seller and courier. Refresh daily via cron job.';

-- Create refresh function
CREATE OR REPLACE FUNCTION refresh_daily_shipment_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_shipment_metrics;
END;
$$;

COMMENT ON FUNCTION refresh_daily_shipment_metrics IS 'Refresh daily shipment metrics view. Run this daily via scheduler.';
