from datetime import UTC, datetime, timedelta


def test_organizer_endpoints_require_auth(client) -> None:
    response = client.get("/api/v1/organizer/events")
    assert response.status_code == 401

    response = client.get("/api/v1/organizer/venues")
    assert response.status_code == 401

    response = client.get("/api/v1/organizer/categories")
    assert response.status_code == 401

    response = client.get("/api/v1/bookings/me")
    assert response.status_code == 401


def test_public_event_listing(client, test_seed_data) -> None:
    response = client.get("/api/v1/events")
    assert response.status_code == 200
    events = response.json()
    assert len(events) >= 1
    assert events[0]["title"] == "Web Security Masterclass"
    assert events[0]["available_seats"] == 5


def test_past_event_listing_and_details(client, db_session, test_seed_data) -> None:
    event = test_seed_data["event"]
    now = datetime.now(UTC)
    event.start_at = now - timedelta(days=2)
    event.end_at = now - timedelta(days=1)
    event.registration_opens_at = None
    event.registration_closes_at = None
    db_session.commit()

    assert client.get("/api/v1/events").json() == []
    response = client.get("/api/v1/events", params={"past": True, "search": "Masterclass", "category": "workshop"})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [event.id]
    assert client.get(f"/api/v1/events/{event.id}").status_code == 200
    assert client.get("/api/v1/events", params={"past": True, "category": "sports"}).json() == []

    login = client.post("/api/v1/auth/login", json={"email": "student@example.com", "password": "Password1234!"})
    assert login.status_code == 200
    hold = client.post(
        f"/api/v1/events/{event.id}/holds",
        json={"event_seat_ids": [test_seed_data["event_seats"][0].id]},
    )
    assert hold.status_code == 400
    assert hold.json()["detail"] == "This event has ended."

    event.status = "DRAFT"
    db_session.commit()
    assert client.get("/api/v1/events", params={"past": True}).json() == []
