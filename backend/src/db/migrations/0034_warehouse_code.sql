-- One unique, human-readable ID per warehouse (WH000001, ...), shown in Warehouse settings and quoted on pickups.
CREATE SEQUENCE warehouse_code_seq START 1;
ALTER TABLE warehouses ADD COLUMN warehouse_code text NOT NULL DEFAULT ('WH' || lpad(nextval('warehouse_code_seq')::text, 6, '0'));
ALTER TABLE warehouses ADD CONSTRAINT warehouses_warehouse_code_key UNIQUE (warehouse_code);
