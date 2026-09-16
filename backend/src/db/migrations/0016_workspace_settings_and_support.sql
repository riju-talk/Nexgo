CREATE TABLE seller_preferences (
  seller_id uuid PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE support_ticket_state AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 4 AND 180),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 60),
  message text NOT NULL CHECK (char_length(message) BETWEEN 8 AND 4000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  state support_ticket_state NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX support_tickets_seller_created_idx ON support_tickets(seller_id, created_at DESC);
CREATE INDEX support_tickets_state_created_idx ON support_tickets(state, created_at DESC);
