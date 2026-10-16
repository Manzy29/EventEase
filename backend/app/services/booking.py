"""Atomic hold, confirmation, and cancellation workflows.

PostgreSQL row locks serialize competing hold/booking attempts. The partial
unique index on active booking_seats is the final guard against double booking.
"""
from datetime import UTC, datetime, timedelta
import hashlib
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.domain import (
    Booking, BookingOTPVerification, BookingSeat, BookingStatus, Cancellation,
    Event, EventSeat, HoldStatus, SeatHold, SeatHoldItem, Ticket, User,
)
from app.services.email import queue_email


def token_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()

def now() -> datetime:
    return datetime.now(UTC)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


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
        current_time = now()
        reg_opens = ensure_utc(event.registration_opens_at)
        reg_closes = ensure_utc(event.registration_closes_at)
        if reg_opens and current_time < reg_opens:
            raise HTTPException(status_code=400, detail="Registration for this event has not opened yet.")
        if reg_closes and current_time > reg_closes:
            raise HTTPException(status_code=400, detail="Registration for this event has closed.")
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


def initiate_booking(db: Session, user: User, event_id: str, hold_id: str) -> tuple[Booking, str]:
    """Phase 1: Validate hold, create PENDING_VERIFICATION booking, generate OTP."""
    if db.in_transaction():
        db.commit()
    with db.begin():
        expire_holds(db, event_id)
        hold = db.scalar(
            select(SeatHold).options(selectinload(SeatHold.items)).where(SeatHold.id == hold_id).with_for_update()
        )
        expires_at = ensure_utc(hold.expires_at) if hold else None
        if not hold or hold.user_id != user.id or hold.event_id != event_id or hold.status != HoldStatus.ACTIVE or (expires_at and expires_at <= now()):
            raise HTTPException(status_code=409, detail="This reservation hold is unavailable or expired.")

        reference = f"CTX-{secrets.token_hex(5).upper()}"
        booking = Booking(
            booking_reference=reference,
            user_id=user.id,
            event_id=event_id,
            status=BookingStatus.PENDING,
        )
        db.add(booking)
        db.flush()

        # Generate 6-digit OTP code valid for 5 minutes
        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        otp_record = BookingOTPVerification(
            booking_id=booking.id,
            otp_hash=token_hash(otp_code),
            expires_at=now() + timedelta(minutes=5),
        )
        db.add(otp_record)

        # Queue verification email
        queue_email(
            db,
            user.email,
            "BOOKING_OTP",
            {
                "subject": f"Confirm your booking {reference}",
                "html": f"<p>Your confirmation OTP is <strong>{otp_code}</strong>. Valid for 5 minutes.</p>",
            },
        )
    db.refresh(booking)
    return booking, otp_code


