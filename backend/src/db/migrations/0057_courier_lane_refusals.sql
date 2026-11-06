-- The aggregator only says whether a courier serves a lane when a booking is attempted. When it refuses, remember it for a day so quotes stop
-- offering that courier for the same pickup -> delivery pincodes (the seller sees "not available on this lane" instead of a failing Book button).
CREATE TABLE IF NOT EXISTS courier_lane_refusals (
  service_id uuid NOT NULL REFERENCES courier_services(id) ON DELETE CASCADE,
  pickup_pincode char(6) NOT NULL,
  destination_pincode char(6) NOT NULL,
  reason text NOT NULL,
  refused_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, pickup_pincode, destination_pincode)
);
CREATE INDEX IF NOT EXISTS courier_lane_refusals_recent ON courier_lane_refusals (refused_at);
