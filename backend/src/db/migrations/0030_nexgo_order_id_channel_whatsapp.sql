-- NEXGO-generated unique order reference (for reconciliation with couriers), order source channel and WhatsApp status.

CREATE SEQUENCE nexgo_order_seq START 100001;

-- Volatile default: existing orders each get their own id when the column is added.
ALTER TABLE orders ADD COLUMN nexgo_order_id text NOT NULL
  DEFAULT ('NX' || to_char(now(), 'YYMM') || lpad(nextval('nexgo_order_seq')::text, 7, '0'));
ALTER TABLE orders ADD CONSTRAINT orders_nexgo_order_id_key UNIQUE (nexgo_order_id);

ALTER TABLE orders ADD COLUMN channel text NOT NULL DEFAULT 'single'
  CHECK (channel IN ('single', 'bulk_upload', 'shopify', 'amazon', 'woocommerce', 'opencart', 'magento'));
UPDATE orders SET channel = 'bulk_upload' WHERE notes ILIKE 'Created from bulk order upload%';

ALTER TABLE shipments ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'not_sent'
  CHECK (whatsapp_status IN ('not_sent', 'sent', 'delivered', 'read', 'failed'));
