-- Employee access (Teams & Roles): NULL permissions = the role's normal access; a list = only those permission keys.
ALTER TABLE seller_memberships ADD COLUMN permissions text[];
ALTER TABLE users ADD COLUMN phone text;
