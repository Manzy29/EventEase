"""Unit and integration tests for authentication and user sessions."""


def test_register_new_user(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Bob Builder",
            "email": "bob@example.com",
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 201
    assert "verification code" in response.json()["message"].lower()


def test_register_duplicate_email_fails(client, test_seed_data):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Alice Duplicate",
            "email": "student@example.com",
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 409


def test_login_success_sets_session_cookie(client, test_seed_data):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "student@example.com",
            "password": "Password1234!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "student@example.com"
    assert data["role"] == "STUDENT"
    assert "campustix_session" in response.cookies


def test_login_invalid_password_fails(client, test_seed_data):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "student@example.com",
            "password": "WrongPassword!",
        },
    )
    assert response.status_code == 401


def test_me_authenticated(client, test_seed_data):
    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email": "student@example.com",
            "password": "Password1234!",
        },
    )
    cookie = login_res.cookies["campustix_session"]

    me_res = client.get("/api/v1/auth/me", cookies={"campustix_session": cookie})
    assert me_res.status_code == 200
    assert me_res.json()["full_name"] == "Alice Student"


def test_logout_clears_cookie(client):
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
