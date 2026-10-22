-- Shopify OAuth connection: one shop can belong to exactly one seller (webhooks are routed by shop domain),
-- and each imported order remembers the connection it came from so tracking can be pushed back to the right store.
CREATE UNIQUE INDEX channel_connections_shopify_shop
  ON channel_connections (lower(store_url))
  WHERE provider = 'shopify' AND encrypted_credentials IS NOT NULL;

ALTER TABLE orders ADD COLUMN channel_connection_id uuid REFERENCES channel_connections(id) ON DELETE SET NULL;
CREATE INDEX orders_channel_connection_lookup ON orders (channel_connection_id) WHERE channel_connection_id IS NOT NULL;
