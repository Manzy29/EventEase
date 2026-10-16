"""Integration tests for event discovery, seat holds, booking confirmation, and ticket check-in."""


def test_list_events_and_filtering(client, test_seed_data):
    # List all
    res = client.get("/api/v1/events")
    assert res.status_code == 200
    events = res.json()
    assert len(events) >= 1
    assert events[0]["title"] == "Web Security Masterclass"

    # Filter by category
    res_cat = client.get("/api/v1/events?category=Workshop")
    assert res_cat.status_code == 200
    assert len(res_cat.json()) >= 1

    # Filter non-matching
    res_none = client.get("/api/v1/events?category=Cultural")
    assert res_none.status_code == 200
    assert len(res_none.json()) == 0


def test_get_event_seats(client, test_seed_data):
    event_id = test_seed_data["event"].id
    res = client.get(f"/api/v1/events/{event_id}/seats")
    assert res.status_code == 200
    seats = res.json()
    assert len(seats) == 5
    assert all(s["status"] == "AVAILABLE" for s in seats)


def test_hold_and_confirm_booking_and_checkin(client, test_seed_data):
    # 1. Sign in as student
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "student@example.com", "password": "Password1234!"},
    )
    student_cookie = {"campustix_session": login_res.cookies["campustix_session"]}

    # 2. Pick first 2 event seats
    event_id = test_seed_data["event"].id
    seat_ids = [s.id for s in test_seed_data["event_seats"][:2]]

    # 3. Create hold
    hold_res = client.post(
        f"/api/v1/events/{event_id}/holds",
        json={"event_seat_ids": seat_ids},
        cookies=student_cookie,
    )
    assert hold_res.status_code == 201
    hold_id = hold_res.json()["id"]

    # 4. Confirm booking
    book_res = client.post(
        f"/api/v1/events/{event_id}/bookings",
        json={"hold_id": hold_id},
        cookies=student_cookie,
    )
    assert book_res.status_code == 201
    booking_data = book_res.json()
    assert "reference" in booking_data
    assert booking_data["status"] == "CONFIRMED"

    # 5. Check my bookings
    my_bookings_res = client.get("/api/v1/bookings/me", cookies=student_cookie)
    assert my_bookings_res.status_code == 200
    bookings = my_bookings_res.json()
    assert len(bookings) == 1
    tickets = bookings[0]["tickets"]
    assert len(tickets) == 2
    ticket_code = tickets[0]

    # 6. Sign in as organizer
    org_login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "organizer@example.com", "password": "Password1234!"},
    )
    org_cookie = {"campustix_session": org_login_res.cookies["campustix_session"]}

    # 7. Check in the ticket at the door
    checkin_res = client.post(
        f"/api/v1/organizer/tickets/{ticket_code}/check-in",
        cookies=org_cookie,
    )
    assert checkin_res.status_code == 200
    checkin_data = checkin_res.json()
    assert checkin_data["status"] == "success"
    assert checkin_data["attendee_name"] == "Alice Student"

    # 8. Attempt checking in the same ticket again -> should return 409 Conflict
    duplicate_checkin_res = client.post(
        f"/api/v1/organizer/tickets/{ticket_code}/check-in",
        cookies=org_cookie,
    )
    assert duplicate_checkin_res.status_code == 409
    assert "already been used" in duplicate_checkin_res.json()["detail"].lower()
