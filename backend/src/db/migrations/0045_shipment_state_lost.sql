-- Track needs a "Lost" tab: a parcel the courier reports lost. (Kept in its own file: a new enum value cannot be used in the transaction that adds it.)
ALTER TYPE shipment_state ADD VALUE IF NOT EXISTS 'lost';
