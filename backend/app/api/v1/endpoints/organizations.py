import uuid

from fastapi import APIRouter
from fastapi import status as http_status

from app.api.deps import CurrentUser, DbSession, Pagination, RequestCtx
from app.models import WorkspaceStatus
from app.models.organization import ORG_MANAGER_ROLES
from app.schemas.audit_log import AuditLogRead
from app.schemas.common import Page
from app.schemas.organization import OrganizationCreate, OrganizationStats, OrganizationWithRole
from app.schemas.workspace import WorkspaceCreate, WorkspaceDetail, WorkspaceRead
from app.services import organizations as organization_service
from app.services import workspaces as workspace_service
from app.services.authorization import get_organization_access, require_organization_role

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post(
    "",
    response_model=OrganizationWithRole,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create an organization",
)
def create_organization(
    body: OrganizationCreate, user: CurrentUser, db: DbSession, context: RequestCtx
) -> OrganizationWithRole:
    """Create a tenant organization. The caller becomes its owner."""
    return organization_service.create_organization(db, actor=user, data=body, context=context)


@router.get("", response_model=Page[OrganizationWithRole], summary="List my organizations")
def list_organizations(
    user: CurrentUser, db: DbSession, pagination: Pagination
) -> Page[OrganizationWithRole]:
    return organization_service.list_organizations(db, user=user, pagination=pagination)


@router.get(
    "/{organization_id}", response_model=OrganizationWithRole, summary="Get an organization"
)
def get_organization(
    organization_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> OrganizationWithRole:
    access = get_organization_access(db, organization_id, user)
    return organization_service.to_organization_with_role(access.organization, access.role)


@router.get(
    "/{organization_id}/stats",
    response_model=OrganizationStats,
    summary="Organization statistics",
)
def get_organization_stats(
    organization_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> OrganizationStats:
    access = get_organization_access(db, organization_id, user)
    return organization_service.get_organization_stats(db, access)


@router.get(
    "/{organization_id}/audit-logs",
    response_model=Page[AuditLogRead],
    summary="Organization audit log (owners and admins)",
)
def list_audit_logs(
    organization_id: uuid.UUID, user: CurrentUser, db: DbSession, pagination: Pagination
) -> Page[AuditLogRead]:
    access = get_organization_access(db, organization_id, user)
    require_organization_role(access, ORG_MANAGER_ROLES, "view the audit log")
    return organization_service.list_audit_logs(
        db, organization_id=organization_id, pagination=pagination
    )


@router.post(
    "/{organization_id}/workspaces",
    response_model=WorkspaceDetail,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a workspace (owners and admins)",
)
def create_workspace(
    organization_id: uuid.UUID,
    body: WorkspaceCreate,
    user: CurrentUser,
    db: DbSession,
    context: RequestCtx,
) -> WorkspaceDetail:
    access = get_organization_access(db, organization_id, user)
    return workspace_service.create_workspace(
        db, actor=user, org_access=access, data=body, context=context
    )


@router.get(
    "/{organization_id}/workspaces",
    response_model=Page[WorkspaceRead],
    summary="List workspaces visible to me",
)
def list_workspaces(
    organization_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    status: WorkspaceStatus | None = None,
) -> Page[WorkspaceRead]:
    access = get_organization_access(db, organization_id, user)
    return workspace_service.list_workspaces(
        db, user=user, org_access=access, pagination=pagination, status=status
    )
