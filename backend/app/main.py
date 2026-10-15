"""Application entry point for the EventEase API."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.booking import expire_holds
from app.services.email import process_outbox


async def periodic_maintenance_worker() -> None:
    """Background worker that periodically sweeps expired holds and processes email outbox."""
    while True:
        try:
            with SessionLocal() as db:
                expire_holds(db)
                process_outbox(db)
        except Exception:
            # Silently pass or handle DB connectivity blips during tests/startup
            pass
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(application: FastAPI):
    worker_task = asyncio.create_task(periodic_maintenance_worker())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


def create_application() -> FastAPI:
    """Create the FastAPI application without coupling it to a server process."""
    settings = get_settings()
    application = FastAPI(title=settings.app_name, lifespan=lifespan)
    # Credentialed requests cannot use a wildcard origin.  The Vite proxy
    # makes local requests same-origin, while this also supports a separately
    # hosted configured frontend.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        return JSONResponse(
            status_code=409,
            content={
                "detail": "A database constraint was violated. The resource may already exist or seats were concurrently booked."
            },
        )

    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.post(f"{settings.api_v1_prefix}/system/seed-data", tags=["system"])
    def system_seed_data(reset: bool = False) -> dict:
        """Seed or reset demonstration data (venues, categories, events, demo bookings)."""
        from database.seed import seed_database
        with SessionLocal() as db:
            summary = seed_database(db, reset=reset)
            return {
                "status": "success",
                "message": f"Successfully seeded {summary['events_count']} events across {summary['venues_count']} venues.",
                "summary": summary,
            }

    @application.get("/", tags=["system"])
    def read_root() -> dict[str, str]:
        return {"Hello": "World"}

    return application


app = create_application()
