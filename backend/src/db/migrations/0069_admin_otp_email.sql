-- Where an admin's sign-in verification code is e-mailed. Empty = the e-mail they sign in with.
-- Lets a shared sign-in (for example the platform mailbox) send its codes to the person who actually uses it.
ALTER TABLE platform_admins ADD COLUMN otp_email citext;
