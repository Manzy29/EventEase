"""Application entry point for the EventEase API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings


def create_application() -> FastAPI:
    """Create the FastAPI application without coupling it to a server process."""
    settings = get_settings()
    application = FastAPI(title=settings.app_name)
    application.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.get("/", tags=["system"])
    def read_root() -> dict[str, str]:
        return {"Hello": "World"}

    return application


app = create_application()
