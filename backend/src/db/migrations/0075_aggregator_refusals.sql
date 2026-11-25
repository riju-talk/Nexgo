-- When a courier aggregator actually REFUSES a booking for balance (not when its balance merely looks low or negative: aggregators like Lorrigo run on a
-- credit limit, so a negative balance still books), the refusal is recorded here so every process (API, worker) agrees. A later successful booking clears it.
ALTER TABLE courier_aggregators ADD COLUMN IF NOT EXISTS last_refused_at timestamptz;
ALTER TABLE courier_aggregators ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;
