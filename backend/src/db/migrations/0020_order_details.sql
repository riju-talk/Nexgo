-- Full single-order capture: consignee extras, per-item HSN, package
-- dimensions (for volumetric billing) and the order's own charge lines.

ALTER TABLE customers
  ADD COLUMN company_name text,
  ADD COLUMN alternate_phone text CHECK (alternate_phone IS NULL OR alternate_phone ~ '^[0-9+() -]{7,24}$'),
  ADD COLUMN landmark text;

ALTER TABLE order_items ADD COLUMN hsn_code text;

ALTER TABLE orders
  ADD COLUMN package_length_mm integer CHECK (package_length_mm > 0),
  ADD COLUMN package_width_mm integer CHECK (package_width_mm > 0),
  ADD COLUMN package_height_mm integer CHECK (package_height_mm > 0),
  -- max(dead, volumetric) is what couriers bill on; booking reads this.
  ADD COLUMN volumetric_weight_g integer NOT NULL DEFAULT 0 CHECK (volumetric_weight_g >= 0),
  ADD COLUMN shipping_charges_paise integer NOT NULL DEFAULT 0 CHECK (shipping_charges_paise >= 0),
  ADD COLUMN gift_wrap_paise integer NOT NULL DEFAULT 0 CHECK (gift_wrap_paise >= 0),
  ADD COLUMN transaction_charges_paise integer NOT NULL DEFAULT 0 CHECK (transaction_charges_paise >= 0),
  ADD COLUMN other_charges_paise integer NOT NULL DEFAULT 0 CHECK (other_charges_paise >= 0),
  ADD COLUMN discount_paise integer NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  ADD COLUMN tax_rate_bps integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  ADD COLUMN tax_paise integer NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  ADD COLUMN total_paise integer NOT NULL DEFAULT 0 CHECK (total_paise >= 0);

-- Existing orders had no charge lines, so their total is their item subtotal.
UPDATE orders SET total_paise = subtotal_paise;

-- Dimensions are all-or-nothing so volumetric weight is never half-computed.
ALTER TABLE orders ADD CONSTRAINT orders_package_dimensions_complete CHECK (
  (package_length_mm IS NULL AND package_width_mm IS NULL AND package_height_mm IS NULL)
  OR (package_length_mm IS NOT NULL AND package_width_mm IS NOT NULL AND package_height_mm IS NOT NULL)
);
