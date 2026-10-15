"""Add ticket checkin and event poster columns safely.

Revision ID: 0002_add_checkin_poster
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_add_checkin_poster"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    ticket_cols = [c["name"] for c in inspector.get_columns("tickets")]
    if "checked_in_at" not in ticket_cols:
        op.add_column("tickets", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))

    event_cols = [c["name"] for c in inspector.get_columns("events")]
    if "poster_url" not in event_cols:
        op.add_column("events", sa.Column("poster_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    ticket_cols = [c["name"] for c in inspector.get_columns("tickets")]
    if "checked_in_at" in ticket_cols:
        op.drop_column("tickets", "checked_in_at")

    event_cols = [c["name"] for c in inspector.get_columns("events")]
    if "poster_url" in event_cols:
        op.drop_column("events", "poster_url")
