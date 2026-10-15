"""Normalized CampusTix SQLAlchemy domain model."""
from __future__ import annotations

import enum
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def new_id() -> str:
    return str(uuid4())


class Role(str, enum.Enum):
    STUDENT = "STUDENT"
    ORGANIZER = "ORGANIZER"
    ADMIN = "ADMIN"


class BookingStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class HoldStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"
    CONSUMED = "CONSUMED"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.STUDENT)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bookings: Mapped[list[Booking]] = relationship(back_populates="user")


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventCategory(Base):
    __tablename__ = "event_categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class Venue(Base):
    __tablename__ = "venues"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(240))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    rows: Mapped[list[VenueRow]] = relationship(back_populates="venue", cascade="all, delete-orphan")


class VenueRow(Base):
    __tablename__ = "venue_rows"
    __table_args__ = (UniqueConstraint("venue_id", "row_label"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"))
    row_label: Mapped[str] = mapped_column(String(20))
    display_order: Mapped[int] = mapped_column(Integer)
    venue: Mapped[Venue] = relationship(back_populates="rows")
    seats: Mapped[list[VenueSeat]] = relationship(back_populates="row", cascade="all, delete-orphan")


class VenueSeat(Base):
    __tablename__ = "venue_seats"
    __table_args__ = (UniqueConstraint("venue_row_id", "seat_label"), CheckConstraint("position >= 0"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    venue_row_id: Mapped[str] = mapped_column(ForeignKey("venue_rows.id", ondelete="CASCADE"))
    seat_label: Mapped[str] = mapped_column(String(20))
    position: Mapped[int] = mapped_column(Integer)
    seat_type: Mapped[str] = mapped_column(String(32), default="STANDARD")
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    row: Mapped[VenueRow] = relationship(back_populates="seats")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("end_at > start_at", name="ck_event_time_order"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(180), index=True)
    description: Mapped[str] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(500))
    category_id: Mapped[str] = mapped_column(ForeignKey("event_categories.id"))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id"))
    organizer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    registration_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    category: Mapped[EventCategory] = relationship()
    venue: Mapped[Venue] = relationship()
    organizer: Mapped[User] = relationship()


class EventSeat(Base):
    __tablename__ = "event_seats"
    __table_args__ = (UniqueConstraint("event_id", "venue_seat_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    venue_seat_id: Mapped[str] = mapped_column(ForeignKey("venue_seats.id"))
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    venue_seat: Mapped[VenueSeat] = relationship()


class SeatHold(Base):
    __tablename__ = "seat_holds"
    __table_args__ = (Index("ix_hold_active_event_expires", "event_id", "status", "expires_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[HoldStatus] = mapped_column(Enum(HoldStatus), default=HoldStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[list[SeatHoldItem]] = relationship(back_populates="hold", cascade="all, delete-orphan")


class SeatHoldItem(Base):
    __tablename__ = "seat_hold_items"
    __table_args__ = (UniqueConstraint("seat_hold_id", "event_seat_id"), Index("ix_hold_item_event_seat", "event_seat_id"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    seat_hold_id: Mapped[str] = mapped_column(ForeignKey("seat_holds.id", ondelete="CASCADE"))
    event_seat_id: Mapped[str] = mapped_column(ForeignKey("event_seats.id"))
    hold: Mapped[SeatHold] = relationship(back_populates="items")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (UniqueConstraint("booking_reference"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    booking_reference: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(back_populates="bookings")
    event: Mapped[Event] = relationship()
    seats: Mapped[list[BookingSeat]] = relationship(back_populates="booking", cascade="all, delete-orphan")


class BookingSeat(Base):
    __tablename__ = "booking_seats"
    __table_args__ = (
        UniqueConstraint("booking_id", "event_seat_id"),
        Index("uq_active_event_seat_booking", "event_seat_id", unique=True, postgresql_where=text("released_at IS NULL")),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"))
    event_seat_id: Mapped[str] = mapped_column(ForeignKey("event_seats.id"))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    booking: Mapped[Booking] = relationship(back_populates="seats")
    event_seat: Mapped[EventSeat] = relationship()
    ticket: Mapped[Ticket | None] = relationship(back_populates="booking_seat", uselist=False)


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    booking_seat_id: Mapped[str] = mapped_column(ForeignKey("booking_seats.id", ondelete="CASCADE"), unique=True)
    ticket_code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="VALID")
    booking_seat: Mapped[BookingSeat] = relationship(back_populates="ticket")


class EmailOutbox(Base):
    __tablename__ = "email_outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recipient: Mapped[str] = mapped_column(String(320))
    template_type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
