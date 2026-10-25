"""Tenant-aware authorization checks.

Resources the caller cannot see are reported as 404 (not 403) so that IDs from
other tenants cannot be probed. 403 is reserved for resources the caller can
see but lacks the role to modify.
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
)
from app.models.organization import ORG_MANAGER_ROLES


@dataclass(frozen=True)
class OrganizationAccess:
    organization: Organization
    role: OrganizationRole

    @property
    def is_manager(self) -> bool:
        return self.role in ORG_MANAGER_ROLES


@dataclass(frozen=True)
class WorkspaceAccess:
    workspace: Workspace
    organization_role: OrganizationRole
    workspace_role: WorkspaceRole | None


def get_organization_access(
    db: Session, organization_id: uuid.UUID, user: User
) -> OrganizationAccess:
    row = db.execute(
        select(Organization, OrganizationMembership.role)
        .join(
            OrganizationMembership,
            and_(
                OrganizationMembership.organization_id == Organization.id,
                OrganizationMembership.user_id == user.id,
            ),
        )
        .where(Organization.id == organization_id)
    ).first()
    if row is None:
        raise NotFoundError("Organization not found.")
    return OrganizationAccess(organization=row[0], role=row[1])


def require_organization_role(
    access: OrganizationAccess, allowed: Collection[OrganizationRole], action: str
) -> None:
    if access.role not in allowed:
        raise PermissionDeniedError(
            f"Your organization role '{access.role.value}' does not permit you to {action}.",
            details={"required_roles": sorted(role.value for role in allowed)},
        )


def get_workspace_access(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceAccess:
    """Organization owners/admins can see every workspace; others need a workspace membership."""
    row = db.execute(
        select(Workspace, OrganizationMembership.role, WorkspaceMembership.role)
        .join(
            OrganizationMembership,
            and_(
                OrganizationMembership.organization_id == Workspace.organization_id,
                OrganizationMembership.user_id == user.id,
            ),
        )
        .outerjoin(
            WorkspaceMembership,
            and_(
                WorkspaceMembership.workspace_id == Workspace.id,
                WorkspaceMembership.user_id == user.id,
            ),
        )
        .where(Workspace.id == workspace_id)
    ).first()
    if row is None:
        raise NotFoundError("Workspace not found.")
    workspace, org_role, workspace_role = row
    if org_role not in ORG_MANAGER_ROLES and workspace_role is None:
        raise NotFoundError("Workspace not found.")
    return WorkspaceAccess(
        workspace=workspace, organization_role=org_role, workspace_role=workspace_role
    )
