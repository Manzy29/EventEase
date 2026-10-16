-- CampusTix reference schema. Alembic/SQLAlchemy is the migration authority.
-- The crucial invariant allows historical cancelled bookings while preventing
-- two active allocations of an event seat.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users and Authentication
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(120) NOT NULL,
  email varchar(320) NOT NULL UNIQUE,
  password_hash varchar(512) NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('STUDENT', 'ORGANIZER', 'ADMIN')),
  is_email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX ix_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- 2. Venues and Physical Seating Geometry
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL UNIQUE,
  description text,
  location varchar(240),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE venue_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_label varchar(20) NOT NULL,
  display_order integer NOT NULL,
  UNIQUE(venue_id, row_label)
);

CREATE TABLE venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_row_id uuid NOT NULL REFERENCES venue_rows(id) ON DELETE CASCADE,
  seat_label varchar(20) NOT NULL,
  position integer NOT NULL CHECK(position >= 0),
  seat_type varchar(32) NOT NULL DEFAULT 'STANDARD',
  is_accessible boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(venue_row_id, seat_label)
);

-- 3. Event Taxonomy & Events
CREATE TABLE event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  description text
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL,
  description text NOT NULL,
  poster_url varchar(500),
  category_id uuid NOT NULL REFERENCES event_categories(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  organizer_id uuid NOT NULL REFERENCES users(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL CHECK(end_at > start_at),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  cancellation_deadline timestamptz,
  status varchar(20) NOT NULL DEFAULT 'DRAFT'
);
CREATE INDEX ix_events_start_at ON events(start_at);
CREATE INDEX ix_events_title ON events(title);
CREATE INDEX ix_events_status ON events(status);

-- 4. Event Inventory Instantiation
CREATE TABLE event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_seat_id uuid NOT NULL REFERENCES venue_seats(id),
  is_blocked boolean NOT NULL DEFAULT false,
  UNIQUE(event_id, venue_seat_id)
);
CREATE INDEX ix_event_seats_event_id ON event_seats(event_id);

-- 5. Concurrency Holds (Two-Phase Reservation)
CREATE TABLE seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id),
  expires_at timestamptz NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_seat_holds_active_event_expires ON seat_holds(event_id, status, expires_at);

CREATE TABLE seat_hold_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_hold_id uuid NOT NULL REFERENCES seat_holds(id) ON DELETE CASCADE,
  event_seat_id uuid NOT NULL REFERENCES event_seats(id),
  UNIQUE(seat_hold_id, event_seat_id)
);
CREATE INDEX ix_seat_hold_items_event_seat_id ON seat_hold_items(event_seat_id);

-- 6. Bookings, Confirmed Seats, and Digital Tickets
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference varchar(32) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX ix_bookings_user_id ON bookings(user_id);
CREATE INDEX ix_bookings_event_id ON bookings(event_id);

CREATE TABLE booking_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_seat_id uuid NOT NULL REFERENCES event_seats(id),
  released_at timestamptz,
  UNIQUE(booking_id, event_seat_id)
);

-- Crucial partial unique index preventing concurrent double bookings while preserving cancellation history:
CREATE UNIQUE INDEX uq_active_event_seat_booking ON booking_seats(event_seat_id) WHERE released_at IS NULL;

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_seat_id uuid NOT NULL UNIQUE REFERENCES booking_seats(id) ON DELETE CASCADE,
  ticket_code varchar(48) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'VALID'
);
CREATE INDEX ix_tickets_ticket_code ON tickets(ticket_code);

-- 7. Transactional Outbox for Async Event Notifications
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient varchar(320) NOT NULL,
  template_type varchar(40) NOT NULL,
  payload json NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
-- ========================================================
-- 1. Table #9: Booking OTP Verifications
-- ========================================================
CREATE TABLE IF NOT EXISTS booking_otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  otp_hash varchar(128) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_booking_otp_booking_id ON booking_otp_verifications(booking_id);

-- ========================================================
-- 2. Table #10: Cancellations Table (Page 6 of PDF)
-- ========================================================
CREATE TABLE IF NOT EXISTS cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  reason varchar(255) NOT NULL,
  cancelled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cancellations_booking_id ON cancellations(booking_id);

-- ========================================================
-- 3. Views (Required by Rubric Page 7)
-- ========================================================
-- View 1: AvailableSeatsView
CREATE OR REPLACE VIEW AvailableSeatsView AS
SELECT 
    e.id AS event_id,
    e.title AS event_title,
    count(es.id) FILTER (WHERE NOT es.is_blocked AND bs.id IS NULL AND (sh.id IS NULL OR sh.status != 'ACTIVE' OR sh.expires_at <= now())) AS available_seats
FROM events e
JOIN event_seats es ON es.event_id = e.id
LEFT JOIN booking_seats bs ON bs.event_seat_id = es.id AND bs.released_at IS NULL
LEFT JOIN seat_hold_items shi ON shi.event_seat_id = es.id
LEFT JOIN seat_holds sh ON sh.id = shi.seat_hold_id
GROUP BY e.id, e.title;

-- View 2: EventBookingSummary
CREATE OR REPLACE VIEW EventBookingSummary AS
SELECT 
    e.id AS event_id,
    e.title,
    count(DISTINCT b.id) FILTER (WHERE b.status = 'CONFIRMED') AS confirmed_bookings,
    count(DISTINCT bs.id) FILTER (WHERE bs.released_at IS NULL) AS total_seats_booked,
    count(DISTINCT c.id) AS total_cancellations
FROM events e
LEFT JOIN bookings b ON b.event_id = e.id
LEFT JOIN booking_seats bs ON bs.booking_id = b.id
LEFT JOIN cancellations c ON c.booking_id = b.id
GROUP BY e.id, e.title;

-- ========================================================
-- 4. PostgreSQL Triggers (Required by Rubric Page 7)
-- ========================================================
-- Trigger 1: Audit Booking Status Changes
CREATE TABLE IF NOT EXISTS booking_audit_log (
    audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL,
    old_status varchar(32),
    new_status varchar(32),
    changed_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO booking_audit_log (booking_id, old_status, new_status, changed_at)
        VALUES (NEW.id, OLD.status, NEW.status, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_booking_status ON bookings;
CREATE TRIGGER trg_audit_booking_status
AFTER UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION audit_booking_status_change();

-- Trigger 2: Automatically record Cancellation when booking status becomes 'CANCELLED'
CREATE OR REPLACE FUNCTION trg_record_cancellation_func()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
        INSERT INTO cancellations (booking_id, user_id, reason, cancelled_at)
        VALUES (NEW.id, NEW.user_id, 'Automated trigger cancellation', now())
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_record_cancellation ON bookings;
CREATE TRIGGER trg_auto_record_cancellation
AFTER UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION trg_record_cancellation_func();

-- ========================================================
-- 5. Stored Procedures (Required by Rubric Page 7)
-- ========================================================
-- Procedure: CancelBooking
CREATE OR REPLACE PROCEDURE CancelBooking(p_booking_id uuid, p_user_id uuid, p_reason varchar)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE bookings
    SET status = 'CANCELLED', cancelled_at = now()
    WHERE id = p_booking_id AND user_id = p_user_id AND status = 'CONFIRMED';

    UPDATE booking_seats
    SET released_at = now()
    WHERE booking_id = p_booking_id AND released_at IS NULL;

    INSERT INTO cancellations (booking_id, user_id, reason, cancelled_at)
    VALUES (p_booking_id, p_user_id, p_reason, now());
END;
$$;