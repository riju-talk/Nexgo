-- Customer-facing tax invoice number: a per-seller running number assigned the first time an invoice is generated (never reused).
ALTER TABLE orders ADD COLUMN invoice_seq bigint;
CREATE UNIQUE INDEX orders_invoice_seq_key ON orders (seller_id, invoice_seq) WHERE invoice_seq IS NOT NULL;
