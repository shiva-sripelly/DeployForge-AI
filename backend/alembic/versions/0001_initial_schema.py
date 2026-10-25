"""Initial schema: users, organizations, workspaces, memberships and audit logs.

Revision ID: 0001
Revises:
Create Date: 2026-10-24 17:59:09.754151
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('full_name', sa.String(length=200), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('email = lower(email)', name=op.f('ck_users_email_lowercase')),
    sa.CheckConstraint('length(btrim(full_name)) > 0', name=op.f('ck_users_full_name_not_blank')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('organizations',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f('ck_organizations_slug_format')),
    sa.CheckConstraint('length(btrim(name)) > 0', name=op.f('ck_organizations_name_not_blank')),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_organizations_created_by_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organizations')),
    sa.UniqueConstraint('slug', name=op.f('uq_organizations_slug'))
    )
    op.create_index(op.f('ix_organizations_created_by_id'), 'organizations', ['created_by_id'], unique=False)
    op.create_table('organization_memberships',
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.Enum('owner', 'admin', 'member', 'viewer', name='organization_role', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_organization_memberships_organization_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_organization_memberships_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organization_memberships')),
    sa.UniqueConstraint('organization_id', 'user_id', name=op.f('uq_organization_memberships_organization_id_user_id'))
    )
    op.create_index(op.f('ix_organization_memberships_user_id'), 'organization_memberships', ['user_id'], unique=False)
    op.create_table('workspaces',
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('environment', sa.Enum('development', 'staging', 'production', name='workspace_environment', native_enum=False, create_constraint=True, length=32), server_default='development', nullable=False),
    sa.Column('status', sa.Enum('active', 'archived', name='workspace_status', native_enum=False, create_constraint=True, length=32), server_default='active', nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f('ck_workspaces_slug_format')),
    sa.CheckConstraint('length(btrim(name)) > 0', name=op.f('ck_workspaces_name_not_blank')),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_workspaces_created_by_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_workspaces_organization_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workspaces')),
    sa.UniqueConstraint('id', 'organization_id', name=op.f('uq_workspaces_id_organization_id')),
    sa.UniqueConstraint('organization_id', 'slug', name=op.f('uq_workspaces_organization_id_slug'))
    )
    op.create_index(op.f('ix_workspaces_created_by_id'), 'workspaces', ['created_by_id'], unique=False)
    op.create_table('audit_logs',
    sa.Column('organization_id', sa.Uuid(), nullable=True),
    sa.Column('workspace_id', sa.Uuid(), nullable=True),
    sa.Column('actor_user_id', sa.Uuid(), nullable=True),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('resource_type', sa.String(length=50), nullable=False),
    sa.Column('resource_id', sa.Uuid(), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('request_id', sa.String(length=128), nullable=True),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], name=op.f('fk_audit_logs_actor_user_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_audit_logs_organization_id_organizations'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], name=op.f('fk_audit_logs_workspace_id_workspaces'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_logs_actor_user_id_created_at', 'audit_logs', ['actor_user_id', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_organization_id_created_at', 'audit_logs', ['organization_id', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_workspace_id_created_at', 'audit_logs', ['workspace_id', 'created_at'], unique=False)
    op.create_table('workspace_memberships',
    sa.Column('workspace_id', sa.Uuid(), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.Enum('admin', 'editor', 'viewer', name='workspace_role', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'user_id'], ['organization_memberships.organization_id', 'organization_memberships.user_id'], name='fk_workspace_memberships_org_membership', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id', 'organization_id'], ['workspaces.id', 'workspaces.organization_id'], name='fk_workspace_memberships_workspace_tenant', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workspace_memberships')),
    sa.UniqueConstraint('workspace_id', 'user_id', name=op.f('uq_workspace_memberships_workspace_id_user_id'))
    )
    op.create_index('ix_workspace_memberships_organization_id_user_id', 'workspace_memberships', ['organization_id', 'user_id'], unique=False)
    op.create_index('ix_workspace_memberships_user_id', 'workspace_memberships', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_workspace_memberships_user_id', table_name='workspace_memberships')
    op.drop_index('ix_workspace_memberships_organization_id_user_id', table_name='workspace_memberships')
    op.drop_table('workspace_memberships')
    op.drop_index('ix_audit_logs_workspace_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_organization_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_actor_user_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_workspaces_created_by_id'), table_name='workspaces')
    op.drop_table('workspaces')
    op.drop_index(op.f('ix_organization_memberships_user_id'), table_name='organization_memberships')
    op.drop_table('organization_memberships')
    op.drop_index(op.f('ix_organizations_created_by_id'), table_name='organizations')
    op.drop_table('organizations')
    op.drop_table('users')
