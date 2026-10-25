"""Database engine and session management."""

from collections.abc import Iterator
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings


def database_connect_args(settings: Settings) -> dict[str, Any]:
    """psycopg connection arguments shared by the application and Alembic."""
    args: dict[str, Any] = {
        "connect_timeout": settings.database_connect_timeout_seconds,
        "application_name": "deployforge-api",
    }
    if settings.database_ssl_mode is not None:
        args["sslmode"] = settings.database_ssl_mode
    if settings.database_ssl_root_cert:
        args["sslrootcert"] = settings.database_ssl_root_cert
    if settings.database_disable_prepared_statements:
        args["prepare_threshold"] = None
    return args


def create_database_engine(settings: Settings, *, null_pool: bool = False) -> Engine:
    """Create an engine. ``null_pool`` suits one-off processes such as migrations."""
    options: dict[str, Any] = {
        "pool_pre_ping": True,
        "echo": settings.database_echo,
        "connect_args": database_connect_args(settings),
    }
    if null_pool:
        options["poolclass"] = NullPool
    else:
        options.update(
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            pool_timeout=settings.database_pool_timeout_seconds,
            pool_recycle=settings.database_pool_recycle_seconds,
        )
    return create_engine(settings.database_url.get_secret_value(), **options)


@lru_cache
def get_engine() -> Engine:
    return create_database_engine(get_settings())


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session.

    Services commit explicitly; anything left uncommitted is rolled back on close.
    """
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def check_database(session: Session) -> None:
    """Raise if the database cannot execute a trivial query."""
    session.execute(text("SELECT 1"))
