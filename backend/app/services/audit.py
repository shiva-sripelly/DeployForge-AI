"""Audit trail recording.

Events are added to the caller's session so they commit atomically with the
change they describe: either both persist or neither does.
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog
from app.services.context import RequestContext


def record_audit_event(
    db: Session,
    *,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None,
    actor_user_id: uuid.UUID | None,
    context: RequestContext,
    organization_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        workspace_id=workspace_id,
        details=details or {},
        request_id=context.request_id,
        ip_address=context.ip_address,
        user_agent=(context.user_agent or "")[:500] or None,
    )
    db.add(entry)
    return entry
