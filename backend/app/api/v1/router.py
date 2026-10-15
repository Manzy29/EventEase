"""Versioned API router composition."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, bookings, events, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(events.router)
api_router.include_router(bookings.router)
