"""Configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CampusTix API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://campustix:change_me@localhost:5432/campustix"
    secret_key: str = "change-this-in-production"
    access_token_expire_minutes: int = 30
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    seat_hold_minutes: int = 5
    max_seats_per_booking: int = 5
    brevo_api_key: str | None = None
    brevo_sender_email: str | None = None
    brevo_sender_name: str = "CampusTix"
    cookie_secure: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
