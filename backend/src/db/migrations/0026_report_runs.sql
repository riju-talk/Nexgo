-- Generated MIS/report exports. Content is kept as CSV text so downloads work on
-- stateless hosting (Vercel) without object storage; row count is capped by the
-- generator, so rows stay small.
CREATE TYPE report_run_state AS ENUM ('ready', 'failed');

CREATE TABLE report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type ~ '^[a-z_]{2,40}$'),
  range_start date NOT NULL, range_end date NOT NULL, status_filter text,
  state report_run_state NOT NULL DEFAULT 'ready', row_count integer NOT NULL DEFAULT 0,
  file_name text NOT NULL, csv_content text NOT NULL, preview jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (range_end >= range_start)
);
CREATE INDEX report_runs_seller_lookup ON report_runs (seller_id, created_at DESC);
ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_runs_tenant_scope ON report_runs USING (seller_id = NULLIF(current_setting('app.seller_id', true), '')::uuid);
