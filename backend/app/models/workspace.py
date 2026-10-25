import uuid
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import str_enum_column_type
from app.models.organization import SLUG_PATTERN_SQL


class WorkspaceEnvironment(StrEnum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class WorkspaceStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class WorkspaceRole(StrEnum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An isolated project area inside an organization (e.g. one customer engagement)."""

    __tablename__ = "workspaces"
    __table_args__ = (
        # Slugs are unique per organization; this index also serves organization lookups.
        UniqueConstraint("organization_id", "slug"),
        # Target for composite foreign keys that pin child rows to the same tenant.
        UniqueConstraint("id", "organization_id"),
        CheckConstraint(f"slug ~ '{SLUG_PATTERN_SQL}'", name="slug_format"),
        CheckConstraint("length(btrim(name)) > 0", name="name_not_blank"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(63))
    description: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[WorkspaceEnvironment] = mapped_column(
        str_enum_column_type(WorkspaceEnvironment, "workspace_environment"),
        default=WorkspaceEnvironment.DEVELOPMENT,
        server_default=WorkspaceEnvironment.DEVELOPMENT.value,
    )
    status: Mapped[WorkspaceStatus] = mapped_column(
        str_enum_column_type(WorkspaceStatus, "workspace_status"),
        default=WorkspaceStatus.ACTIVE,
        server_default=WorkspaceStatus.ACTIVE.value,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    memberships: Mapped[list["WorkspaceMembership"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", passive_deletes=True
    )


class WorkspaceMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Grants a user a role in a workspace.

    ``organization_id`` is denormalized so that two composite foreign keys can
    guarantee at the database level that (a) the workspace belongs to that
    organization and (b) the user is a member of that organization. Removing a
    user from an organization therefore cascades to all of their workspace
    memberships in it.
    """

    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id"),
        ForeignKeyConstraint(
            ["workspace_id", "organization_id"],
            ["workspaces.id", "workspaces.organization_id"],
            ondelete="CASCADE",
            name="fk_workspace_memberships_workspace_tenant",
        ),
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["organization_memberships.organization_id", "organization_memberships.user_id"],
            ondelete="CASCADE",
            name="fk_workspace_memberships_org_membership",
        ),
        Index("ix_workspace_memberships_organization_id_user_id", "organization_id", "user_id"),
        Index("ix_workspace_memberships_user_id", "user_id"),
    )

    workspace_id: Mapped[uuid.UUID]
    organization_id: Mapped[uuid.UUID]
    user_id: Mapped[uuid.UUID]
    role: Mapped[WorkspaceRole] = mapped_column(
        str_enum_column_type(WorkspaceRole, "workspace_role")
    )

    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
