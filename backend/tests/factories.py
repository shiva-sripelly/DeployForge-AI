"""Helpers for building test data directly through the ORM."""

import uuid

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import create_access_token
from app.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    Workspace,
    WorkspaceEnvironment,
    WorkspaceMembership,
    WorkspaceRole,
)


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def create_user(db: Session, *, email: str | None = None, is_active: bool = True) -> User:
    user = User(
        email=email or f"{unique('user')}@example.com",
        full_name="Test User",
        is_active=is_active,
    )
    db.add(user)
    db.flush()
    return user


def create_organization(
    db: Session, *, owner: User | None = None, slug: str | None = None
) -> Organization:
    org = Organization(
        name="Test Organization",
        slug=slug or unique("org"),
        created_by_id=owner.id if owner else None,
    )
    db.add(org)
    db.flush()
    if owner is not None:
        add_org_member(db, org, owner, OrganizationRole.OWNER)
    return org


def add_org_member(
    db: Session, org: Organization, user: User, role: OrganizationRole
) -> OrganizationMembership:
    membership = OrganizationMembership(organization_id=org.id, user_id=user.id, role=role)
    db.add(membership)
    db.flush()
    return membership


def create_workspace(
    db: Session,
    org: Organization,
    *,
    slug: str | None = None,
    environment: WorkspaceEnvironment = WorkspaceEnvironment.DEVELOPMENT,
) -> Workspace:
    workspace = Workspace(
        organization_id=org.id,
        name="Test Workspace",
        slug=slug or unique("ws"),
        environment=environment,
    )
    db.add(workspace)
    db.flush()
    return workspace


def add_workspace_member(
    db: Session, workspace: Workspace, user: User, role: WorkspaceRole
) -> WorkspaceMembership:
    membership = WorkspaceMembership(
        workspace_id=workspace.id,
        organization_id=workspace.organization_id,
        user_id=user.id,
        role=role,
    )
    db.add(membership)
    db.flush()
    return membership


def auth_headers(settings: Settings, user: User) -> dict[str, str]:
    token = create_access_token(settings, user.id).token
    return {"Authorization": f"Bearer {token}"}
