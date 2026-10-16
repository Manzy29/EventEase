# Local setup

1. Copy `.env.example` to `backend/.env` and replace `SECRET_KEY`.
2. Run `docker compose up -d postgres`.
3. From `backend`, create/install the requirements and run `alembic upgrade head`.
4. Seed explicitly with `DEMO_ADMIN_PASSWORD='a-long-local-password' PYTHONPATH=. python ../database/seed.py`.
5. In one terminal, start the API from `backend`: `uvicorn app.main:app --reload`.
6. In another terminal, start the UI: `cd frontend && npm install && npm run dev`.

The Vite development server proxies `/api/*` requests to the API on port 8000, so the browser uses one origin and carries the login cookie automatically. A running API plus the migrated and seeded PostgreSQL database is required for events and seat reservations; the UI intentionally shows a connection error instead of fake, unreservable events when either is unavailable.

For a separately deployed frontend (where the Vite development proxy is absent), set `VITE_API_URL` to the public API URL including `/api/v1` and set `FRONTEND_URL` in `backend/.env` to the exact frontend origin.

## Brevo

Create a Brevo transactional-email account, generate an SMTP/API key, and verify the sender/domain in Brevo before setting `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`. With either setting absent, CampusTix writes `PENDING_DEV` outbox rows; it never pretends delivery succeeded.
