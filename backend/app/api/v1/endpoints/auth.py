from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, RequestCtx, SettingsDep
from app.schemas.auth import DevTokenRequest, TokenResponse, UserRead
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Mounted only when DEV_AUTH_ENABLED=true, which configuration forbids in production.
dev_router = APIRouter(prefix="/auth/dev", tags=["auth (development only)"])


@dev_router.post("/token", response_model=TokenResponse, summary="Issue a development token")
def issue_dev_token(
    body: DevTokenRequest, db: DbSession, settings: SettingsDep, context: RequestCtx
) -> TokenResponse:
    issued = auth_service.issue_dev_token(db, settings, email=body.email, context=context)
    return TokenResponse(access_token=issued.token, expires_in=issued.expires_in)


@router.get("/me", response_model=UserRead, summary="Current user")
def read_current_user(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
