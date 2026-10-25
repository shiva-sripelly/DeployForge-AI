import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import AuditLog
from tests.conftest import TEST_JWT_SECRET, build_test_app, make_settings
from tests.factories import auth_headers, create_user

PROTECTED_ENDPOINTS = [
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/organizations"),
    ("POST", "/api/v1/organizations"),
    ("GET", f"/api/v1/organizations/{uuid.uuid4()}"),
    ("GET", f"/api/v1/organizations/{uuid.uuid4()}/stats"),
    ("GET", f"/api/v1/organizations/{uuid.uuid4()}/audit-logs"),
    ("GET", f"/api/v1/organizations/{uuid.uuid4()}/workspaces"),
    ("POST", f"/api/v1/organizations/{uuid.uuid4()}/workspaces"),
    ("GET", f"/api/v1/workspaces/{uuid.uuid4()}"),
    ("GET", f"/api/v1/workspaces/{uuid.uuid4()}/stats"),
]


def _token(settings: Settings, user_id: uuid.UUID, **overrides: object) -> str:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256")


@pytest.mark.parametrize(("method", "path"), PROTECTED_ENDPOINTS)
def test_protected_endpoints_reject_anonymous_requests(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path, json={"name": "Acme"})

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize(
    "authorization",
    ["Bearer not-a-jwt", "Basic dXNlcjpwYXNz", "Bearer ", "bearer"],
)
def test_malformed_credentials_are_rejected(client: TestClient, authorization: str) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": authorization})
    assert response.status_code == 401


def test_valid_token_authenticates(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    user = create_user(db_session, email="valid@example.com")

    response = client.get("/api/v1/auth/me", headers=auth_headers(settings, user))

    assert response.status_code == 200
    assert response.json()["email"] == "valid@example.com"


@pytest.mark.parametrize(
    ("description", "overrides", "secret"),
    [
        ("expired", {"exp": datetime.now(UTC) - timedelta(seconds=1)}, TEST_JWT_SECRET),
        ("wrong audience", {"aud": "someone-else"}, TEST_JWT_SECRET),
        ("wrong issuer", {"iss": "someone-else"}, TEST_JWT_SECRET),
        ("non-uuid subject", {"sub": "admin"}, TEST_JWT_SECRET),
        ("forged signature", {}, "attacker-controlled-secret-0123456789abcdef"),
    ],
)
def test_invalid_tokens_are_rejected(
    client: TestClient,
    db_session: Session,
    settings: Settings,
    description: str,
    overrides: dict[str, object],
    secret: str,
) -> None:
    user = create_user(db_session)
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": str(user.id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        **overrides,
    }
    token = jwt.encode(claims, secret, algorithm="HS256")

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401, description


def test_unsigned_token_is_rejected(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    user = create_user(db_session)
    claims = {"sub": str(user.id), "iss": settings.jwt_issuer, "aud": settings.jwt_audience}
    unsigned = jwt.encode(claims, key=None, algorithm="none")  # type: ignore[arg-type]

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {unsigned}"})

    assert response.status_code == 401


def test_token_for_inactive_or_unknown_user_is_rejected(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    inactive = create_user(db_session, is_active=False)

    for user_id in (inactive.id, uuid.uuid4()):
        token = _token(settings, user_id)
        response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


def test_dev_token_flow_issues_usable_token_and_audits(
    client: TestClient, db_session: Session
) -> None:
    user = create_user(db_session, email="dev-user@example.com")

    response = client.post("/api/v1/auth/dev/token", json={"email": "Dev-User@Example.com"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)
    assert me.json()["last_login_at"] is not None
    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.actor_user_id == user.id, AuditLog.action == "auth.dev_token_issued"
        )
    )
    assert audit is not None


def test_dev_token_rejects_unknown_and_inactive_accounts(
    client: TestClient, db_session: Session
) -> None:
    create_user(db_session, email="disabled@example.com", is_active=False)

    for email in ("nobody@example.com", "disabled@example.com"):
        response = client.post("/api/v1/auth/dev/token", json={"email": email})
        assert response.status_code == 401
        assert response.json()["error"]["message"] == "Unknown or inactive development account."


def test_dev_token_endpoint_is_absent_when_disabled(db_session: Session) -> None:
    app = build_test_app(make_settings(dev_auth_enabled=False), db_session)
    create_user(db_session, email="someone@example.com")

    with TestClient(app) as client:
        response = client.post("/api/v1/auth/dev/token", json={"email": "someone@example.com"})

    assert response.status_code == 404


PRODUCTION_SECRET = "Zx9" * 20


def test_production_config_rejects_dev_auth() -> None:
    with pytest.raises(ValidationError, match="DEV_AUTH_ENABLED"):
        make_settings(
            environment="production", dev_auth_enabled=True, jwt_secret_key=PRODUCTION_SECRET
        )


@pytest.mark.parametrize(
    "secret",
    ["dev-only-change-me-0123456789abcdef0123456789abcdef", "short-but-valid-length-0123456789ab"],
)
def test_production_config_rejects_weak_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        make_settings(environment="production", dev_auth_enabled=False, jwt_secret_key=secret)


def test_production_config_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        make_settings(
            environment="production",
            dev_auth_enabled=False,
            jwt_secret_key=PRODUCTION_SECRET,
            cors_origins="*",
        )


def test_safe_production_config_disables_docs(db_session: Session) -> None:
    settings = make_settings(
        environment="production",
        dev_auth_enabled=False,
        jwt_secret_key=PRODUCTION_SECRET,
        cors_origins="https://app.deployforge.ai",
    )
    assert settings.cors_origins == ["https://app.deployforge.ai"]

    with TestClient(build_test_app(settings, db_session)) as client:
        assert client.get("/api/openapi.json").status_code == 404
        assert client.get("/api/docs").status_code == 404
        assert client.post("/api/v1/auth/dev/token", json={"email": "a@b.co"}).status_code == 404
