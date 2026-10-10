-- COD remittance: D+N payout day per seller, due date per cycle, and the wallet offset applied at payout time.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS remittance_days smallint NOT NULL DEFAULT 2 CHECK (remittance_days BETWEEN 0 AND 15);
ALTER TABLE cod_remittance_cycles ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE cod_remittance_cycles ADD COLUMN IF NOT EXISTS wallet_offset_paise bigint NOT NULL DEFAULT 0 CHECK (wallet_offset_paise >= 0);
ALTER TABLE cod_remittance_cycles ADD COLUMN IF NOT EXISTS payout_paise bigint CHECK (payout_paise >= 0);
