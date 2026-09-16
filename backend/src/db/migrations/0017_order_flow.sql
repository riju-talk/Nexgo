ALTER TABLE orders ADD COLUMN order_flow text NOT NULL DEFAULT 'forward' CHECK (order_flow IN ('forward','reverse','dropship','ship_now'));
CREATE INDEX orders_seller_flow_created_idx ON orders(seller_id, order_flow, created_at DESC);
