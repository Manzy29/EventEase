"""Pydantic API contracts for public booking flows."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class HoldRequest(BaseModel):
    event_seat_ids: list[str] = Field(min_length=1, max_length=5)


class HoldResponse(BaseModel):
    id: str
    expires_at: datetime
    event_seat_ids: list[str]


class BookingRequest(BaseModel):
    hold_id: str


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    role: str
    is_email_verified: bool

class VerifyBookingOTPRequest(BaseModel):
    otp: str = Field(pattern=r"^\d{6}$")

class EventListItem(BaseModel):
    id: str
    title: str
    description: str
    category: str
    venue: str
    organizer: str
    start_at: datetime
    end_at: datetime
    available_seats: int
    poster_url: str | None
