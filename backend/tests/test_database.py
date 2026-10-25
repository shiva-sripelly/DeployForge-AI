from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import check_database
from tests.conftest import alembic_config, run_alembic
from tests.factories import create_organization, create_user

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


def test_every_table_has_row_level_security_enabled_but_not_forced(engine: Engine) -> None:
    """Deny-by-default for non-owner roles; the API (table owner) keeps access."""
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind = 'r'"
            )
        ).all()

    assert {row.relname for row in rows} >= EXPECTED_TABLES
    assert [row.relname for row in rows if not row.relrowsecurity] == []
    assert [row.relname for row in rows if row.relforcerowsecurity] == []


def test_non_owner_roles_cannot_read_rows(db_session: Session) -> None:
    """Simulates a public role (e.g. Supabase `anon` via its REST API) querying tables."""
    org = create_organization(db_session, owner=create_user(db_session))
    db_session.execute(text("CREATE ROLE rls_probe NOLOGIN"))
    # Mirrors Supabase, which grants `anon` schema usage and table privileges.
    db_session.execute(text("GRANT USAGE ON SCHEMA public TO rls_probe"))
    db_session.execute(text("GRANT SELECT ON organizations, users, audit_logs TO rls_probe"))

    db_session.execute(text("SET LOCAL ROLE rls_probe"))
    visible = [
        db_session.scalar(text(f"SELECT count(*) FROM {table}"))  # noqa: S608
        for table in ("organizations", "users", "audit_logs")
    ]
    db_session.execute(text("RESET ROLE"))

    assert visible == [0, 0, 0]
    owner_view = db_session.scalar(
        text("SELECT count(*) FROM organizations WHERE id = :id"), {"id": org.id}
    )
    assert owner_view == 1
