-- Platform-wide pincode blocks: a pincode listed here is unserviceable for every seller and courier.
-- Removing the row opens it again for all sellers. Per-seller blocks stay in seller_pincode_blocks.
CREATE TABLE platform_pincode_blocks (
  pincode text PRIMARY KEY CHECK (pincode ~ '^[0-9]{6}$'),
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Which aggregator or direct contract a courier service runs through (Shiprocket, Nimbus Post, 3PL direct...).
ALTER TABLE courier_services ADD COLUMN service_provider text;
