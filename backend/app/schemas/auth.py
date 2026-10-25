import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr

from app.schemas.common import InputModel, ORMModel


class DevTokenRequest(InputModel):
    email: EmailStr


class TokenResponse(ORMModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  (OAuth token type, not a secret)
    expires_in: int


class UserRead(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
