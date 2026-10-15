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



