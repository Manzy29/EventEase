from datetime import UTC, datetime
import io

from fastapi import APIRouter, Depends, HTTPException, Response
import qrcode
from sqlalchemy import select

from app.api.v1.deps import Db, current_user
from app.models.domain import Booking, BookingSeat, BookingStatus, SeatHold, Ticket, User
from app.schemas.contracts import BookingRequest, HoldRequest, HoldResponse, VerifyBookingOTPRequest
from app.services.booking import (
    cancel_booking,
    create_hold,
    get_user_pending_booking,
    initiate_booking,
    verify_booking_otp_and_confirm,
)

router = APIRouter(tags=["bookings"])


@router.post("/events/{event_id}/holds", response_model=HoldResponse, status_code=201)
def hold_seats(event_id: str, payload: HoldRequest, db: Db, user: User = Depends(current_user)) -> HoldResponse:
    hold = create_hold(db, user, event_id, payload.event_seat_ids)
    return HoldResponse(id=hold.id, expires_at=hold.expires_at, event_seat_ids=payload.event_seat_ids)


@router.get("/holds/{hold_id}")
def get_hold(hold_id: str, db: Db, user: User = Depends(current_user)) -> dict:
    hold = db.get(SeatHold, hold_id)
    if not hold or hold.user_id != user.id:
        raise HTTPException(status_code=404, detail="Hold not found.")
    return {"id": hold.id, "status": hold.status, "expires_at": hold.expires_at}


@router.delete("/holds/{hold_id}", status_code=204)
def release_hold(hold_id: str, db: Db, user: User = Depends(current_user)) -> None:
    hold = db.get(SeatHold, hold_id)
    if not hold or hold.user_id != user.id:
        raise HTTPException(status_code=404, detail="Hold not found.")
    hold.status = "RELEASED"
    db.commit()


@router.post("/events/{event_id}/bookings", status_code=201)
def create_booking(event_id: str, payload: BookingRequest, db: Db, user: User = Depends(current_user)) -> dict:
    """Step 1: Initiate booking and generate OTP."""
    booking, otp_code = initiate_booking(db, user, event_id, payload.hold_id)
    return {
        "id": booking.id,
        "reference": booking.booking_reference,
        "status": booking.status.value if hasattr(booking.status, "value") else str(booking.status),
        "dev_otp": otp_code,
        "message": "OTP verification code sent to your registered email.",
    }

@router.get("/events/{event_id}/pending-booking")
def get_pending_booking(event_id: str, db: Db, user: User = Depends(current_user)) -> dict:
    """Returns active pending reservation for this user and event if within hold window."""
    pending = get_user_pending_booking(db, user, event_id)
    if not pending:
        return {"has_pending": False}
    return pending

@router.post("/bookings/{booking_id}/verify-otp")
def verify_booking_otp(
    booking_id: str,
    payload: VerifyBookingOTPRequest,
    db: Db,
    hold_id: str | None = None,
    user: User = Depends(current_user),
) -> dict:
    booking = verify_booking_otp_and_confirm(db, user, booking_id, payload.otp, hold_id=hold_id)
    return {
        "id": booking.id,
        "reference": booking.booking_reference,
        "status": booking.status.value if hasattr(booking.status, "value") else str(booking.status),
        "message": "Booking confirmed successfully.",
    }


@router.post("/bookings/{booking_id}/cancel")
def cancel(booking_id: str, db: Db, user: User = Depends(current_user)) -> dict:
    """Step 3: Cancel booking and release seats."""
    booking = cancel_booking(db, user, booking_id)
    return {"id": booking.id, "status": booking.status.value if hasattr(booking.status, "value") else str(booking.status)}


@router.get("/bookings/me")
def my_bookings(db: Db, user: User = Depends(current_user)) -> list[dict]:
    bookings = db.scalars(
        select(Booking)
        .where(Booking.user_id == user.id)
        .order_by(Booking.created_at.desc())
    ).all()
    current_time = datetime.now(UTC)
    result = []
    for booking in bookings:
        event = booking.event
        seats_info = []
        tickets_info = []
        for bs in booking.seats:
            if bs.released_at is None or booking.status == BookingStatus.CANCELLED:
                if bs.event_seat and bs.event_seat.venue_seat:
                    row_lbl = bs.event_seat.venue_seat.row.row_label if bs.event_seat.venue_seat.row else ""
                    seat_lbl = bs.event_seat.venue_seat.seat_label
                    seats_info.append(f"{row_lbl}{seat_lbl}")
                if bs.ticket:
                    tickets_info.append(bs.ticket.ticket_code)

        can_cancel = (
            booking.status == BookingStatus.CONFIRMED
            and (not event or not event.cancellation_deadline or current_time <= event.cancellation_deadline)
        )

        result.append({
            "id": booking.id,
            "reference": booking.booking_reference,
            "status": booking.status.value if hasattr(booking.status, "value") else str(booking.status),
            "event_id": booking.event_id,
            "event_title": event.title if event else "Campus Event",
            "venue_name": event.venue.name if event and event.venue else "Campus Venue",
            "start_at": event.start_at if event else None,
            "end_at": event.end_at if event else None,
            "created_at": booking.created_at,
            "cancelled_at": booking.cancelled_at,
            "seats": seats_info,
            "tickets": tickets_info,
            "can_cancel": can_cancel,
        })
    return result


@router.get("/tickets/{ticket_code}/qr")
def get_ticket_qr(ticket_code: str, db: Db) -> Response:
    ticket = db.scalar(select(Ticket).where(Ticket.ticket_code == ticket_code.strip()))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    img = qrcode.make(ticket.ticket_code)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")