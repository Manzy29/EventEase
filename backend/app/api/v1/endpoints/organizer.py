"""Organizer dashboard, event management, and attendee reporting endpoints."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.deps import Db, current_user, organizer_user
from app.api.v1.endpoints.events import availability_counts
from app.models.domain import (
    Booking, BookingSeat, BookingStatus, Event, EventCategory, EventSeat, Role, Ticket, User, Venue,
    VenueRow, VenueSeat,
)

router = APIRouter(prefix="/organizer", tags=["organizer"])


class CreateEventPayload(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=5)
    category_id: str
    venue_id: str
    start_at: datetime
    end_at: datetime
    cancellation_deadline: datetime | None = None
    poster_url: str | None = None


@router.get("/venues")
def list_venues(db: Db, user: User = Depends(organizer_user)) -> list[dict]:
    venues = db.scalars(select(Venue).where(Venue.is_active.is_(True))).all()
    return [{"id": v.id, "name": v.name, "location": v.location, "description": v.description} for v in venues]


@router.get("/categories")
def list_categories(db: Db, user: User = Depends(organizer_user)) -> list[dict]:
    categories = db.scalars(select(EventCategory).order_by(EventCategory.name)).all()
    return [{"id": c.id, "name": c.name, "description": c.description} for c in categories]


@router.get("/events")
def list_organizer_events(db: Db, user: User = Depends(organizer_user)) -> list[dict]:
    if user.role == Role.ADMIN:
        statement = select(Event).order_by(Event.start_at.desc())
    else:
        statement = select(Event).where(Event.organizer_id == user.id).order_by(Event.start_at.desc())

    events = db.scalars(statement).all()
    result = []
    for ev in events:
        counts = availability_counts(db, ev.id)
        booking_count = db.scalar(
            select(func.count()).select_from(Booking).where(Booking.event_id == ev.id)
        ) or 0
        result.append({
            "id": ev.id,
            "title": ev.title,
            "description": ev.description,
            "category": ev.category.name if ev.category else "General",
            "venue": ev.venue.name if ev.venue else "TBD",
            "start_at": ev.start_at,
            "end_at": ev.end_at,
            "status": ev.status,
            "total_seats": counts["total"],
            "available_seats": counts["available"],
            "booked_seats": counts["booked"],
            "held_seats": counts["held"],
            "total_bookings": booking_count,
        })
    return result


@router.get("/events/{event_id}/attendees")
def list_event_attendees(event_id: str, db: Db, user: User = Depends(organizer_user)) -> list[dict]:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found.")
    if user.role != Role.ADMIN and ev.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view attendees for this event.")

    bookings = db.scalars(
        select(Booking).where(Booking.event_id == event_id).order_by(Booking.created_at.desc())
    ).all()
    attendees = []
    for b in bookings:
        seats = []
        tickets = []
        for s in b.seats:
            if s.event_seat and s.event_seat.venue_seat:
                row = s.event_seat.venue_seat.row.row_label if s.event_seat.venue_seat.row else ""
                seats.append(f"{row}{s.event_seat.venue_seat.seat_label}")
            if s.ticket:
                tickets.append(s.ticket.ticket_code)
        attendees.append({
            "booking_id": b.id,
            "booking_reference": b.booking_reference,
            "status": b.status.value if hasattr(b.status, "value") else str(b.status),
            "attendee_name": b.user.full_name if b.user else "Anonymous",
            "attendee_email": b.user.email if b.user else "",
            "seats": seats,
            "tickets": tickets,
            "created_at": b.created_at,
        })
    return attendees


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: CreateEventPayload, db: Db, user: User = Depends(organizer_user)) -> dict:
    if payload.end_at <= payload.start_at:
        raise HTTPException(status_code=422, detail="End date must be after start date.")

    category = db.get(EventCategory, payload.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    venue = db.get(Venue, payload.venue_id)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found.")

    venue_seats = db.scalars(
        select(VenueSeat).join(VenueRow).where(VenueRow.venue_id == venue.id, VenueSeat.is_active.is_(True))
    ).all()
    if not venue_seats:
        raise HTTPException(status_code=400, detail="The selected venue has no configured seats.")

    cancellation_deadline = payload.cancellation_deadline or (payload.start_at - timedelta(hours=2))

    event = Event(
        title=payload.title.strip(),
        description=payload.description.strip(),
        category_id=category.id,
        venue_id=venue.id,
        organizer_id=user.id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        registration_opens_at=datetime.now(UTC),
        registration_closes_at=payload.start_at,
        cancellation_deadline=cancellation_deadline,
        status="PUBLISHED",
        poster_url=payload.poster_url,
    )
    db.add(event)
    db.flush()

    db.add_all([EventSeat(event_id=event.id, venue_seat_id=s.id) for s in venue_seats])
    db.commit()
    db.refresh(event)

    return {"id": event.id, "title": event.title, "status": event.status, "message": "Event published successfully."}


class UpdateEventPayload(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, min_length=5)
    start_at: datetime | None = None
    end_at: datetime | None = None
    cancellation_deadline: datetime | None = None
    poster_url: str | None = None


@router.put("/events/{event_id}")
def update_event(event_id: str, payload: UpdateEventPayload, db: Db, user: User = Depends(organizer_user)) -> dict:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if user.role != Role.ADMIN and event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own events.")

    if payload.title is not None:
        event.title = payload.title.strip()
    if payload.description is not None:
        event.description = payload.description.strip()
    if payload.poster_url is not None:
        event.poster_url = payload.poster_url
    if payload.start_at is not None:
        event.start_at = payload.start_at
    if payload.end_at is not None:
        event.end_at = payload.end_at
    if payload.cancellation_deadline is not None:
        event.cancellation_deadline = payload.cancellation_deadline

    if event.end_at <= event.start_at:
        raise HTTPException(status_code=422, detail="Event end time must be after the start time.")

    db.commit()
    db.refresh(event)
    return {"id": event.id, "title": event.title, "status": event.status, "message": "Event updated successfully."}


@router.post("/events/{event_id}/cancel")
def cancel_event(event_id: str, db: Db, user: User = Depends(organizer_user)) -> dict:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if user.role != Role.ADMIN and event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="You can only cancel your own events.")

    event.status = "CANCELLED"
    bookings = db.scalars(select(Booking).where(Booking.event_id == event_id, Booking.status == BookingStatus.CONFIRMED)).all()
    now_ts = datetime.now(UTC)
    for b in bookings:
        b.status = BookingStatus.CANCELLED
        b.cancelled_at = now_ts
        for bs in b.seats:
            if bs.released_at is None:
                bs.released_at = now_ts
    db.commit()
    return {"message": f"Event '{event.title}' and all associated bookings have been cancelled."}


@router.post("/tickets/{ticket_code}/check-in")
def check_in_ticket(ticket_code: str, db: Db, user: User = Depends(organizer_user)) -> dict:
    """Validate and admit an attendee using their ticket barcode or alphanumeric code."""
    ticket = db.scalar(
        select(Ticket)
        .options(
            joinedload(Ticket.booking_seat).joinedload(BookingSeat.booking).joinedload(Booking.event),
            joinedload(Ticket.booking_seat).joinedload(BookingSeat.booking).joinedload(Booking.user),
            joinedload(Ticket.booking_seat).joinedload(BookingSeat.event_seat).joinedload(EventSeat.venue_seat).joinedload(VenueSeat.row),
        )
        .where(Ticket.ticket_code == ticket_code.strip())
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Invalid ticket code.")

    booking_seat = ticket.booking_seat
    booking = booking_seat.booking if booking_seat else None
    event = booking.event if booking else None

    if not event:
        raise HTTPException(status_code=404, detail="Associated event not found.")

    if user.role != Role.ADMIN and event.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="You can only check in attendees for your own events.")

    if ticket.status == "USED":
        check_time = ticket.checked_in_at.isoformat() if ticket.checked_in_at else "previously"
        raise HTTPException(
            status_code=409,
            detail=f"Ticket has already been used and was checked in at {check_time}."
        )

    if ticket.status != "VALID" or (booking and booking.status != BookingStatus.CONFIRMED):
        raise HTTPException(status_code=400, detail="Ticket is no longer valid or booking was cancelled.")

    ticket.status = "USED"
    ticket.checked_in_at = datetime.now(UTC)
    db.commit()

    seat_label = f"{booking_seat.event_seat.venue_seat.row.row_label}{booking_seat.event_seat.venue_seat.seat_label}" if (booking_seat and booking_seat.event_seat and booking_seat.event_seat.venue_seat) else "Assigned"
    attendee = booking.user.full_name if (booking and booking.user) else "Attendee"

    return {
        "status": "success",
        "message": f"Successfully admitted {attendee} for seat {seat_label}.",
        "ticket_code": ticket.ticket_code,
        "attendee_name": attendee,
        "event_title": event.title,
        "seat_label": seat_label,
        "checked_in_at": ticket.checked_in_at.isoformat(),
    }


@router.post("/claim-role")
def claim_organizer_role(db: Db, user: User = Depends(current_user)) -> dict:
    user.role = Role.ORGANIZER
    db.commit()
    return {"message": "You are now registered as an event organizer.", "role": user.role.value}
