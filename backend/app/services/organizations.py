import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    Workspace,
    WorkspaceEnvironment,
    WorkspaceStatus,
)
from app.schemas.audit_log import AuditLogRead
from app.schemas.common import Page, PaginationParams
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationStats,
    OrganizationWithRole,
)
from app.services.audit import record_audit_event
from app.services.authorization import OrganizationAccess
from app.services.common import commit_or_conflict, slugify, with_random_suffix
from app.services.context import RequestContext

_SLUG_CONFLICT = "An organization with this slug already exists."


def _slug_taken(db: Session, slug: str) -> bool:
    return db.scalar(select(Organization.id).where(Organization.slug == slug)) is not None


def to_organization_with_role(org: Organization, role: OrganizationRole) -> OrganizationWithRole:
    return OrganizationWithRole(**OrganizationRead.model_validate(org).model_dump(), role=role)


def create_organization(
    db: Session, *, actor: User, data: OrganizationCreate, context: RequestContext
) -> OrganizationWithRole:
    if data.slug:
        slug = data.slug
        if _slug_taken(db, slug):
            raise ConflictError(_SLUG_CONFLICT, details={"field": "slug"})
    else:
        slug = slugify(data.name)
        if _slug_taken(db, slug):
            slug = with_random_suffix(slug)

    organization = Organization(name=data.name, slug=slug, created_by_id=actor.id)
    db.add(organization)
    db.flush()
    db.add(
        OrganizationMembership(
            organization_id=organization.id, user_id=actor.id, role=OrganizationRole.OWNER
        )
    )
    record_audit_event(
        db,
        action="organization.created",
        resource_type="organization",
        resource_id=organization.id,
        actor_user_id=actor.id,
        organization_id=organization.id,
        context=context,
        details={"name": organization.name, "slug": organization.slug},
    )
    commit_or_conflict(db, _SLUG_CONFLICT)
    db.refresh(organization)
    return to_organization_with_role(organization, OrganizationRole.OWNER)


def list_organizations(
    db: Session, *, user: User, pagination: PaginationParams
) -> Page[OrganizationWithRole]:
    query = (
        select(Organization, OrganizationMembership.role)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(OrganizationMembership.user_id == user.id)
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(Organization.name, Organization.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    ).all()
    return Page(
        items=[to_organization_with_role(org, role) for org, role in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


def get_organization_stats(db: Session, access: OrganizationAccess) -> OrganizationStats:
    org_id = access.organization.id

    by_environment = {env.value: 0 for env in WorkspaceEnvironment}
    workspaces_total = workspaces_active = 0
    for environment, status, count in db.execute(
        select(Workspace.environment, Workspace.status, func.count())
        .where(Workspace.organization_id == org_id)
        .group_by(Workspace.environment, Workspace.status)
    ):
        by_environment[environment.value] += count
        workspaces_total += count
        if status == WorkspaceStatus.ACTIVE:
            workspaces_active += count

    members_by_role = {role.value: 0 for role in OrganizationRole}
    for role, count in db.execute(
        select(OrganizationMembership.role, func.count())
        .where(OrganizationMembership.organization_id == org_id)
        .group_by(OrganizationMembership.role)
    ):
        members_by_role[role.value] = count

    since = datetime.now(UTC) - timedelta(days=7)
    recent_events, last_activity_at = db.execute(
        select(
            func.count().filter(AuditLog.created_at >= since),
            func.max(AuditLog.created_at),
        ).where(AuditLog.organization_id == org_id)
    ).one()

    return OrganizationStats(
        organization_id=org_id,
        workspaces_total=workspaces_total,
        workspaces_active=workspaces_active,
        workspaces_by_environment=by_environment,
        members_total=sum(members_by_role.values()),
        members_by_role=members_by_role,
        audit_events_last_7_days=recent_events,
        last_activity_at=last_activity_at,
    )


def list_audit_logs(
    db: Session, *, organization_id: uuid.UUID, pagination: PaginationParams
) -> Page[AuditLogRead]:
    total = (
        db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.organization_id == organization_id)
        )
        or 0
    )
    rows = db.execute(
        select(AuditLog, User.email)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(AuditLog.organization_id == organization_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    ).all()
    items = [
        AuditLogRead.model_validate(entry).model_copy(update={"actor_email": email})
        for entry, email in rows
    ]
    return Page(items=items, total=total, limit=pagination.limit, offset=pagination.offset)
