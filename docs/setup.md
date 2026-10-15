# Local setup

1. Copy `.env.example` to `backend/.env` and replace `SECRET_KEY`.
2. Run `docker compose up -d postgres`.
3. From `backend`, create/install the requirements and run `alembic upgrade head`.
4. Seed explicitly with `DEMO_ADMIN_PASSWORD='a-long-local-password' PYTHONPATH=. python ../database/seed.py`.
5. Start the API: `uvicorn app.main:app --reload`; then `cd frontend && npm install && npm run dev`.

## Brevo

Create a Brevo transactional-email account, generate an SMTP/API key, and verify the sender/domain in Brevo before setting `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`. With either setting absent, CampusTix writes `PENDING_DEV` outbox rows; it never pretends delivery succeeded.
