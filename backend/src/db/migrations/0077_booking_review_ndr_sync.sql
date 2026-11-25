-- 1. Courier bookings whose outcome stays uncertain go to a manual check ('needs_review') instead of being released or retried for ever. 'needs_review' is still
--    an OPEN state: nothing else may book, edit or cancel the order until a person (or a later successful lookup) settles it.
--    `misses` = how many lookups found no booking; one empty lookup is never proof (the courier's records can lag behind its own booking).
ALTER TABLE booking_attempts DROP CONSTRAINT IF EXISTS booking_attempts_state_check;
ALTER TABLE booking_attempts ADD CONSTRAINT booking_attempts_state_check CHECK (state IN ('started', 'unknown', 'accepted', 'cancel_needed', 'needs_review', 'recorded', 'refused', 'cancelled'));
ALTER TABLE booking_attempts ADD COLUMN IF NOT EXISTS misses integer NOT NULL DEFAULT 0;
ALTER TABLE booking_attempts ADD COLUMN IF NOT EXISTS review_from text; -- the state it was in when it was handed to a person
ALTER TABLE booking_attempts ADD COLUMN IF NOT EXISTS resolved_by uuid;
DROP INDEX IF EXISTS booking_attempts_one_open;
DROP INDEX IF EXISTS booking_attempts_due;
CREATE UNIQUE INDEX booking_attempts_one_open ON booking_attempts (order_id) WHERE state IN ('started', 'unknown', 'accepted', 'cancel_needed', 'needs_review');
CREATE INDEX booking_attempts_due ON booking_attempts (next_check_at) WHERE state IN ('started', 'unknown', 'accepted', 'cancel_needed', 'needs_review');

-- 2. Whether the courier was told about the seller's NDR answer. The seller's decision is saved first; telling the courier can fail and is retried.
--    courier_sync: NULL (nothing to tell) | pending | sending (one process is telling the courier now) | sent | failed (will retry) | manual (this courier takes NDR instructions only in its own portal, or retries ran out)
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync text CHECK (courier_sync IN ('pending', 'sending', 'sent', 'failed', 'manual'));
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync_action text;
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync_comment text;
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync_error text;
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_sync_next_at timestamptz;
ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS courier_synced_at timestamptz;
CREATE INDEX IF NOT EXISTS ndr_cases_courier_sync_due ON ndr_cases (courier_sync_next_at) WHERE courier_sync IN ('pending', 'sending', 'failed');
