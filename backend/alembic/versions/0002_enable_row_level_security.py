"""Enable row-level security (deny by default) on every application table.

Hosted PostgreSQL providers such as Supabase expose the `public` schema through
an auto-generated REST API using roles (`anon`, `authenticated`) whose keys are
public. With RLS enabled and no policies, those roles can read or write no
rows. The API is unaffected: it connects as the table owner, and owners bypass
RLS unless it is forced. Phase 2 can add explicit tenant policies on top.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-25
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "users",
    "organizations",
    "organization_memberships",
    "workspaces",
    "workspace_memberships",
    "audit_logs",
    "alembic_version",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
