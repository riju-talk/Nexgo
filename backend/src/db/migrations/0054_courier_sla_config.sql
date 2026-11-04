-- ============================================================================
-- COURIER SLA CONFIGURATION
-- ============================================================================
-- Defines zone-based delivery promise configuration per courier provider.
-- Enables admin panel to set SLA expectations and breach thresholds.
--
-- Key Features:
-- • Per-courier, per-zone SLA configuration
-- • Promised delivery days by service type
-- • Breach threshold configuration
-- • Automatic notification settings
-- • Integrates with existing sla_breaches table (migration 0025)
-- ============================================================================

CREATE TABLE courier_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Courier relationship
  courier_provider_id uuid NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  
  -- Zone definition (matches courier_service_lanes.zone and rate_card_rates.zone)
  -- Values: within_city, within_state, metro_to_metro, rest_of_india, ne_jk, national
  zone varchar(50) NOT NULL,
  
  -- Service type (optional - NULL means applies to all service types)
  service_type varchar(50),  -- surface/air/express/hyperlocal
  
  -- Delivery promise
  promised_days integer NOT NULL CHECK (promised_days > 0),
  
  -- Breach configuration
  -- Breach is detected when actual delivery exceeds promised_days + grace_hours
  breach_threshold_hours integer NOT NULL DEFAULT 24 CHECK (breach_threshold_hours >= 0),
  
  -- Notification settings
  auto_notify boolean NOT NULL DEFAULT true,  -- Send breach alerts automatically
  notify_seller boolean NOT NULL DEFAULT true,  -- Notify seller on breach
  notify_admin boolean NOT NULL DEFAULT false,  -- Notify admin on breach
  
  -- Escalation
  escalation_hours integer CHECK (escalation_hours IS NULL OR escalation_hours > breach_threshold_hours),
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  
  -- One config per courier + zone + service type combination
  UNIQUE(courier_provider_id, zone, service_type)
);

-- Indexes for performance
CREATE INDEX courier_sla_config_courier_idx 
  ON courier_sla_config(courier_provider_id) 
  WHERE is_active = true;

CREATE INDEX courier_sla_config_zone_idx 
  ON courier_sla_config(courier_provider_id, zone) 
  WHERE is_active = true;

CREATE INDEX courier_sla_config_lookup 
  ON courier_sla_config(courier_provider_id, zone, service_type) 
  WHERE is_active = true;

-- Row Level Security (admin-only table)
ALTER TABLE courier_sla_config ENABLE ROW LEVEL SECURITY;

-- Admin users can manage all SLA configs
CREATE POLICY courier_sla_config_admin_all 
  ON courier_sla_config 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

-- Comments for documentation
COMMENT ON TABLE courier_sla_config IS 
  'Zone-based SLA configuration per courier. Defines delivery promises and breach thresholds.';

COMMENT ON COLUMN courier_sla_config.promised_days IS 
  'Number of days promised for delivery in this zone. Used to calculate promised_delivery_at on shipments.';

COMMENT ON COLUMN courier_sla_config.breach_threshold_hours IS 
  'Grace period in hours before flagging as SLA breach. Default 24 hours.';

COMMENT ON COLUMN courier_sla_config.escalation_hours IS 
  'Hours after breach detection to trigger escalation. NULL means no escalation.';

COMMENT ON COLUMN courier_sla_config.service_type IS 
  'Optional service type filter. NULL means this config applies to all service types for the zone.';

-- ============================================================================
-- AUDIT TRIGGER: Track updates and updater
-- ============================================================================

CREATE OR REPLACE FUNCTION update_courier_sla_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = NULLIF(current_setting('app.user_id', true), '')::uuid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_courier_sla_config_updated_at
  BEFORE UPDATE ON courier_sla_config
  FOR EACH ROW
  EXECUTE FUNCTION update_courier_sla_config_updated_at();

-- ============================================================================
-- HELPER FUNCTION: Get SLA Config for Shipment
-- ============================================================================
-- Looks up the appropriate SLA config for a given courier, zone, and service type
-- Falls back to zone-level config if service-type-specific config doesn't exist

CREATE OR REPLACE FUNCTION get_sla_config(
  p_courier_provider_id uuid,
  p_zone varchar(50),
  p_service_type varchar(50) DEFAULT NULL
)
RETURNS TABLE(
  config_id uuid,
  promised_days integer,
  breach_threshold_hours integer,
  auto_notify boolean
) AS $$
BEGIN
  -- Try to find service-type-specific config first
  IF p_service_type IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      id,
      promised_days::integer,
      breach_threshold_hours::integer,
      auto_notify::boolean
    FROM courier_sla_config
    WHERE courier_provider_id = p_courier_provider_id
      AND zone = p_zone
      AND service_type = p_service_type
      AND is_active = true
    LIMIT 1;
    
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- Fallback to zone-level config (service_type = NULL)
  RETURN QUERY
  SELECT 
    id,
    promised_days::integer,
    breach_threshold_hours::integer,
    auto_notify::boolean
  FROM courier_sla_config
  WHERE courier_provider_id = p_courier_provider_id
    AND zone = p_zone
    AND service_type IS NULL
    AND is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_sla_config IS 
  'Lookup SLA config for a courier+zone+service combination with fallback to zone-only config';

