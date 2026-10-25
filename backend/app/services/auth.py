from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AuthenticationError
from app.core.security import IssuedToken, create_access_token
from app.models import User
from app.services.audit import record_audit_event
from app.services.context import RequestContext


def issue_dev_token(
    db: Session, settings: Settings, *, email: str, context: RequestContext
) -> IssuedToken:
    """Issue a token for an existing, active development account.

    Never provisions users: accounts must already exist (see ``app.scripts.seed_dev``).
    """
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not user.is_active:
        raise AuthenticationError("Unknown or inactive development account.")

    user.last_login_at = datetime.now(UTC)
    record_audit_event(
        db,
        action="auth.dev_token_issued",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        context=context,
    )
    db.commit()
    return create_access_token(settings, user.id)
