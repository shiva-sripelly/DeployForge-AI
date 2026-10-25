import uuid

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    Workspace,
    WorkspaceEnvironment,
    WorkspaceMembership,
    WorkspaceRole,
    WorkspaceStatus,
)
from tests.factories import (
    add_org_member,
    add_workspace_member,
    create_organization,
    create_user,
    create_workspace,
)


def _expect_integrity_error(db: Session, *objects: object) -> None:
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add_all(objects)
        db.flush()


def test_organization_and_workspace_defaults(db_session: Session) -> None:
    owner = create_user(db_session)
    org = create_organization(db_session, owner=owner)
    workspace = create_workspace(db_session, org)
    db_session.refresh(workspace)

    assert isinstance(org.id, uuid.UUID)
    assert isinstance(workspace.id, uuid.UUID)
    assert workspace.environment is WorkspaceEnvironment.DEVELOPMENT
    assert workspace.status is WorkspaceStatus.ACTIVE
    assert workspace.created_at is not None
    assert workspace.created_at.tzinfo is not None
    assert workspace.updated_at is not None
    membership = db_session.scalar(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == org.id)
    )
    assert membership is not None
    assert membership.role is OrganizationRole.OWNER


def test_user_email_must_be_unique_and_lowercase(db_session: Session) -> None:
    create_user(db_session, email="unique@example.com")

    _expect_integrity_error(db_session, User(email="unique@example.com", full_name="Dup"))
    _expect_integrity_error(db_session, User(email="Mixed@Example.com", full_name="Caps"))


def test_organization_slug_is_unique_and_well_formed(db_session: Session) -> None:
    create_organization(db_session, slug="acme-corp")

    _expect_integrity_error(db_session, Organization(name="Other", slug="acme-corp"))
    _expect_integrity_error(db_session, Organization(name="Bad", slug="Not A Slug"))
    _expect_integrity_error(db_session, Organization(name="  ", slug="blank-name"))


def test_workspace_slug_is_unique_per_organization_only(db_session: Session) -> None:
    org_a = create_organization(db_session)
    org_b = create_organization(db_session)
    create_workspace(db_session, org_a, slug="intake")

    create_workspace(db_session, org_b, slug="intake")  # same slug, different tenant: allowed
    _expect_integrity_error(
        db_session, Workspace(organization_id=org_a.id, name="Duplicate", slug="intake")
    )


def test_organization_membership_is_unique_per_user(db_session: Session) -> None:
    user = create_user(db_session)
    org = create_organization(db_session, owner=user)

    _expect_integrity_error(
        db_session,
        OrganizationMembership(
            organization_id=org.id, user_id=user.id, role=OrganizationRole.MEMBER
        ),
    )


def test_workspace_membership_requires_organization_membership(db_session: Session) -> None:
    org = create_organization(db_session)
    workspace = create_workspace(db_session, org)
    outsider = create_user(db_session)

    _expect_integrity_error(
        db_session,
        WorkspaceMembership(
            workspace_id=workspace.id,
            organization_id=org.id,
            user_id=outsider.id,
            role=WorkspaceRole.VIEWER,
        ),
    )


def test_workspace_membership_cannot_cross_tenants(db_session: Session) -> None:
    """A member of org A cannot be attached to a workspace in org B by mislabeling the org."""
    user = create_user(db_session)
    org_a = create_organization(db_session, owner=user)
    org_b = create_organization(db_session)
    workspace_in_b = create_workspace(db_session, org_b)

    _expect_integrity_error(
        db_session,
        WorkspaceMembership(
            workspace_id=workspace_in_b.id,
            organization_id=org_a.id,
            user_id=user.id,
            role=WorkspaceRole.ADMIN,
        ),
    )


def test_role_columns_reject_unknown_values_at_database_level(db_session: Session) -> None:
    user = create_user(db_session)
    org = create_organization(db_session)
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.execute(
            text(
                "INSERT INTO organization_memberships (organization_id, user_id, role) "
                "VALUES (:org, :user, 'superuser')"
            ),
            {"org": org.id, "user": user.id},
        )


def test_removing_org_member_cascades_to_workspace_memberships(db_session: Session) -> None:
    owner, member = create_user(db_session), create_user(db_session)
    org = create_organization(db_session, owner=owner)
    org_membership = add_org_member(db_session, org, member, OrganizationRole.MEMBER)
    workspace = create_workspace(db_session, org)
    add_workspace_member(db_session, workspace, member, WorkspaceRole.EDITOR)

    db_session.delete(org_membership)
    db_session.flush()

    remaining = db_session.scalar(
        select(func.count())
        .select_from(WorkspaceMembership)
        .where(WorkspaceMembership.user_id == member.id)
    )
    assert remaining == 0


def test_deleting_organization_cascades_but_preserves_audit_history(db_session: Session) -> None:
    owner = create_user(db_session)
    org = create_organization(db_session, owner=owner)
    workspace = create_workspace(db_session, org)
    add_workspace_member(db_session, workspace, owner, WorkspaceRole.ADMIN)
    audit = AuditLog(
        action="organization.created",
        resource_type="organization",
        resource_id=org.id,
        organization_id=org.id,
        workspace_id=workspace.id,
        actor_user_id=owner.id,
    )
    db_session.add(audit)
    db_session.flush()
    org_id, workspace_id = org.id, workspace.id

    db_session.delete(org)
    db_session.flush()
    db_session.expire_all()

    assert db_session.get(Workspace, workspace_id) is None
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(OrganizationMembership)
            .where(OrganizationMembership.organization_id == org_id)
        )
        == 0
    )
    preserved = db_session.get(AuditLog, audit.id)
    assert preserved is not None
    assert preserved.organization_id is None
    assert preserved.workspace_id is None
    assert preserved.resource_id == org_id
