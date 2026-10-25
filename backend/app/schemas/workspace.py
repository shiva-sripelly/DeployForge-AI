import uuid
from datetime import datetime
from typing import Annotated

from pydantic import StringConstraints

from app.models.organization import OrganizationRole
from app.models.workspace import WorkspaceEnvironment, WorkspaceRole, WorkspaceStatus
from app.schemas.common import InputModel, Name, ORMModel, Slug

Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class WorkspaceCreate(InputModel):
    name: Name
    slug: Slug | None = None
    description: Description | None = None
    environment: WorkspaceEnvironment = WorkspaceEnvironment.DEVELOPMENT


class WorkspaceRead(ORMModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    environment: WorkspaceEnvironment
    status: WorkspaceStatus
    created_at: datetime
    updated_at: datetime


class WorkspaceAccessRead(ORMModel):
    """The caller's effective access to a workspace."""

    organization_role: OrganizationRole
    workspace_role: WorkspaceRole | None


class WorkspaceDetail(WorkspaceRead):
    access: WorkspaceAccessRead


class WorkspaceStats(ORMModel):
    workspace_id: uuid.UUID
    members_total: int
    members_by_role: dict[str, int]
    audit_events_total: int
    audit_events_last_7_days: int
    last_activity_at: datetime | None
