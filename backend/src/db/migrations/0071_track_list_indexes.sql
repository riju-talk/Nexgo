-- Track loads a screenful at a time, newest first, with a keyset cursor on (created_at, id): these indexes serve exactly that order per seller,
-- for shipments and for the orders that have no courier yet.
CREATE INDEX IF NOT EXISTS shipments_seller_recent_idx ON shipments (seller_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_seller_unshipped_recent_idx ON orders (seller_id, created_at DESC, id DESC) WHERE state IN ('new', 'ready_to_ship', 'cancelled');