-- ============================================================================
-- SEED DATA: Default SLA Configuration
-- ============================================================================
-- Creates baseline SLA configs for common zones
-- These serve as defaults that admins can customize per courier

-- Default SLA configurations (will apply to all couriers as baseline)
-- Note: These are intentionally conservative defaults
-- Admins should customize per courier based on actual performance

INSERT INTO courier_sla_config 
  (courier_provider_id, zone, service_type, promised_days, breach_threshold_hours, auto_notify)
SELECT 
  cp.id,
  zone_config.zone,
  NULL,  -- Applies to all service types
  zone_config.days,
  zone_config.threshold,
  true
FROM 
  courier_providers cp,
  (VALUES
    ('within_city', 1, 12),           -- Same city: 1 day + 12 hr grace
    ('within_state', 2, 24),          -- Within state: 2 days + 1 day grace
    ('metro_to_metro', 2, 24),        -- Metro to metro: 2 days
    ('rest_of_india', 4, 48),         -- Rest of India: 4 days + 2 day grace
    ('ne_jk', 6, 48),                 -- NE/J&K: 6 days + 2 day grace
    ('national', 5, 48)               -- National fallback: 5 days
  ) AS zone_config(zone, days, threshold)
WHERE cp.integration_state NOT IN ('disabled', 'maintenance')
ON CONFLICT (courier_provider_id, zone, service_type) DO NOTHING;

-- Express service configurations (faster promises)
INSERT INTO courier_sla_config 
  (courier_provider_id, zone, service_type, promised_days, breach_threshold_hours, auto_notify)
SELECT 
  cp.id,
  zone_config.zone,
  'express',
  zone_config.days,
  zone_config.threshold,
  true
FROM 
  courier_providers cp,
  (VALUES
    ('within_city', 1, 6),            -- Same day/next day express
    ('within_state', 1, 12),          -- Express within state
    ('metro_to_metro', 1, 12),        -- Metro express
    ('rest_of_india', 2, 24),         -- Express RoI
    ('national', 2, 24)               -- Express national
  ) AS zone_config(zone, days, threshold)
WHERE cp.integration_state NOT IN ('disabled', 'maintenance')
  AND cp.name IN ('Blue Dart', 'FedEx', 'DHL')  -- Premium couriers only
ON CONFLICT (courier_provider_id, zone, service_type) DO NOTHING;

-- Hyperlocal configurations (same-day delivery)
INSERT INTO courier_sla_config 
  (courier_provider_id, zone, service_type, promised_days, breach_threshold_hours, auto_notify, notify_admin)
SELECT 
  cp.id,
  'within_city',
  'hyperlocal',
  1,    -- Same day promise
  3,    -- 3 hour grace (tight SLA)
  true,
  true  -- Notify admin on hyperlocal breaches
FROM courier_providers cp
WHERE cp.integration_state NOT IN ('disabled', 'maintenance')
  AND cp.name IN ('Shadowfax', 'Dunzo', 'Wefast')  -- Hyperlocal couriers
ON CONFLICT (courier_provider_id, zone, service_type) DO NOTHING;

-- ============================================================================
-- VALIDATION: Ensure SLA configs exist for active couriers
-- ============================================================================

-- This query can be used by admins to find couriers missing SLA configs
CREATE OR REPLACE VIEW courier_sla_coverage AS
SELECT 
  cp.id AS courier_provider_id,
  cp.name AS courier_name,
  COUNT(DISTINCT csc.zone) AS zones_configured,
  ARRAY_AGG(DISTINCT csc.zone ORDER BY csc.zone) AS configured_zones,
  CASE 
    WHEN COUNT(DISTINCT csc.zone) >= 5 THEN 'Complete'
    WHEN COUNT(DISTINCT csc.zone) >= 3 THEN 'Partial'
    ELSE 'Incomplete'
  END AS coverage_status
FROM courier_providers cp
LEFT JOIN courier_sla_config csc ON csc.courier_provider_id = cp.id AND csc.is_active = true
WHERE cp.integration_state NOT IN ('disabled', 'maintenance')
GROUP BY cp.id, cp.name
ORDER BY cp.name;

COMMENT ON VIEW courier_sla_coverage IS 
  'Shows SLA configuration coverage per courier. Helps admins identify gaps.';

