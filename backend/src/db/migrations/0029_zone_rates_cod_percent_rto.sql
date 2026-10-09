-- Zone-aware rating (within city / within state / metro-to-metro / rest of India / NE & J&K),
-- COD charged as the greater of a flat fee and a percentage of the order value, and RTO prices.

ALTER TABLE rate_card_rates ADD COLUMN cod_percent_bps integer NOT NULL DEFAULT 0 CHECK (cod_percent_bps >= 0);
ALTER TABLE rate_card_rates ADD COLUMN rto_base_price_paise integer CHECK (rto_base_price_paise >= 0);
ALTER TABLE rate_card_rates ADD COLUMN rto_additional_price_paise integer CHECK (rto_additional_price_paise >= 0);

-- Demo commercials: derive the five zone rows from each service's national row, and give every row
-- a 1.5% COD percentage. A NULL RTO price means "same as forward", so existing cards keep working.
UPDATE rate_card_rates SET cod_percent_bps = 150 WHERE cod_percent_bps = 0;

INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise,
  additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps, cod_percent_bps)
SELECT r.rate_card_id, r.service_id, z.zone, r.min_weight_g, r.base_weight_g,
  round(r.base_price_paise * z.factor / 100.0)::integer, r.additional_weight_g,
  round(r.additional_price_paise * z.factor / 100.0)::integer, r.cod_fee_paise, r.fuel_surcharge_bps, r.cod_percent_bps
FROM rate_card_rates r
CROSS JOIN (VALUES ('within_city', 70), ('within_state', 85), ('metro_to_metro', 95), ('rest_of_india', 115), ('ne_jk', 150)) AS z(zone, factor)
WHERE r.zone_code = 'national'
ON CONFLICT (rate_card_id, service_id, zone_code, min_weight_g) DO NOTHING;
