"""Protected seat holding, confirmation, cancellation, and booking history."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.v1.deps import Db, current_user
from app.models.domain import Booking, BookingSeat, SeatHold, User
from app.schemas.contracts import BookingRequest, HoldRequest, HoldResponse
from app.services.booking import cancel_booking, confirm_hold, create_hold

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
    hold.status = "RELEASED"; db.commit()


@router.post("/events/{event_id}/bookings", status_code=201)
def create_booking(event_id: str, payload: BookingRequest, db: Db, user: User = Depends(current_user)) -> dict:
    booking = confirm_hold(db, user, event_id, payload.hold_id)
    return {"id": booking.id, "reference": booking.booking_reference, "status": booking.status}


@router.post("/bookings/{booking_id}/cancel")
def cancel(booking_id: str, db: Db, user: User = Depends(current_user)) -> dict:
    booking = cancel_booking(db, user, booking_id)
    return {"id": booking.id, "status": booking.status}


@router.get("/bookings/me")
def my_bookings(db: Db, user: User = Depends(current_user)) -> list[dict]:
    bookings = db.scalars(select(Booking).where(Booking.user_id == user.id).order_by(Booking.created_at.desc())).all()
    return [{"id": booking.id, "reference": booking.booking_reference, "status": booking.status, "event_id": booking.event_id, "created_at": booking.created_at} for booking in bookings]
