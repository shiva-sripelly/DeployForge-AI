import uuid
from datetime import datetime

from app.models.organization import OrganizationRole
from app.schemas.common import InputModel, Name, ORMModel, Slug


class OrganizationCreate(InputModel):
    name: Name
    slug: Slug | None = None


class OrganizationRead(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime


class OrganizationWithRole(OrganizationRead):
    role: OrganizationRole


class OrganizationStats(ORMModel):
    organization_id: uuid.UUID
    workspaces_total: int
    workspaces_active: int
    workspaces_by_environment: dict[str, int]
    members_total: int
    members_by_role: dict[str, int]
    audit_events_last_7_days: int
    last_activity_at: datetime | None
