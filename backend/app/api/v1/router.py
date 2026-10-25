from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, organizations, workspaces
from app.core.config import Settings
from app.schemas.common import ErrorResponse

_PROTECTED_RESPONSES: dict[int | str, dict[str, object]] = {
    401: {"model": ErrorResponse, "description": "Missing or invalid credentials"},
    403: {"model": ErrorResponse, "description": "Insufficient role"},
    404: {"model": ErrorResponse, "description": "Not found or not visible to the caller"},
    422: {"model": ErrorResponse, "description": "Validation error"},
}


def build_api_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    router.include_router(health.router)
    if settings.dev_auth_enabled:
        router.include_router(auth.dev_router)
    router.include_router(auth.router, responses=_PROTECTED_RESPONSES)
    router.include_router(organizations.router, responses=_PROTECTED_RESPONSES)
    router.include_router(workspaces.router, responses=_PROTECTED_RESPONSES)
    return router
