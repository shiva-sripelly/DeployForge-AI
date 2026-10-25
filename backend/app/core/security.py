"""Access token issuance and verification."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings
from app.core.exceptions import AuthenticationError


@dataclass(frozen=True)
class IssuedToken:
    token: str
    expires_in: int


def create_access_token(settings: Settings, user_id: uuid.UUID) -> IssuedToken:
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    claims = {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "nbf": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(
        claims, settings.jwt_secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return IssuedToken(token=token, expires_in=int(lifetime.total_seconds()))


def decode_access_token(settings: Settings, token: str) -> uuid.UUID:
    """Validate a bearer token and return the user ID it was issued for."""
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("The access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("The access token is invalid.") from exc

    try:
        return uuid.UUID(claims["sub"])
    except (ValueError, TypeError) as exc:
        raise AuthenticationError("The access token is invalid.") from exc
