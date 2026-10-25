"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.exceptions import AuthenticationError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.schemas.common import PaginationParams
from app.services.context import RequestContext

_bearer_scheme = HTTPBearer(
    auto_error=False,
    description="Access token. In Phase 1 development, obtain one from /auth/dev/token.",
)

DbSession = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_request_context(request: Request) -> RequestContext:
    return RequestContext(
        request_id=getattr(request.state, "request_id", None),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def get_current_user(
    db: DbSession,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Authentication is required.")
    user_id = decode_access_token(settings, credentials.credentials)
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("The account for this token is not active.")
    return user


RequestCtx = Annotated[RequestContext, Depends(get_request_context)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Pagination = Annotated[PaginationParams, Query()]
