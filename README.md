# CampusTix / EventEase

CampusTix is a college event discovery, free-ticket booking, and configurable seat-reservation platform. It is deliberately designed around DBMS concepts: normalized entities, foreign keys, a partial unique index, transactional seat holds, and row locks that prevent double booking.

## What is implemented

- React discovery UI with filtering, search, responsive event cards, and a seat-map flow.
- FastAPI `/api/v1` API with registration, code verification, HttpOnly cookie login, event discovery, seat availability, holds, confirmation, cancellation, and booking history.
- PostgreSQL/SQLAlchemy data model, Alembic baseline, seed script, Docker PostgreSQL service, reference SQL schema, and report-ready SQL queries.
- Event-specific inventory: a physical seat is never globally marked booked.
- Transactional booking workflow: sorted `FOR UPDATE` event-seat locks plus a PostgreSQL partial unique index ensure that one active allocation exists for an event seat.
- Brevo transactional-email outbox. With no Brevo configuration it stores `PENDING_DEV`; it does not claim delivery.

## Run locally

See [setup instructions](docs/setup.md). The default UI uses styled sample cards while the API is unavailable; when the backend and seeded database are running, events and seat availability are fetched from PostgreSQL.

## Repository layout

```text
backend/
  app/
    api/v1/endpoints/  # FastAPI route handlers
    core/              # configuration and security concerns
    db/                # database sessions and migrations integration
    models/            # SQLAlchemy ORM entities
    repositories/      # persistence queries
    schemas/           # Pydantic API contracts
    services/          # booking and other business workflows
  tests/               # backend tests
frontend/
  src/
    app/               # application composition and providers
    components/        # reusable UI and shared components
    features/          # domain modules: auth, events, bookings, venues, admin
    lib/               # client-side utilities
    pages/             # route-level page composition
    services/          # API client and external service configuration
    styles/            # global styles and design tokens
```

The API is versioned under `/api/v1`; `GET /api/v1/health` is available for a basic service check.
