"""Atomic hold, confirmation, and cancellation workflows.

PostgreSQL row locks serialize competing hold/booking attempts. The partial
unique index on active booking_seats is the final guard against double booking.
"""
from datetime import UTC, datetime, timedelta
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.models.domain import (
    Booking, BookingSeat, BookingStatus, Event, EventSeat, HoldStatus,
    SeatHold, SeatHoldItem, Ticket, User,
)
from app.services.email import queue_email


def now() -> datetime:
    return datetime.now(UTC)


def expire_holds(db: Session, event_id: str | None = None) -> None:
    query = update(SeatHold).where(SeatHold.status == HoldStatus.ACTIVE, SeatHold.expires_at <= now())
    if event_id:
        query = query.where(SeatHold.event_id == event_id)
    db.execute(query.values(status=HoldStatus.EXPIRED))


def create_hold(db: Session, user: User, event_id: str, seat_ids: list[str]) -> SeatHold:
    settings = get_settings()
    unique_ids = sorted(set(seat_ids))
    if len(unique_ids) != len(seat_ids) or len(unique_ids) > settings.max_seats_per_booking:
        raise HTTPException(status_code=422, detail="Choose between 1 and the configured seat limit.")
    if db.in_transaction():
        db.commit()
    with db.begin():
        event = db.get(Event, event_id)
        if not event or event.status != "PUBLISHED":
            raise HTTPException(status_code=404, detail="This event is not open for booking.")
        if not user.is_email_verified or not user.is_active:
            raise HTTPException(status_code=403, detail="A verified active account is required to reserve seats.")
        expire_holds(db, event_id)
        seats = db.scalars(
            select(EventSeat).where(EventSeat.id.in_(unique_ids), EventSeat.event_id == event_id).order_by(EventSeat.id).with_for_update()
        ).all()
        if len(seats) != len(unique_ids) or any(seat.is_blocked for seat in seats):
            raise HTTPException(status_code=409, detail="One or more seats are not available.")
        booked = db.scalar(select(BookingSeat.id).where(BookingSeat.event_seat_id.in_(unique_ids), BookingSeat.released_at.is_(None)).limit(1))
        held = db.scalar(
            select(SeatHoldItem.id).join(SeatHold).where(
                SeatHoldItem.event_seat_id.in_(unique_ids), SeatHold.status == HoldStatus.ACTIVE, SeatHold.expires_at > now()
            ).limit(1)
        )
        if booked or held:
            raise HTTPException(status_code=409, detail="One or more seats were just reserved. Refresh and try again.")
        hold = SeatHold(user_id=user.id, event_id=event_id, expires_at=now() + timedelta(minutes=settings.seat_hold_minutes))
        db.add(hold)
        db.flush()
        db.add_all([SeatHoldItem(seat_hold_id=hold.id, event_seat_id=seat_id) for seat_id in unique_ids])
    db.refresh(hold)
    return hold


def confirm_hold(db: Session, user: User, event_id: str, hold_id: str) -> Booking:
    if db.in_transaction():
        db.commit()
    with db.begin():
        expire_holds(db, event_id)
        hold = db.scalar(
            select(SeatHold).options(joinedload(SeatHold.items)).where(SeatHold.id == hold_id).with_for_update()
        )
        if not hold or hold.user_id != user.id or hold.event_id != event_id or hold.status != HoldStatus.ACTIVE or hold.expires_at <= now():
            raise HTTPException(status_code=409, detail="This reservation hold is unavailable or expired.")
        seat_ids = sorted(item.event_seat_id for item in hold.items)
        db.scalars(select(EventSeat).where(EventSeat.id.in_(seat_ids)).order_by(EventSeat.id).with_for_update()).all()
        existing = db.scalar(select(BookingSeat.id).where(BookingSeat.event_seat_id.in_(seat_ids), BookingSeat.released_at.is_(None)).limit(1))
        if existing:
            raise HTTPException(status_code=409, detail="A selected seat is no longer available.")
        reference = f"CTX-{secrets.token_hex(5).upper()}"
        booking = Booking(booking_reference=reference, user_id=user.id, event_id=event_id, status=BookingStatus.CONFIRMED, confirmed_at=now())
        db.add(booking)
        db.flush()
        booking_seats = [BookingSeat(booking_id=booking.id, event_seat_id=seat_id) for seat_id in seat_ids]
        db.add_all(booking_seats)
        db.flush()
        db.add_all([Ticket(booking_seat_id=item.id, ticket_code=f"TIX-{secrets.token_urlsafe(10)}") for item in booking_seats])
        hold.status = HoldStatus.CONSUMED
        queue_email(db, user.email, "BOOKING_CONFIRMATION", {"subject": f"CampusTix booking {reference}", "booking_reference": reference})
    db.refresh(booking)
    return booking


def cancel_booking(db: Session, user: User, booking_id: str) -> Booking:
    if db.in_transaction():
        db.commit()
    with db.begin():
        booking = db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if not booking or booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking not found.")
        if booking.status != BookingStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail="Only confirmed bookings can be cancelled.")
        event = db.get(Event, booking.event_id)
        if event and event.cancellation_deadline and now() > event.cancellation_deadline:
            raise HTTPException(status_code=409, detail="The cancellation deadline has passed.")
        booking.status, booking.cancelled_at = BookingStatus.CANCELLED, now()
        db.execute(update(BookingSeat).where(BookingSeat.booking_id == booking.id, BookingSeat.released_at.is_(None)).values(released_at=now()))
        queue_email(db, user.email, "BOOKING_CANCELLATION", {"subject": f"CampusTix cancellation {booking.booking_reference}"})
    return booking
