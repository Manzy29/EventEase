"""Organizer dashboard, event management, and attendee reporting endpoints."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.v1.deps import Db, current_user, organizer_user
from app.api.v1.endpoints.events import availability_counts
from app.models.domain import (
    Booking, BookingSeat, Event, EventCategory, EventSeat, Role, User, Venue,
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
def list_venues(db: Db) -> list[dict]:
    venues = db.scalars(select(Venue).where(Venue.is_active.is_(True))).all()
    return [{"id": v.id, "name": v.name, "location": v.location, "description": v.description} for v in venues]


@router.get("/categories")
def list_categories(db: Db) -> list[dict]:
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


@router.post("/claim-role")
def claim_organizer_role(db: Db, user: User = Depends(current_user)) -> dict:
    user.role = Role.ORGANIZER
    db.commit()
    return {"message": "You are now registered as an event organizer.", "role": user.role.value}
