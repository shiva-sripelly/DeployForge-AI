"""Test fixtures.

Tests run against a real PostgreSQL database (``TEST_DATABASE_URL``). The schema
is built once per session by running the Alembic migrations, and every test runs
inside a transaction that is rolled back afterwards.
"""

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import Settings
from app.db.session import get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://deployforge:deployforge_dev_password@127.0.0.1:5433/deployforge_test",
)
TEST_JWT_SECRET = "test-only-jwt-secret-key-0123456789abcdefghijklmnop"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "test",
        "database_url": TEST_DATABASE_URL,
        "jwt_secret_key": TEST_JWT_SECRET,
        "dev_auth_enabled": True,
        "log_format": "console",
        "log_level": "WARNING",
        "cors_origins": ["http://localhost:5173"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


PRODUCTION_JWT_SECRET = "prod-test-" + "Zx9Qw7Lm4" * 6
PRODUCTION_ORIGIN = "https://deployforge-ai.vercel.app"


def make_production_settings(**overrides: Any) -> Settings:
    """Settings that satisfy every production safety check."""
    values: dict[str, Any] = {
        "environment": "production",
        "dev_auth_enabled": False,
        "jwt_secret_key": PRODUCTION_JWT_SECRET,
        "cors_origins": PRODUCTION_ORIGIN,
        "database_ssl_mode": "require",
        "log_format": "json",
    }
    values.update(overrides)
    return make_settings(**values)


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


def run_alembic(engine: Engine, action: str, revision: str) -> None:
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        getattr(command, action)(config, revision)


def _ensure_database_exists(url: str) -> None:
    target = make_url(url)
    admin_engine = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        exists = connection.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        )
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def settings() -> Settings:
    return make_settings()


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    _ensure_database_exists(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    run_alembic(engine, "upgrade", "head")
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
        autoflush=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def build_test_app(settings: Settings, db_session: Session) -> FastAPI:
    app = create_app(settings)
    app.dependency_overrides[get_db] = lambda: db_session
    return app


@pytest.fixture
def app(settings: Settings, db_session: Session) -> FastAPI:
    return build_test_app(settings, db_session)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
