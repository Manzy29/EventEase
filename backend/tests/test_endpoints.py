from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_organizer_endpoints_require_auth() -> None:
    response = client.get("/api/v1/organizer/events")
    assert response.status_code == 401

    response = client.get("/api/v1/bookings/me")
    assert response.status_code == 401

