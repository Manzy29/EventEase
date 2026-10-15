"""Read-only event discovery and authoritative seat availability."""
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.v1.deps import Db
from app.models.domain import BookingSeat, Event, EventCategory, EventSeat, HoldStatus, SeatHold, SeatHoldItem
from app.schemas.contracts import EventListItem

router = APIRouter(prefix="/events", tags=["events"])


def availability_counts(db: Db, event_id: str) -> dict[str, int]:
    current = datetime.now(UTC)
    blocked = db.scalar(select(func.count()).select_from(EventSeat).where(EventSeat.event_id == event_id, EventSeat.is_blocked.is_(True))) or 0
    booked = db.scalar(select(func.count()).select_from(BookingSeat).join(EventSeat).where(EventSeat.event_id == event_id, BookingSeat.released_at.is_(None))) or 0
    held = db.scalar(select(func.count()).select_from(SeatHoldItem).join(SeatHold).where(SeatHold.event_id == event_id, SeatHold.status == HoldStatus.ACTIVE, SeatHold.expires_at > current)) or 0
    total = db.scalar(select(func.count()).select_from(EventSeat).where(EventSeat.event_id == event_id)) or 0
    return {"total": total, "available": total - blocked - booked - held, "booked": booked, "held": held, "blocked": blocked}


def event_data(db: Db, event: Event) -> EventListItem:
    counts = availability_counts(db, event.id)
    return EventListItem(id=event.id, title=event.title, description=event.description, category=event.category.name, venue=event.venue.name, organizer=event.organizer.full_name, start_at=event.start_at, end_at=event.end_at, available_seats=counts["available"], poster_url=event.poster_url)


@router.get("", response_model=list[EventListItem])
def list_events(db: Db, search: str | None = None, category: str | None = None, limit: int = Query(24, le=100)) -> list[EventListItem]:
    statement = select(Event).where(Event.status == "PUBLISHED").order_by(Event.start_at).limit(limit)
    if search:
        statement = statement.where(Event.title.ilike(f"%{search.strip()}%"))
    if category:
        statement = statement.join(Event.category).where(func.lower(EventCategory.name) == category.lower())
    return [event_data(db, event) for event in db.scalars(statement).unique().all()]


@router.get("/{event_id}", response_model=EventListItem)
def get_event(event_id: str, db: Db) -> EventListItem:
    event = db.get(Event, event_id)
    if not event or event.status != "PUBLISHED":
        raise HTTPException(status_code=404, detail="Event not found.")
    return event_data(db, event)


@router.get("/{event_id}/availability")
def availability(event_id: str, db: Db) -> dict[str, int]:
    if not db.get(Event, event_id):
        raise HTTPException(status_code=404, detail="Event not found.")
    return availability_counts(db, event_id)


@router.get("/{event_id}/seats")
def seats(event_id: str, db: Db) -> list[dict[str, str | bool | int]]:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    current = datetime.now(UTC)
    booked = set(db.scalars(select(BookingSeat.event_seat_id).join(EventSeat).where(EventSeat.event_id == event_id, BookingSeat.released_at.is_(None))).all())
    held = set(db.scalars(select(SeatHoldItem.event_seat_id).join(SeatHold).where(SeatHold.event_id == event_id, SeatHold.status == HoldStatus.ACTIVE, SeatHold.expires_at > current)).all())
    rows = db.scalars(select(EventSeat).where(EventSeat.event_id == event_id)).all()
    return [{"id": item.id, "label": f"{item.venue_seat.row.row_label}{item.venue_seat.seat_label}", "row": item.venue_seat.row.row_label, "position": item.venue_seat.position, "status": "BLOCKED" if item.is_blocked or not item.venue_seat.is_active else "BOOKED" if item.id in booked else "HELD" if item.id in held else "AVAILABLE", "accessible": item.venue_seat.is_accessible} for item in rows]
