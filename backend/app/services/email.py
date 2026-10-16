"""Transactional email sender using Brevo HTTPS API with instant dispatch and terminal diagnostics."""
from datetime import UTC, datetime
import threading

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.domain import EmailOutbox


def send_brevo_instant(outbox_id: str, recipient: str, subject: str, html_content: str) -> bool:
    """Dispatches email immediately to Brevo API over HTTPS (Port 443)."""
    settings = get_settings()

    # Fallback if Brevo credentials are not in .env
    if not settings.brevo_api_key or not settings.brevo_sender_email:
        print("\n" + "=" * 65)
        print(" [EMAIL DEV FALLBACK] - Brevo credentials missing in backend/.env")
        print(f" Recipient: {recipient}")
        print(f" Subject:   {subject}")
        print(f" Content:   {html_content}")
        print("=" * 65 + "\n")
        return False

    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": settings.brevo_api_key.strip(),
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "sender": {
                    "email": settings.brevo_sender_email.strip(),
                    "name": settings.brevo_sender_name,
                },
                "to": [{"email": recipient.strip()}],
                "subject": subject,
                "htmlContent": html_content,
            },
            timeout=8.0,
        )

        if response.status_code >= 400:
            print("\n" + "!" * 65)
            print(f" [BREVO ERROR {response.status_code}] Failed to send email to {recipient}")
            print(f" Details: {response.text}")
            print(f" TIP: Ensure '{settings.brevo_sender_email}' is a verified sender in Brevo!")
            print("!" * 65 + "\n")

            with SessionLocal() as db:
                item = db.get(EmailOutbox, outbox_id)
                if item:
                    item.status = "FAILED"
                    item.retry_count += 1
                    db.commit()
            return False

        # Success: update database outbox status
        with SessionLocal() as db:
            item = db.get(EmailOutbox, outbox_id)
            if item:
                item.status = "SENT"
                item.sent_at = datetime.now(UTC)
                db.commit()

        print(f"\n>>> [EMAIL DELIVERED] Real-time email sent via Brevo to {recipient} <<<\n")
        return True

    except Exception as exc:
        print(f"\n[BREVO CONNECTION ERROR] {exc}\n")
        with SessionLocal() as db:
            item = db.get(EmailOutbox, outbox_id)
            if item:
                item.status = "FAILED"
                item.retry_count += 1
                db.commit()
        return False


def queue_email(db: Session, recipient: str, template_type: str, payload: dict) -> EmailOutbox:
    """Stores record in email_outbox and dispatches real-time thread."""
    item = EmailOutbox(recipient=recipient, template_type=template_type, payload=payload)
    db.add(item)
    db.flush()

    subject = payload.get("subject", "CampusTix Notification")
    html_content = payload.get("html", f"<p>{subject}</p>")

    # Trigger immediately in background thread so the HTTP endpoint responds in milliseconds
    threading.Thread(
        target=send_brevo_instant,
        args=(item.id, recipient, subject, html_content),
        daemon=True,
    ).start()

    return item


def deliver_email(db: Session, item: EmailOutbox) -> bool:
    if item.status == "SENT":
        return True
    return send_brevo_instant(
        item.id,
        item.recipient,
        item.payload.get("subject", "CampusTix"),
        item.payload.get("html", "<p>CampusTix notification</p>"),
    )


def process_outbox(db: Session, limit: int = 20) -> int:
    from sqlalchemy import select
    items = db.scalars(
        select(EmailOutbox)
        .where(EmailOutbox.status == "FAILED", EmailOutbox.retry_count < 3)
        .order_by(EmailOutbox.created_at.asc())
        .limit(limit)
    ).all()
    count = 0
    for item in items:
        if deliver_email(db, item):
            count += 1
    return count