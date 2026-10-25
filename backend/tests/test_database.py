from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import check_database
from tests.conftest import alembic_config, run_alembic

EXPECTED_TABLES = {
    "users",
    "organizations",
    "organization_memberships",
    "workspaces",
    "workspace_memberships",
    "audit_logs",
}


def test_database_connectivity(db_session: Session) -> None:
    check_database(db_session)
    assert db_session.scalar(text("SELECT 1")) == 1


def test_database_is_at_latest_migration(engine: Engine) -> None:
    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    assert current == head


def test_migrations_create_expected_tables(engine: Engine) -> None:
    assert EXPECTED_TABLES <= set(inspect(engine).get_table_names())


def test_models_match_migrations(engine: Engine) -> None:
    """Fails if a model changed without a corresponding Alembic migration."""
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        diff = compare_metadata(context, Base.metadata)
    assert diff == []


def test_migrations_downgrade_and_upgrade_cleanly(engine: Engine) -> None:
    run_alembic(engine, "downgrade", "base")
    assert not EXPECTED_TABLES & set(inspect(engine).get_table_names())

    run_alembic(engine, "upgrade", "head")
    assert EXPECTED_TABLES <= set(inspect(engine).get_table_names())
