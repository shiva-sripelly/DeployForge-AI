"""Deployment readiness: production configuration safety, hosted PostgreSQL
(e.g. Supabase) connection options, and the production authentication boundary."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import make_url, text
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import ConfigurationError, get_settings, load_settings
from app.db.session import create_database_engine, database_connect_args
from tests.conftest import (
    PRODUCTION_ORIGIN,
    TEST_DATABASE_URL,
    alembic_config,
    build_test_app,
    make_production_settings,
    make_settings,
)
from tests.factories import auth_headers, create_user
from tests.test_auth import PROTECTED_ENDPOINTS

SUPABASE_SESSION_POOLER_URL = (
    "postgresql://postgres.abcdefghijklmnop:not-a-real-password"
    "@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
)


# --- Database URL handling ---------------------------------------------------


@pytest.mark.parametrize("scheme", ["postgresql", "postgres"])
def test_generic_postgres_urls_use_installed_psycopg_driver(scheme: str) -> None:
    settings = make_settings(database_url=f"{scheme}://user:pw@db.internal:5432/app")
    assert settings.database_url.get_secret_value() == (
        "postgresql+psycopg://user:pw@db.internal:5432/app"
    )


def test_explicit_driver_is_left_unchanged() -> None:
    url = "postgresql+psycopg://user:pw@db.internal:5432/app"
    assert make_settings(database_url=url).database_url.get_secret_value() == url


def test_supabase_session_pooler_url_is_accepted_in_production() -> None:
    settings = make_production_settings(database_url=SUPABASE_SESSION_POOLER_URL)

    url = make_url(settings.database_url.get_secret_value())
    assert url.drivername == "postgresql+psycopg"
    assert url.username == "postgres.abcdefghijklmnop"
    assert url.host == "aws-0-us-east-1.pooler.supabase.com"
    assert url.port == 5432


def test_sslmode_in_database_url_satisfies_production_tls_requirement() -> None:
    settings = make_production_settings(
        database_ssl_mode=None, database_url=f"{SUPABASE_SESSION_POOLER_URL}?sslmode=verify-full"
    )
    assert settings.effective_database_ssl_mode == "verify-full"


@pytest.mark.parametrize("mode", [None, "disable", "allow", "prefer"])
def test_production_requires_encrypted_database_connections(mode: str | None) -> None:
    with pytest.raises(ValidationError, match="Database TLS is required"):
        make_production_settings(database_ssl_mode=mode)


def test_ssl_setting_overrides_url_parameter() -> None:
    settings = make_settings(
        database_url=f"{TEST_DATABASE_URL}?sslmode=disable", database_ssl_mode="require"
    )
    assert settings.effective_database_ssl_mode == "require"


# --- Connection arguments ------------------------------------------------------


def test_default_connect_args() -> None:
    assert database_connect_args(make_settings()) == {
        "connect_timeout": 10,
        "application_name": "deployforge-api",
    }


def test_connect_args_for_tls_and_transaction_pooler() -> None:
    settings = make_settings(
        database_ssl_mode="verify-full",
        database_ssl_root_cert="/etc/secrets/supabase-ca.crt",
        database_disable_prepared_statements=True,
        database_connect_timeout_seconds=5,
    )

    assert database_connect_args(settings) == {
        "connect_timeout": 5,
        "application_name": "deployforge-api",
        "sslmode": "verify-full",
        "sslrootcert": "/etc/secrets/supabase-ca.crt",
        "prepare_threshold": None,
    }


def test_engine_applies_connect_args_against_real_database() -> None:
    """Pool and pooler-compatibility settings work end to end on PostgreSQL."""
    settings = make_settings(
        database_disable_prepared_statements=True, database_pool_recycle_seconds=60
    )
    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            name = connection.scalar(text("SELECT current_setting('application_name')"))
            # More executions than psycopg's default prepare threshold (5).
            for _ in range(8):
                assert connection.scalar(text("SELECT 1")) == 1
        assert name == "deployforge-api"
        assert engine.pool._recycle == 60  # type: ignore[attr-defined]
    finally:
        engine.dispose()


def test_alembic_cli_path_uses_application_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """`alembic upgrade head` in the container builds its own engine from settings."""
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("JWT_SECRET_KEY", "x" * 64)
    monkeypatch.setenv("ENVIRONMENT", "test")
    get_settings.cache_clear()
    try:
        command.upgrade(alembic_config(), "head")  # no injected connection: CLI code path
    finally:
        get_settings.cache_clear()


def test_null_pool_engine_for_one_off_processes() -> None:
    engine = create_database_engine(make_settings(), null_pool=True)
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT 1")) == 1
    finally:
        engine.dispose()


# --- Fail-safe configuration loading -------------------------------------------


@pytest.fixture
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("JWT_SECRET_KEY", "DATABASE_URL", "ENVIRONMENT", "DEV_AUTH_ENABLED"):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.usefixtures("clean_environment")
@pytest.mark.parametrize("missing", ["jwt_secret_key", "database_url"])
def test_missing_required_security_settings_prevent_startup(missing: str) -> None:
    values = {"jwt_secret_key": "x" * 64, "database_url": TEST_DATABASE_URL}
    del values[missing]

    with pytest.raises(ConfigurationError, match=f"{missing.upper()}: Field required"):
        load_settings(_env_file=None, environment="production", **values)


@pytest.mark.usefixtures("clean_environment")
def test_configuration_errors_never_echo_secret_values() -> None:
    with pytest.raises(ConfigurationError) as caught:
        load_settings(
            _env_file=None,
            database_url="postgresql://user:SuperSecretDbPass@db.internal/app",
            jwt_secret_key="LeakyShortSecret",
        )

    message = str(caught.value)
    assert "JWT_SECRET_KEY" in message
    assert "LeakyShortSecret" not in message
    assert "SuperSecretDbPass" not in message
    # The original pydantic error (which contains the inputs) is not chained.
    assert caught.value.__cause__ is None
    assert caught.value.__suppress_context__ is True


@pytest.mark.parametrize(
    "origins",
    [
        "*",
        "http://deployforge-ai.vercel.app",
        "https://localhost:5173",
        "http://127.0.0.1:8080",
        f"{PRODUCTION_ORIGIN},http://localhost:5173",
        "",
    ],
)
def test_production_requires_explicit_https_cors_origins(origins: str) -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        make_production_settings(cors_origins=origins)


def test_cors_origins_are_normalized() -> None:
    settings = make_production_settings(
        cors_origins=f"{PRODUCTION_ORIGIN}/, https://demo.deployforge.ai"
    )
    assert settings.cors_origins == [PRODUCTION_ORIGIN, "https://demo.deployforge.ai"]


# --- Production authentication boundary ----------------------------------------


@pytest.fixture
def production_client(db_session: Session) -> Iterator[TestClient]:
    with TestClient(build_test_app(make_production_settings(), db_session)) as client:
        yield client


def test_production_has_no_development_token_endpoint(
    production_client: TestClient, db_session: Session
) -> None:
    create_user(db_session, email="admin@deployforge.dev")

    response = production_client.post(
        "/api/v1/auth/dev/token", json={"email": "admin@deployforge.dev"}
    )

    assert response.status_code == 404


@pytest.mark.parametrize(("method", "path"), PROTECTED_ENDPOINTS)
def test_production_rejects_unauthenticated_requests(
    production_client: TestClient, method: str, path: str
) -> None:
    response = production_client.request(method, path, json={"name": "Public Visitor Org"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_production_rejects_tokens_signed_with_development_secret(
    production_client: TestClient, db_session: Session
) -> None:
    user = create_user(db_session)
    dev_token_headers = auth_headers(make_settings(), user)  # signed with the test/dev secret

    response = production_client.get("/api/v1/organizations", headers=dev_token_headers)

    assert response.status_code == 401


def test_production_accepts_properly_signed_tokens(
    production_client: TestClient, db_session: Session
) -> None:
    user = create_user(db_session)

    response = production_client.get(
        "/api/v1/auth/me", headers=auth_headers(make_production_settings(), user)
    )

    assert response.status_code == 200


def test_production_health_endpoints_are_public_and_reveal_no_internals(
    production_client: TestClient,
) -> None:
    live = production_client.get("/api/v1/health/live")
    ready = production_client.get("/api/v1/health/ready")

    assert live.status_code == 200
    assert live.json()["environment"] == "production"
    assert ready.status_code == 200
    host = make_url(TEST_DATABASE_URL).host or ""
    for body in (live.text, ready.text):
        assert host not in body
        assert "password" not in body.lower()


def test_production_cors_allows_only_the_configured_frontend(
    production_client: TestClient,
) -> None:
    def preflight(origin: str) -> dict[str, str]:
        return dict(
            production_client.options(
                "/api/v1/health/ready",
                headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
            ).headers
        )

    assert preflight(PRODUCTION_ORIGIN)["access-control-allow-origin"] == PRODUCTION_ORIGIN
    assert "access-control-allow-origin" not in preflight(
        "https://deployforge-ai-git-feature-x.vercel.app"
    )
    assert "access-control-allow-origin" not in preflight("http://localhost:5173")
