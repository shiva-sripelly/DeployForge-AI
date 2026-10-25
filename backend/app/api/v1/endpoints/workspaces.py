import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.workspace import WorkspaceDetail, WorkspaceStats
from app.services import workspaces as workspace_service
from app.services.authorization import get_workspace_access

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("/{workspace_id}", response_model=WorkspaceDetail, summary="Get a workspace")
def get_workspace(workspace_id: uuid.UUID, user: CurrentUser, db: DbSession) -> WorkspaceDetail:
    return workspace_service.to_workspace_detail(get_workspace_access(db, workspace_id, user))


@router.get("/{workspace_id}/stats", response_model=WorkspaceStats, summary="Workspace statistics")
def get_workspace_stats(
    workspace_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> WorkspaceStats:
    access = get_workspace_access(db, workspace_id, user)
    return workspace_service.get_workspace_stats(db, access)
