-- Registration is instant again: a new seller can use the platform right away, no admin approval step.
-- Anyone still waiting is let in, and new rows start approved. (Admins can still suspend a seller.)
UPDATE sellers SET approval_status = 'approved', approval_decided_at = now() WHERE approval_status = 'pending';
ALTER TABLE sellers ALTER COLUMN approval_status SET DEFAULT 'approved';