def verify_booking_otp_and_confirm(
    db: Session, user: User, booking_id: str, otp: str, hold_id: str | None = None
) -> Booking:
    if db.in_transaction():
        db.commit()
    with db.begin():
        booking = db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if not booking or booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking record not found.")

        if booking.status != BookingStatus.PENDING:
            raise HTTPException(status_code=409, detail="Booking is not awaiting verification.")

        # If hold_id wasn't passed, find the user's active hold automatically
        if hold_id:
            hold = db.scalar(
                select(SeatHold).options(selectinload(SeatHold.items)).where(SeatHold.id == hold_id).with_for_update()
            )
        else:
            hold = db.scalar(
                select(SeatHold)
                .options(selectinload(SeatHold.items))
                .where(
                    SeatHold.user_id == user.id,
                    SeatHold.event_id == booking.event_id,
                    SeatHold.status == HoldStatus.ACTIVE,
                    SeatHold.expires_at > now(),
                )
                .with_for_update()
            )

        expires_at = ensure_utc(hold.expires_at) if hold else None
        if not hold or hold.user_id != user.id or hold.status != HoldStatus.ACTIVE or (expires_at and expires_at <= now()):
            raise HTTPException(status_code=409, detail="Your seat hold has expired. Please select seats again.")

        # Check OTP record
        otp_record = db.scalar(
            select(BookingOTPVerification)
            .where(BookingOTPVerification.booking_id == booking.id, BookingOTPVerification.consumed_at.is_(None))
            .order_by(BookingOTPVerification.created_at.desc())
        )
        if not otp_record or otp_record.expires_at <= now() or otp_record.attempt_count >= 5:
            raise HTTPException(status_code=400, detail="The OTP code is invalid or expired.")

        otp_record.attempt_count += 1
        if not secrets.compare_digest(otp_record.otp_hash, token_hash(otp)):
            raise HTTPException(status_code=400, detail="Incorrect verification code.")

        seat_ids = sorted(item.event_seat_id for item in hold.items)
        db.scalars(select(EventSeat).where(EventSeat.id.in_(seat_ids)).order_by(EventSeat.id).with_for_update()).all()
        existing = db.scalar(select(BookingSeat.id).where(BookingSeat.event_seat_id.in_(seat_ids), BookingSeat.released_at.is_(None)).limit(1))
        if existing:
            raise HTTPException(status_code=409, detail="A selected seat is no longer available.")

        otp_record.consumed_at = now()
        booking.status = BookingStatus.CONFIRMED
        booking.confirmed_at = now()

        booking_seats = [BookingSeat(booking_id=booking.id, event_seat_id=s_id) for s_id in seat_ids]
        db.add_all(booking_seats)
        db.flush()
        db.add_all([Ticket(booking_seat_id=item.id, ticket_code=f"TIX-{secrets.token_urlsafe(10)}") for item in booking_seats])

        hold.status = HoldStatus.CONSUMED
        queue_email(
            db,
            user.email,
            "BOOKING_CONFIRMATION",
            {"subject": f"CampusTix booking {booking.booking_reference}", "booking_reference": booking.booking_reference},
        )
    db.refresh(booking)
    return booking

def get_user_pending_booking(db: Session, user: User, event_id: str) -> dict | None:
    """Checks if the user has an unexpired PENDING booking and active SeatHold for this event."""
    expire_holds(db, event_id)

    # 1. Look for a PENDING booking for this user on this event
    booking = db.scalar(
        select(Booking)
        .where(
            Booking.user_id == user.id,
            Booking.event_id == event_id,
            Booking.status == BookingStatus.PENDING,
        )
        .order_by(Booking.created_at.desc())
    )
    if not booking:
        return None

    # 2. Look for the matching active hold that hasn't expired
    hold = db.scalar(
        select(SeatHold)
        .options(selectinload(SeatHold.items))
        .where(
            SeatHold.user_id == user.id,
            SeatHold.event_id == event_id,
            SeatHold.status == HoldStatus.ACTIVE,
            SeatHold.expires_at > now(),
        )
    )
    if not hold:
        return None

    return {
        "has_pending": True,
        "booking_id": booking.id,
        "reference": booking.booking_reference,
        "hold_id": hold.id,
        "expires_at": hold.expires_at.isoformat(),
        "seat_ids": [item.event_seat_id for item in hold.items],
    }

def cancel_booking(db: Session, user: User, booking_id: str, reason: str = "User cancelled") -> Booking:
    if db.in_transaction():
        db.commit()
    with db.begin():
        booking = db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if not booking or booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking not found.")
        if booking.status != BookingStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail="Only confirmed bookings can be cancelled.")
        event = db.get(Event, booking.event_id)
        deadline = ensure_utc(event.cancellation_deadline) if event else None
        if deadline and now() > deadline:
            raise HTTPException(status_code=409, detail="The cancellation deadline has passed.")

        booking.status, booking.cancelled_at = BookingStatus.CANCELLED, now()
        db.execute(update(BookingSeat).where(BookingSeat.booking_id == booking.id, BookingSeat.released_at.is_(None)).values(released_at=now()))

        # Record cancellation in Cancellations table
        db.add(Cancellation(booking_id=booking.id, user_id=user.id, reason=reason))
        queue_email(db, user.email, "BOOKING_CANCELLATION", {"subject": f"CampusTix cancellation {booking.booking_reference}"})
    return booking