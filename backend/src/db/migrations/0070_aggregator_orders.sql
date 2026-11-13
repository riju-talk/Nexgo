-- The courier aggregator's own id for an order we sent it, remembered at creation time. A retry (after a failed booking step) then reuses the
-- order straight from here and never has to search the aggregator's order list (which cannot be filtered and is paged newest first).
-- `ref` is the order reference we send (NEXGO order id + a short hash of the order data); a corrected order has a new ref, so it is a new order.
CREATE TABLE aggregator_orders (
  aggregator text NOT NULL,
  ref text NOT NULL,
  external_order_id text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES sellers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregator, ref)
);
CREATE INDEX aggregator_orders_order ON aggregator_orders (order_id);
