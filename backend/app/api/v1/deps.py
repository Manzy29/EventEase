"""Authentication/authorization dependencies enforced by every protected route."""
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db
from app.models.domain import Role, User

Db = Annotated[Session, Depends(get_db)]


def current_user(db: Db, campustix_session: str | None = Cookie(default=None)) -> User:
    user_id = decode_access_token(campustix_session) if campustix_session else None
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator permission required.")
    return user
