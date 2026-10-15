-- CampusTix reference schema. Alembic/SQLAlchemy is the migration authority.
-- The crucial invariant allows historical cancelled bookings while preventing
-- two active allocations of an event seat.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name varchar(120) NOT NULL,
  email varchar(320) NOT NULL UNIQUE, password_hash varchar(512) NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('STUDENT','ORGANIZER','ADMIN')),
  is_email_verified boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE venues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160) NOT NULL UNIQUE, description text, location varchar(240), is_active boolean NOT NULL DEFAULT true);
CREATE TABLE venue_rows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE, row_label varchar(20) NOT NULL, display_order integer NOT NULL, UNIQUE(venue_id,row_label));
CREATE TABLE venue_seats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_row_id uuid NOT NULL REFERENCES venue_rows(id) ON DELETE CASCADE, seat_label varchar(20) NOT NULL, position integer NOT NULL CHECK(position >= 0), seat_type varchar(32) NOT NULL DEFAULT 'STANDARD', is_accessible boolean NOT NULL DEFAULT true, is_active boolean NOT NULL DEFAULT true, UNIQUE(venue_row_id,seat_label));
CREATE TABLE event_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(80) NOT NULL UNIQUE, description text);
CREATE TABLE events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(180) NOT NULL, description text NOT NULL, category_id uuid NOT NULL REFERENCES event_categories(id), venue_id uuid NOT NULL REFERENCES venues(id), organizer_id uuid NOT NULL REFERENCES users(id), start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at > start_at), registration_closes_at timestamptz, cancellation_deadline timestamptz, status varchar(20) NOT NULL DEFAULT 'DRAFT');
CREATE TABLE event_seats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, venue_seat_id uuid NOT NULL REFERENCES venue_seats(id), is_blocked boolean NOT NULL DEFAULT false, UNIQUE(event_id,venue_seat_id));
CREATE TABLE seat_holds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), event_id uuid NOT NULL REFERENCES events(id), expires_at timestamptz NOT NULL, status varchar(16) NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE seat_hold_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seat_hold_id uuid NOT NULL REFERENCES seat_holds(id) ON DELETE CASCADE, event_seat_id uuid NOT NULL REFERENCES event_seats(id), UNIQUE(seat_hold_id,event_seat_id));
CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_reference varchar(32) NOT NULL UNIQUE, user_id uuid NOT NULL REFERENCES users(id), event_id uuid NOT NULL REFERENCES events(id), status varchar(16) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, cancelled_at timestamptz);
CREATE TABLE booking_seats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id), event_seat_id uuid NOT NULL REFERENCES event_seats(id), released_at timestamptz, UNIQUE(booking_id,event_seat_id));
CREATE UNIQUE INDEX uq_active_event_seat_booking ON booking_seats(event_seat_id) WHERE released_at IS NULL;
