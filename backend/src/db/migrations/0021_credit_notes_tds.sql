-- Credit notes (adjustments against an issued invoice) and TDS deductions.
-- Both are issued by platform finance and are read-only for sellers. Credit
-- note numbers use their own gapless per-seller series, same rule as invoices.

CREATE TABLE credit_note_sequences (
  seller_id uuid PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number > 0)
);

CREATE TABLE credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  credit_note_number text NOT NULL UNIQUE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise > 0),
  gst_paise bigint NOT NULL CHECK (gst_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise = subtotal_paise + gst_paise),
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_notes_seller_lookup ON credit_notes (seller_id, issued_at DESC);
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_notes_tenant_scope ON credit_notes USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);

CREATE TABLE tds_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  financial_year text NOT NULL CHECK (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  section text NOT NULL DEFAULT '194C' CHECK (char_length(section) BETWEEN 2 AND 10),
  taxable_paise bigint NOT NULL CHECK (taxable_paise > 0),
  tds_rate_bps integer NOT NULL CHECK (tds_rate_bps BETWEEN 0 AND 10000),
  tds_paise bigint NOT NULL CHECK (tds_paise >= 0),
  certificate_reference text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tds_entries_seller_lookup ON tds_entries (seller_id, financial_year DESC, quarter DESC);
ALTER TABLE tds_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tds_entries_tenant_scope ON tds_entries USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
