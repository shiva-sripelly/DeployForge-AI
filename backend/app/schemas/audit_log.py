import uuid
from datetime import datetime
from typing import Any

from app.schemas.common import ORMModel


class AuditLogRead(ORMModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    workspace_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_email: str | None = None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    details: dict[str, Any]
    request_id: str | None
    created_at: datetime
