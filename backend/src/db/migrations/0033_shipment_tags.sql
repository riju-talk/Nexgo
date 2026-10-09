-- Free-form seller tags on shipments (e.g. "priority", "gift", "fragile"), used to group and filter shipments in Track, NDR and RTO.
ALTER TABLE shipments ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX shipments_tags_idx ON shipments USING gin (tags);
