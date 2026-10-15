# CampusTix DBMS mini-project report

## Abstract

CampusTix is a free college-event booking system that turns seat reservation into a transactional relational-data problem. It supports verified accounts, event discovery, venue geometry, time-limited holds, confirmed tickets, cancellation history, and email notifications.

## Problem and proposed system

Manual registration and static seat lists allow duplicate allocation, provide poor visibility, and lose history. CampusTix replaces them with PostgreSQL as the authority, an interactive client, and server-side booking rules. No payment gateway is represented because the initial release is for free events.

## Requirements

Functional requirements include registration/verification, published event discovery, configured seat maps, holds, booking, cancellation, tickets, and reports. Non-functional requirements include authorization, availability, accessibility, responsive UI, auditability, data integrity, and concurrent-booking safety.

## Use cases

- Student: register, verify, sign in, browse, select, hold, confirm, view, and cancel tickets.
- Organizer: create and manage only their authorized events (administration UI is the next implementation unit).
- Administrator: manage venues, layouts, users, event publishing, and reports.

## Relational schema and data dictionary

| Relation | Primary key | Important foreign keys | Purpose |
|---|---|---|---|
| `users` | `id` | — | account, role, verified/active state |
| `email_verification_tokens` | `id` | `user_id` | hashed, expiring single-use code |
| `event_categories` | `id` | — | controlled category list |
| `venues`, `venue_rows`, `venue_seats` | `id` | parent `id` | configurable physical geometry |
| `events` | `id` | category, venue, organizer | event metadata and lifecycle |
| `event_seats` | `id` | event, venue seat | per-event inventory, optional block |
| `seat_holds`, `seat_hold_items` | `id` | user/event, hold/event seat | expiring reservation intent |
| `bookings`, `booking_seats` | `id` | user/event, booking/event seat | confirmed/cancelled history and allocations |
| `tickets` | `id` | booking seat | one opaque code per issued seat |
| `email_outbox` | `id` | — | durable email delivery intent |

The ER diagram is in [er-diagram.md](er-diagram.md); physical seats are intentionally independent of event seat inventory.

## Constraints and indexes

Email and booking reference are unique. A row cannot duplicate a seat label, and an event cannot include the same physical seat twice. Event end time must follow start time. The critical index is `uq_active_event_seat_booking`: a PostgreSQL partial unique index over `booking_seats(event_seat_id) WHERE released_at IS NULL`. It preserves a cancelled allocation for history while allowing the seat to be booked again.

## Transaction and concurrency control

When a hold is created, the service first expires stale holds, locks requested `event_seats` in sorted order using `SELECT … FOR UPDATE`, then checks active hold and allocation rows before inserting a hold. Confirmation repeats expiry and locks before creating the booking, allocations, tickets, and outbox record in a single transaction. Sorted locks avoid lock-order deadlocks; the partial unique index remains the final database backstop. Cancellation marks the historical booking and timestamps its allocations as released in one transaction.

## API design

The implemented contract is versioned under `/api/v1` and documented by FastAPI at `/docs`: authentication (`register`, `verify-email`, `login`, `logout`, `me`), event discovery/availability/seats, hold create/read/release, booking confirmation, cancellation, and booking history. Protected routes take identity exclusively from the session cookie.

## Security

Passwords use Argon2id; verification codes are random six-digit values and only a SHA-256 hash is stored. Sessions are signed, short-lived, HttpOnly cookies. Authorization and verified-account checks run on the server. ORM parameterization prevents SQL injection. Brevo credentials are environment-only, and the development delivery mode explicitly records `PENDING_DEV` rather than faking a sent email.

## Tests and limitations

The current automated smoke test proves the versioned API application starts and exposes health; the frontend runs lint and a production build. PostgreSQL integration tests for parallel holds, administrative CRUD, password reset, ticket QR rendering, reports, and the full organizer/admin dashboard remain the next work before a final faculty demonstration. Use a real PostgreSQL instance—not SQLite—to validate locks and the partial unique index.

## Future enhancements

Add staff ticket scanning, organizer-scoped CRUD, a scheduled outbox worker, rate limiting backed by Redis, WebSocket availability events, audited status transitions, and PostgreSQL concurrency integration tests.
