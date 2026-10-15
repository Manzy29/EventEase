"""Create clear demonstration data; never represents the real IS Seminar Hall layout."""
from datetime import UTC, datetime, timedelta
import os

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.domain import Event, EventCategory, EventSeat, Role, User, Venue, VenueRow, VenueSeat


def main() -> None:
    admin_password = os.getenv("DEMO_ADMIN_PASSWORD")
    if not admin_password:
        raise SystemExit("Set DEMO_ADMIN_PASSWORD before seeding a demo administrator.")
    db = SessionLocal()
    try:
        if db.query(Venue).filter_by(name="IS Seminar Hall (sample configuration)").first():
            print("Seed data already exists."); return
        admin = User(full_name="CampusTix Administrator", email="admin@example.com", password_hash=hash_password(admin_password), role=Role.ADMIN, is_email_verified=True)
        organizer = User(full_name="Computer Society", email="organizer@example.com", password_hash=hash_password(admin_password), role=Role.ORGANIZER, is_email_verified=True)
        categories = [EventCategory(name=name, description=f"{name.title()} campus events") for name in ["TECHNICAL", "CULTURAL", "WORKSHOP", "SEMINAR", "HACKATHON", "SPORTS"]]
        venue = Venue(name="IS Seminar Hall (sample configuration)", location="Information Science Block", description="Demonstration geometry only. Replace with the measured venue layout.")
        db.add_all([admin, organizer, venue, *categories]); db.flush()
        # Deliberately small, configurable sample; not a claim about the real hall.
        physical_seats = []
        for row_index, label in enumerate(["A", "B", "C"]):
            row = VenueRow(venue_id=venue.id, row_label=label, display_order=row_index)
            db.add(row); db.flush()
            for seat_number in range(1, 9):
                seat = VenueSeat(venue_row_id=row.id, seat_label=str(seat_number), position=seat_number)
                db.add(seat); physical_seats.append(seat)
        db.flush()
        workshop = next(category for category in categories if category.name == "WORKSHOP")
        start = datetime.now(UTC) + timedelta(days=7)
        event = Event(title="Code & Coffee: AI Edition", description="Sample seed event for local demonstrations.", category_id=workshop.id, venue_id=venue.id, organizer_id=organizer.id, start_at=start, end_at=start + timedelta(hours=2), registration_opens_at=datetime.now(UTC), registration_closes_at=start - timedelta(hours=1), cancellation_deadline=start - timedelta(days=1), status="PUBLISHED")
        db.add(event); db.flush()
        db.add_all([EventSeat(event_id=event.id, venue_seat_id=seat.id) for seat in physical_seats])
        db.commit(); print("Created sample venue, 24-seat configurable layout, and event.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
