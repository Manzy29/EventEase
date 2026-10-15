"""Registration, verification, and cookie-session endpoints."""
from datetime import UTC, datetime, timedelta
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select

from app.api.v1.deps import Db, current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.domain import EmailVerificationToken, User
from app.schemas.contracts import LoginRequest, RegisterRequest, UserResponse, VerifyEmailRequest
from app.services.email import queue_email

router = APIRouter(prefix="/auth", tags=["authentication"])


def token_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def serialize(user: User) -> UserResponse:
    return UserResponse(id=user.id, full_name=user.full_name, email=user.email, role=user.role.value, is_email_verified=user.is_email_verified)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Db) -> dict[str, str]:
    email = str(payload.email).lower().strip()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Unable to create this account.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    user = User(full_name=payload.full_name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user); db.flush()
    db.add(EmailVerificationToken(user_id=user.id, token_hash=token_hash(code), expires_at=datetime.now(UTC) + timedelta(minutes=10)))
    queue_email(db, email, "EMAIL_VERIFICATION", {"subject": "Verify your CampusTix account", "html": f"<p>Your verification code is <strong>{code}</strong>.</p>"})
    db.commit()
    return {"message": "Check your email for a verification code. Development mode may queue delivery only."}


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, db: Db) -> dict[str, str]:
    email = str(payload.email).lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    token = db.scalar(select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id, EmailVerificationToken.consumed_at.is_(None)).order_by(EmailVerificationToken.created_at.desc())) if user else None
    if not user or not token or token.expires_at <= datetime.now(UTC) or token.attempt_count >= 5:
        raise HTTPException(status_code=400, detail="The verification code is invalid or expired.")
    token.attempt_count += 1
    if not secrets.compare_digest(token.token_hash, token_hash(payload.code)):
        db.commit(); raise HTTPException(status_code=400, detail="The verification code is invalid or expired.")
    token.consumed_at, user.is_email_verified = datetime.now(UTC), True
    db.commit()
    return {"message": "Email verified. You can now book tickets."}


@router.post("/login", response_model=UserResponse)
def login(payload: LoginRequest, response: Response, db: Db) -> UserResponse:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower().strip()))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    settings = get_settings()
    response.set_cookie("campustix_session", create_access_token(user.id), httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=settings.access_token_expire_minutes * 60)
    return serialize(user)


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie("campustix_session")


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> UserResponse:
    return serialize(user)
