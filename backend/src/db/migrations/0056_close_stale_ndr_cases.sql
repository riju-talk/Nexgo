-- NDR cases stayed "open" after the parcel was delivered or went back to the seller, because the courier webhook updated the shipment
-- but not the case. New events now close the case (lib/shipmentEffects.ts); this fixes the ones already in the database.
-- Cases a seller already actioned (resolved / rto_requested) are untouched. RTO charges are NOT back-filled for old returns: that would
-- change balances retroactively, so finance decides separately.
UPDATE ndr_cases n SET state = 'resolved', resolved_at = COALESCE(n.resolved_at, s.delivered_at, now()), updated_at = now()
FROM shipments s WHERE s.id = n.shipment_id AND s.state = 'delivered' AND n.state IN ('open', 'reattempt_requested');

UPDATE ndr_cases n SET state = 'rto_requested', updated_at = now()
FROM shipments s WHERE s.id = n.shipment_id AND s.state = 'rto' AND n.state IN ('open', 'reattempt_requested');
