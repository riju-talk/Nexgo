-- The courier's OWN latest status and its reason, kept next to NEXGO's state, so a screen can show exactly what the courier network shows
-- (e.g. PICKUP_EXCEPTION "Seller Not Available / Phone no. Not Contactable" on a parcel that NEXGO still lists as "pickup pending").
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS courier_status text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS courier_status_note text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS courier_status_at timestamptz;

-- Until now, answering an NDR in NEXGO (reattempt / address updated) forced the parcel to "in transit" even though the courier still showed NDR,
-- so Track and the courier disagreed. From now on a seller's answer leaves the parcel in NDR until the courier scans again. Parcels that were
-- already forced: if the newest event is the seller's own manual answer, no courier scan has come after it, so the courier still says NDR.
UPDATE shipments s SET state = 'ndr', updated_at = now()
 WHERE s.state = 'in_transit'
   AND EXISTS (SELECT 1 FROM ndr_cases n WHERE n.shipment_id = s.id AND n.state IN ('reattempt_requested', 'resolved'))
   AND (SELECT e.source FROM shipment_events e WHERE e.shipment_id = s.id ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT 1) = 'manual';
