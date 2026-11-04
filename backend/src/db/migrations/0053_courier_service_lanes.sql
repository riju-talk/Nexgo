-- ============================================================================
-- COURIER SERVICE LANES (Zone Management)
-- ============================================================================
-- Enables admin panel to map origin→destination pincode pairs to zones
-- and manage courier serviceability at a granular lane level.
--
-- Key Features:
-- • Lane = origin pincode → destination pincode → zone mapping
-- • Per-courier configuration (lanes are courier-specific)
-- • Serviceable flag to disable specific lanes
-- • Transit time estimates per lane
-- • Bulk CSV import support via unique constraint
-- ============================================================================

CREATE TABLE courier_service_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Courier relationship
  courier_provider_id uuid NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  
  -- Lane definition
  origin_pincode varchar(10) NOT NULL,
  destination_pincode varchar(10) NOT NULL,
  
  -- Zone assignment (matches rate_card_rates.zone)
  -- Values: within_city, within_state, metro_to_metro, rest_of_india, ne_jk, national
  zone varchar(50) NOT NULL,
  
  -- Service configuration
  service_type varchar(50),  -- surface/air/express/hyperlocal (optional filter)
  is_serviceable boolean NOT NULL DEFAULT true,
  
  -- Transit time (in days)
  transit_days integer CHECK (transit_days >= 0),
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  
  -- Prevent duplicate lanes for same courier + origin + destination
  UNIQUE(courier_provider_id, origin_pincode, destination_pincode)
);

-- Indexes for performance
CREATE INDEX courier_service_lanes_courier_idx 
  ON courier_service_lanes(courier_provider_id);

CREATE INDEX courier_service_lanes_origin_idx 
  ON courier_service_lanes(origin_pincode) 
  WHERE is_serviceable = true;

CREATE INDEX courier_service_lanes_destination_idx 
  ON courier_service_lanes(destination_pincode) 
  WHERE is_serviceable = true;

CREATE INDEX courier_service_lanes_zone_idx 
  ON courier_service_lanes(courier_provider_id, zone);

-- Composite index for rate calculation queries
CREATE INDEX courier_service_lanes_lookup 
  ON courier_service_lanes(courier_provider_id, origin_pincode, destination_pincode) 
  WHERE is_serviceable = true;

-- Row Level Security (admin-only table, no seller access)
ALTER TABLE courier_service_lanes ENABLE ROW LEVEL SECURITY;

-- Admin users can see all lanes
CREATE POLICY courier_service_lanes_admin_all 
  ON courier_service_lanes 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

-- Comments for documentation
COMMENT ON TABLE courier_service_lanes IS 
  'Courier-specific origin→destination lane configuration with zone mapping. Used by admin zone management screen.';

COMMENT ON COLUMN courier_service_lanes.zone IS 
  'Zone classification matching rate_card_rates.zone values. Determines pricing tier.';

COMMENT ON COLUMN courier_service_lanes.service_type IS 
  'Optional service type filter (surface/air/express). NULL means applies to all service types.';

COMMENT ON COLUMN courier_service_lanes.transit_days IS 
  'Expected transit time in days for this lane. Used for delivery promise calculation.';

-- ============================================================================
-- AUDIT TRIGGER: Track updates
-- ============================================================================

CREATE OR REPLACE FUNCTION update_courier_service_lanes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_courier_service_lanes_updated_at
  BEFORE UPDATE ON courier_service_lanes
  FOR EACH ROW
  EXECUTE FUNCTION update_courier_service_lanes_updated_at();

-- ============================================================================
-- SAMPLE DATA (for testing/development)
-- ============================================================================

-- Note: Real data will be imported via bulk CSV upload in admin panel
-- This is just to demonstrate the schema structure

-- Example: Delhivery lanes for Delhi-Mumbai corridor
-- (Assumes courier_providers has Delhivery with a known ID)

-- INSERT INTO courier_service_lanes 
--   (courier_provider_id, origin_pincode, destination_pincode, zone, service_type, transit_days, is_serviceable)
-- SELECT 
--   cp.id,
--   '110001',  -- Delhi
--   '400001',  -- Mumbai
--   'metro_to_metro',
--   'surface',
--   3,
--   true
-- FROM courier_providers cp
-- WHERE cp.name = 'Delhivery'
-- LIMIT 1;

