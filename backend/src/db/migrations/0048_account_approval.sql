-- Sellers register themselves, then wait for a platform admin to approve them before they can sign in.
ALTER TABLE sellers
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN approval_decided_at timestamptz,
  ADD COLUMN approval_decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN approval_rejection_reason text;

-- Everyone who exists today was already let in: they stay approved. New rows start pending.
UPDATE sellers SET approval_decided_at = created_at WHERE approval_decided_at IS NULL;
ALTER TABLE sellers ALTER COLUMN approval_status SET DEFAULT 'pending';

CREATE INDEX sellers_pending_approval_idx ON sellers (created_at DESC) WHERE approval_status = 'pending';
