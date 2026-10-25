from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, exists, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.models import (
    AuditLog,
    User,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
    WorkspaceStatus,
)
from app.models.organization import ORG_MANAGER_ROLES
from app.schemas.common import Page, PaginationParams
from app.schemas.workspace import (
    WorkspaceAccessRead,
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceRead,
    WorkspaceStats,
)
from app.services.audit import record_audit_event
from app.services.authorization import (
    OrganizationAccess,
    WorkspaceAccess,
    require_organization_role,
)
from app.services.common import commit_or_conflict, slugify, with_random_suffix
from app.services.context import RequestContext

_SLUG_CONFLICT = "A workspace with this slug already exists in the organization."


def to_workspace_detail(access: WorkspaceAccess) -> WorkspaceDetail:
    return WorkspaceDetail(
        **WorkspaceRead.model_validate(access.workspace).model_dump(),
        access=WorkspaceAccessRead(
            organization_role=access.organization_role, workspace_role=access.workspace_role
        ),
    )


def create_workspace(
    db: Session,
    *,
    actor: User,
    org_access: OrganizationAccess,
    data: WorkspaceCreate,
    context: RequestContext,
) -> WorkspaceDetail:
    require_organization_role(org_access, ORG_MANAGER_ROLES, "create workspaces")
    org_id = org_access.organization.id

    def slug_taken(slug: str) -> bool:
        return (
            db.scalar(
                select(Workspace.id).where(
                    Workspace.organization_id == org_id, Workspace.slug == slug
                )
            )
            is not None
        )

    if data.slug:
        slug = data.slug
        if slug_taken(slug):
            raise ConflictError(_SLUG_CONFLICT, details={"field": "slug"})
    else:
        slug = slugify(data.name)
        if slug_taken(slug):
            slug = with_random_suffix(slug)

    workspace = Workspace(
        organization_id=org_id,
        name=data.name,
        slug=slug,
        description=data.description or None,
        environment=data.environment,
        created_by_id=actor.id,
    )
    db.add(workspace)
    db.flush()
    db.add(
        WorkspaceMembership(
            workspace_id=workspace.id,
            organization_id=org_id,
            user_id=actor.id,
            role=WorkspaceRole.ADMIN,
        )
    )
    record_audit_event(
        db,
        action="workspace.created",
        resource_type="workspace",
        resource_id=workspace.id,
        actor_user_id=actor.id,
        organization_id=org_id,
        workspace_id=workspace.id,
        context=context,
        details={
            "name": workspace.name,
            "slug": workspace.slug,
            "environment": workspace.environment.value,
        },
    )
    commit_or_conflict(db, _SLUG_CONFLICT)
    db.refresh(workspace)
    return to_workspace_detail(
        WorkspaceAccess(
            workspace=workspace,
            organization_role=org_access.role,
            workspace_role=WorkspaceRole.ADMIN,
        )
    )


def list_workspaces(
    db: Session,
    *,
    user: User,
    org_access: OrganizationAccess,
    pagination: PaginationParams,
    status: WorkspaceStatus | None = None,
) -> Page[WorkspaceRead]:
    """List workspaces visible to the caller within one organization."""
    query = select(Workspace).where(Workspace.organization_id == org_access.organization.id)
    if not org_access.is_manager:
        query = query.where(
            exists().where(
                and_(
                    WorkspaceMembership.workspace_id == Workspace.id,
                    WorkspaceMembership.user_id == user.id,
                )
            )
        )
    if status is not None:
        query = query.where(Workspace.status == status)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    workspaces = db.scalars(
        query.order_by(Workspace.name, Workspace.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    ).all()
    return Page(
        items=[WorkspaceRead.model_validate(ws) for ws in workspaces],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


def get_workspace_stats(db: Session, access: WorkspaceAccess) -> WorkspaceStats:
    workspace_id = access.workspace.id

    members_by_role = {role.value: 0 for role in WorkspaceRole}
    for role, count in db.execute(
        select(WorkspaceMembership.role, func.count())
        .where(WorkspaceMembership.workspace_id == workspace_id)
        .group_by(WorkspaceMembership.role)
    ):
        members_by_role[role.value] = count

    since = datetime.now(UTC) - timedelta(days=7)
    total_events, recent_events, last_activity_at = db.execute(
        select(
            func.count(),
            func.count().filter(AuditLog.created_at >= since),
            func.max(AuditLog.created_at),
        ).where(AuditLog.workspace_id == workspace_id)
    ).one()

    return WorkspaceStats(
        workspace_id=workspace_id,
        members_total=sum(members_by_role.values()),
        members_by_role=members_by_role,
        audit_events_total=total_events,
        audit_events_last_7_days=recent_events,
        last_activity_at=last_activity_at,
    )
