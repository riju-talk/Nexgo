-- Quotes and booking read only the newest active rate card per seller, but every "Assign courier & rates" save left the previous card active
-- (a seller could have 2-3 "active" cards, e.g. xpresszone). Retire all but the newest effective card per seller (and for the platform cost
-- card, seller_id NULL). Prices are snapshotted on each shipment, so nothing historical changes.
UPDATE rate_cards rc SET state = 'retired', updated_at = now()
WHERE rc.state = 'active'
  AND EXISTS (
    SELECT 1 FROM rate_cards n
    WHERE n.seller_id IS NOT DISTINCT FROM rc.seller_id AND n.state = 'active' AND n.effective_from <= now()
      AND (n.effective_from, n.created_at, n.id) > (rc.effective_from, rc.created_at, rc.id));
