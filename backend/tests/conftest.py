"""Test configuration and isolated in-memory SQLite fixtures."""
from datetime import UTC, datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.session import Base, get_db
from app.main import app
from app.models.domain import (
    Event, EventCategory, EventSeat, Role, User, Venue, VenueRow, VenueSeat
)


# In-memory SQLite with StaticPool ensures all connections share the same memory DB
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_seed_data(db_session):
    """Seed test organizer, student, venue, and a published event."""
    student = User(
        full_name="Alice Student",
        email="student@example.com",
        password_hash=hash_password("Password1234!"),
        role=Role.STUDENT,
        is_email_verified=True,
    )
    organizer = User(
        full_name="Campus Tech Society",
        email="organizer@example.com",
        password_hash=hash_password("Password1234!"),
        role=Role.ORGANIZER,
        is_email_verified=True,
    )
    admin = User(
        full_name="System Admin",
        email="admin@example.com",
        password_hash=hash_password("Password1234!"),
        role=Role.ADMIN,
        is_email_verified=True,
    )
    db_session.add_all([student, organizer, admin])
    db_session.flush()

    category = EventCategory(name="Workshop", description="Hands-on workshop events")
    db_session.add(category)
    db_session.flush()

    venue = Venue(name="Auditorium 1", location="Academic Block A", description="Main hall")
    db_session.add(venue)
    db_session.flush()

    row_a = VenueRow(venue_id=venue.id, row_label="A", display_order=1)
    db_session.add(row_a)
    db_session.flush()

    seats = [
        VenueSeat(venue_row_id=row_a.id, seat_label=str(i), position=i, is_accessible=True)
        for i in range(1, 6)
    ]
    db_session.add_all(seats)
    db_session.flush()

    now = datetime.now(UTC)
    event = Event(
        title="Web Security Masterclass",
        description="Learn modern web application security practices.",
        category_id=category.id,
        venue_id=venue.id,
        organizer_id=organizer.id,
        start_at=now + timedelta(days=3),
        end_at=now + timedelta(days=3, hours=3),
        registration_opens_at=now - timedelta(days=1),
        registration_closes_at=now + timedelta(days=2),
        cancellation_deadline=now + timedelta(days=2),
        status="PUBLISHED",
    )
    db_session.add(event)
    db_session.flush()

    event_seats = [EventSeat(event_id=event.id, venue_seat_id=s.id) for s in seats]
    db_session.add_all(event_seats)
    db_session.commit()

    return {
        "student": student,
        "organizer": organizer,
        "admin": admin,
        "category": category,
        "venue": venue,
        "event": event,
        "seats": seats,
        "event_seats": event_seats,
    }
