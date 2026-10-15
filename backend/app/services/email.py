"""Transactional email sender with a transparent no-delivery development mode."""
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.domain import EmailOutbox


def queue_email(db: Session, recipient: str, template_type: str, payload: dict) -> EmailOutbox:
    item = EmailOutbox(recipient=recipient, template_type=template_type, payload=payload)
    db.add(item)
    return item


def deliver_email(db: Session, item: EmailOutbox) -> bool:
    """Deliver after commit. Missing Brevo config leaves a truthful PENDING_DEV record."""
    settings = get_settings()
    if not settings.brevo_api_key or not settings.brevo_sender_email:
        item.status = "PENDING_DEV"
        db.commit()
        return False
    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.brevo_api_key},
            json={
                "sender": {"email": settings.brevo_sender_email, "name": settings.brevo_sender_name},
                "to": [{"email": item.recipient}],
                "subject": item.payload.get("subject", "CampusTix"),
                "htmlContent": item.payload.get("html", "<p>CampusTix notification</p>"),
            },
            timeout=10,
        )
        response.raise_for_status()
        item.status, item.sent_at = "SENT", datetime.now(UTC)
        db.commit()
        return True
    except httpx.HTTPError:
        item.status, item.retry_count = "FAILED", item.retry_count + 1
        db.commit()
        return False
