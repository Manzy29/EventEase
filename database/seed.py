"""Create rich demonstration data across multiple venues, categories, events, and bookings.

Usage:
    python ../database/seed.py --reset   (from backend folder)
    python database/seed.py --reset      (from project root)
"""
from datetime import UTC, datetime, timedelta
from pathlib import Path
import secrets
import sys

# Ensure backend directory is in sys.path regardless of execution location
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import Base, SessionLocal
from app.models.domain import (
    Booking, BookingSeat, BookingStatus, Event, EventCategory, EventSeat,
    Role, SeatHold, SeatHoldItem, Ticket, User, Venue, VenueRow, VenueSeat
)


def ensure_schema_updated(db: Session) -> None:
    """Ensure all tables and new columns exist before seeding."""
    Base.metadata.create_all(bind=db.get_bind())
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        try:
            db.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;"))
            db.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_url VARCHAR(500);"))
            db.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_price NUMERIC(10,2) DEFAULT 0.00;"))
            db.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0.00;"))
            db.commit()
        except Exception:
            db.rollback()


def seed_database(db: Session, reset: bool = False, admin_password: str = "CampusTix@2026") -> dict:
    """Populates the database with demonstration data. If reset=True, purges existing records first."""
    ensure_schema_updated(db)

    if reset:
        print("Reset flag active: clearing existing bookings, events, and venues...")
        # Optional tables (cancellations and OTPs)
        try:
            from app.models.domain import BookingOTPVerification, Cancellation
            db.query(Cancellation).delete()
            db.query(BookingOTPVerification).delete()
        except Exception:
            pass

        # Core tables in foreign-key dependency order
        db.query(Ticket).delete()
        db.query(BookingSeat).delete()
        db.query(SeatHoldItem).delete()
        db.query(SeatHold).delete()
        db.query(Booking).delete()
        db.query(EventSeat).delete()
        db.query(Event).delete()
        db.query(VenueSeat).delete()
        db.query(VenueRow).delete()
        db.query(Venue).delete()
        db.query(EventCategory).delete()

        # Delete demo accounts
        demo_emails = [
            "admin@example.com",
            "organizer@example.com",
            "cultural@example.com",
            "alice@example.com",
            "bob@example.com",
        ]
        db.query(User).filter(User.email.in_(demo_emails)).delete(synchronize_session=False)
        db.commit()

    # 1. Users (Admin, Organizers, and Students)
    user_specs = [
        {"name": "CampusTix Administrator", "email": "admin@example.com", "role": Role.ADMIN},
        {"name": "Computer Society", "email": "organizer@example.com", "role": Role.ORGANIZER},
        {"name": "Fine Arts & Cultural Club", "email": "cultural@example.com", "role": Role.ORGANIZER},
        {"name": "Alice Sharma", "email": "alice@example.com", "role": Role.STUDENT},
        {"name": "Bob Martinez", "email": "bob@example.com", "role": Role.STUDENT},
    ]

    users: dict[str, User] = {}
    pw_hash = hash_password(admin_password)
    for spec in user_specs:
        existing = db.query(User).filter_by(email=spec["email"]).first()
        if not existing:
            u = User(
                full_name=spec["name"],
                email=spec["email"],
                password_hash=pw_hash,
                role=spec["role"],
                is_email_verified=True,
            )
            db.add(u)
            db.flush()
            users[spec["email"]] = u
        else:
            users[spec["email"]] = existing

    # 2. Categories
    cat_names = ["TECHNICAL", "CULTURAL", "WORKSHOP", "SEMINAR", "HACKATHON", "SPORTS"]
    categories: dict[str, EventCategory] = {}
    for name in cat_names:
        existing = db.query(EventCategory).filter_by(name=name).first()
        if not existing:
            c = EventCategory(name=name, description=f"{name.title()} campus events")
            db.add(c)
            db.flush()
            categories[name] = c
        else:
            categories[name] = existing

    # 3. Venue 1: IS Seminar Hall (Actual 7-Row Curved Amphitheatre Layout)
    venue1 = db.query(Venue).filter(Venue.name.ilike("IS Seminar Hall%")).first()
    v1_seats: list[VenueSeat] = []
    row_configs = [
        ("A", 7),
        ("B", 9),
        ("C", 11),
        ("D", 13),
        ("E", 15),
        ("F", 17),
        ("G", 17),
    ]

    if not venue1:
        venue1 = Venue(
            name="IS Seminar Hall",
            location="Information Science Block,Ground Floor",
            description="Acoustically treated seminar hall with dual projection screens and amphitheatric seating.",
        )
        db.add(venue1)
        db.flush()

        for r_idx, (r_label, half_count) in enumerate(row_configs):
            row = VenueRow(venue_id=venue1.id, row_label=r_label, display_order=r_idx + 1)
            db.add(row)
            db.flush()
            pos = 1
            # Left Wing (L1..Ln)
            for s in range(1, half_count + 1):
                seat = VenueSeat(venue_row_id=row.id, seat_label=f"L{s}", position=pos)
                db.add(seat)
                v1_seats.append(seat)
                pos += 1
            # Right Wing (R1..Rn)
            for s in range(1, half_count + 1):
                seat = VenueSeat(venue_row_id=row.id, seat_label=f"R{s}", position=pos)
                db.add(seat)
                v1_seats.append(seat)
                pos += 1
        db.flush()
    else:
        v1_seats = (
            db.query(VenueSeat)
            .join(VenueRow)
            .filter(VenueRow.venue_id == venue1.id)
            .order_by(VenueRow.display_order, VenueSeat.position)
            .all()
        )

    # 4. Venue 2: Main Campus Auditorium (36 seats)
    venue2 = db.query(Venue).filter_by(name="Sir MV Central Auditorium").first()
    v2_seats: list[VenueSeat] = []
    if not venue2:
        venue2 = Venue(
            name="Sir MV Central Auditorium",
            location="Administrative Block",
            description="Large auditorium with tiered seating for cultural nights and college fests.",
        )
        db.add(venue2)
        db.flush()
        for r_idx, r_label in enumerate(["A", "B", "C"]):
            row = VenueRow(venue_id=venue2.id, row_label=r_label, display_order=r_idx + 1)
            db.add(row)
            db.flush()
            for s_num in range(1, 13):
                seat = VenueSeat(venue_row_id=row.id, seat_label=str(s_num), position=s_num)
                db.add(seat)
                v2_seats.append(seat)
        db.flush()
    else:
        v2_seats = (
            db.query(VenueSeat)
            .join(VenueRow)
            .filter(VenueRow.venue_id == venue2.id)
            .order_by(VenueRow.display_order, VenueSeat.position)
            .all()
        )

    # 5. Events with Dynamic Ticket Pricing
    now = datetime.now(UTC)
    events_config = [
        {
            "title": "Code & Coffee: AI Edition",
            "description": "Practical tools, good coffee, and hands-on guidance on using modern AI coding agents.",
            "category": categories["WORKSHOP"],
            "venue": venue1,
            "seats": v1_seats,
            "ticket_price": 50.00,  # ₹50
            "organizer": users["organizer@example.com"],
            "start": now + timedelta(days=2, hours=10),
            "duration_hours": 3,
        },
        {
            "title": "HackCamp 2026: 24h Campus Hackathon",
            "description": "Annual 24-hour sprint building real applications for campus sustainability and smart mobility.",
            "category": categories["HACKATHON"],
            "venue": venue1,
            "seats": v1_seats,
            "ticket_price": 100.00,  # ₹100
            "organizer": users["organizer@example.com"],
            "start": now + timedelta(days=5, hours=9),
            "duration_hours": 24,
        },
        {
            "title": "Symphony Night: Classical & Fusion Concert",
            "description": "Live orchestral and fusion musical performances by collegiate bands and guest artists.",
            "category": categories["CULTURAL"],
            "venue": venue2,
            "seats": v2_seats,
            "ticket_price": 150.00,  # ₹150
            "organizer": users["cultural@example.com"],
            "start": now + timedelta(days=7, hours=18),
            "duration_hours": 4,
        },
        {
            "title": "Cloud Native Architecture & Kubernetes",
            "description": "Deep dive into microservices, containerization, and distributed database consistency models.",
            "category": categories["TECHNICAL"],
            "venue": venue1,
            "seats": v1_seats,
            "ticket_price": 0.00,  # Free
            "organizer": users["organizer@example.com"],
            "start": now + timedelta(days=10, hours=14),
            "duration_hours": 2,
        },
    ]

    created_events: list[tuple[Event, list[EventSeat]]] = []
    for cfg in events_config:
        event = db.query(Event).filter_by(title=cfg["title"]).first()
        if not event:
            start_at = cfg["start"]
            end_at = start_at + timedelta(hours=cfg["duration_hours"])
            event = Event(
                title=cfg["title"],
                description=cfg["description"],
                category_id=cfg["category"].id,
                venue_id=cfg["venue"].id,
                organizer_id=cfg["organizer"].id,
                ticket_price=float(cfg["ticket_price"]),
                start_at=start_at,
                end_at=end_at,
                registration_opens_at=now - timedelta(days=2),
                registration_closes_at=start_at - timedelta(hours=1),
                cancellation_deadline=start_at - timedelta(days=1),
                status="PUBLISHED",
            )
            db.add(event)
            db.flush()

            event_seats = [EventSeat(event_id=event.id, venue_seat_id=s.id) for s in cfg["seats"]]
            db.add_all(event_seats)
            db.flush()
            created_events.append((event, event_seats))
        else:
            event_seats = db.query(EventSeat).filter_by(event_id=event.id).all()
            created_events.append((event, event_seats))

    # 6. Sample Initial Bookings with Revenue Calculation
    event1, event1_seats = created_events[0]
    alice = users["alice@example.com"]
    alice_existing = db.query(Booking).filter_by(user_id=alice.id, event_id=event1.id).first()
    if not alice_existing and len(event1_seats) >= 2:
        unit_price = float(getattr(event1, "ticket_price", 50.0) or 50.0)
        alice_booking = Booking(
            booking_reference=f"CTX-{secrets.token_hex(5).upper()}",
            user_id=alice.id,
            event_id=event1.id,
            status=BookingStatus.CONFIRMED,
            total_amount=unit_price * 2,  # 2 seats * ₹50 = ₹100
            confirmed_at=now - timedelta(hours=5),
        )
        db.add(alice_booking)
        db.flush()

        for es in event1_seats[:2]:
            bs = BookingSeat(booking_id=alice_booking.id, event_seat_id=es.id)
            db.add(bs)
            db.flush()
            db.add(Ticket(booking_seat_id=bs.id, ticket_code=f"TIX-{secrets.token_urlsafe(10)}"))

    event3, event3_seats = created_events[2]
    bob = users["bob@example.com"]
    bob_existing = db.query(Booking).filter_by(user_id=bob.id, event_id=event3.id).first()
    if not bob_existing and len(event3_seats) >= 1:
        unit_price = float(getattr(event3, "ticket_price", 150.0) or 150.0)
        bob_booking = Booking(
            booking_reference=f"CTX-{secrets.token_hex(5).upper()}",
            user_id=bob.id,
            event_id=event3.id,
            status=BookingStatus.CONFIRMED,
            total_amount=unit_price * 1,  # 1 seat * ₹150 = ₹150
            confirmed_at=now - timedelta(hours=2),
        )
        db.add(bob_booking)
        db.flush()

        for es in event3_seats[:1]:
            bs = BookingSeat(booking_id=bob_booking.id, event_seat_id=es.id)
            db.add(bs)
            db.flush()
            db.add(Ticket(booking_seat_id=bs.id, ticket_code=f"TIX-{secrets.token_urlsafe(10)}"))

    db.commit()

    return {
        "venues_count": db.query(Venue).count(),
        "seats_count": db.query(VenueSeat).count(),
        "events_count": db.query(Event).count(),
        "bookings_count": db.query(Booking).count(),
    }


if __name__ == "__main__":
    db = SessionLocal()
    try:
        summary = seed_database(db, reset="--reset" in sys.argv)
        print("Database seeded successfully with prices & layout!")
        print(summary)
    finally:
        db.close()