-- Starter rate cards so Admin > Rate cards and the seller Rate Card page are not empty after the aggregator reset (0047/0051).
-- PLACEHOLDER prices (not from Lorrigo, which publishes none): Rs124.50 first 500 g + Rs28.50 per extra 500 g, scaled per lane zone
-- (within city 70%, state 85%, metro 95%, rest of India 115%, NE/J&K 150%); 250 g services use Rs85 + Rs14.50 per 250 g.
-- COD = max(Rs25, 1.5%). RTO = same as forward (NULL). Prices exclude GST. Admin edits them in Assign courier & rates.
-- Only sellers that have no active card get one; couriers are switched on for them with COD allowed.
INSERT INTO rate_cards (seller_id, name, state, effective_from)
SELECT s.id, 'Starter rates (edit in Assign courier & rates)', 'active', now()
FROM sellers s
WHERE NOT EXISTS (SELECT 1 FROM rate_cards rc WHERE rc.seller_id = s.id AND rc.state = 'active')
  AND EXISTS (SELECT 1 FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.aggregator = 'lorrigo' AND cs.is_active);

INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise,
  additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps, cod_percent_bps)
SELECT rc.id, cs.id, z.zone, 0, w.slab,
  round(w.base * z.factor / 100.0)::integer, w.slab, round(w.extra * z.factor / 100.0)::integer, 2500, 0, 150
FROM rate_cards rc
JOIN courier_services cs ON cs.is_active
JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.aggregator = 'lorrigo'
CROSS JOIN (VALUES ('within_city', 70), ('within_state', 85), ('metro_to_metro', 95), ('rest_of_india', 115), ('ne_jk', 150)) AS z(zone, factor)
CROSS JOIN LATERAL (SELECT CASE WHEN cs.display_name ~ '0\.25 kg|250 g' THEN 250 ELSE 500 END AS slab,
  CASE WHEN cs.display_name ~ '0\.25 kg|250 g' THEN 8500 ELSE 12450 END AS base,
  CASE WHEN cs.display_name ~ '0\.25 kg|250 g' THEN 1450 ELSE 2850 END AS extra) w
WHERE rc.name = 'Starter rates (edit in Assign courier & rates)' AND rc.state = 'active' AND rc.seller_id IS NOT NULL
ON CONFLICT (rate_card_id, service_id, zone_code, min_weight_g) DO NOTHING;

INSERT INTO seller_courier_access (seller_id, service_id, state, cod_enabled)
SELECT DISTINCT rc.seller_id, r.service_id, 'enabled', true
FROM rate_cards rc JOIN rate_card_rates r ON r.rate_card_id = rc.id
WHERE rc.name = 'Starter rates (edit in Assign courier & rates)' AND rc.state = 'active' AND rc.seller_id IS NOT NULL
ON CONFLICT (seller_id, service_id) DO NOTHING;
