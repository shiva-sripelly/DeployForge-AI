from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("length(btrim(full_name)) > 0", name="full_name_not_blank"),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true(), default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
