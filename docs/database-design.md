# CampusTix database design

The schema is in third normal form. Each relation represents one subject: user identity, physical venue seating, event-specific inventory, transient reservation, booking allocation, ticket, or delivery outbox. Repeating seat groups are modelled as child rows—not comma-separated strings or JSON.

## Key booking invariant

`venue_seats` is permanent geometry; `event_seats` is inventory for one event. Holds have expiry and are checked under row locks. Confirmed allocations use `booking_seats.released_at`; the PostgreSQL partial unique index only permits one unreleased allocation per `event_seat_id`. Cancelling timestamps the booking and releases allocations, preserving history while reopening the seat.

## Normalization

- **1NF:** all fields are atomic; individual seats/tickets are separate rows.
- **2NF:** bridge tables (`booking_seats`, `seat_hold_items`) depend on their complete keys.
- **3NF:** category, venue, organizer, and user details are stored once and referenced by foreign keys.

See `database/schema.sql` for constraints and `database/queries.sql` for faculty-demo queries.
