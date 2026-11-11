-- The wallet ledger is the single source of truth for money: rows are only ever added, never changed or removed.
-- A mistake is corrected by a new, opposite entry.
CREATE OR REPLACE FUNCTION wallet_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_entries is append-only: add a correcting entry instead of changing or deleting one' USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS wallet_entries_no_change ON wallet_entries;
CREATE TRIGGER wallet_entries_no_change BEFORE UPDATE OR DELETE ON wallet_entries
  FOR EACH ROW EXECUTE FUNCTION wallet_entries_append_only();
