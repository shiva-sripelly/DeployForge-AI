import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import (
    AuditLog,
    OrganizationMembership,
    OrganizationRole,
    WorkspaceEnvironment,
    WorkspaceRole,
)
from tests.factories import (
    add_org_member,
    add_workspace_member,
    auth_headers,
    create_organization,
    create_user,
    create_workspace,
)


def test_create_organization_makes_caller_owner_and_audits(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/v1/organizations",
        json={"name": "  Acme Robotics, Inc.  "},
        headers={**auth_headers(settings, user), "X-Request-ID": "req-create-org"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Acme Robotics, Inc."
    assert body["slug"] == "acme-robotics-inc"
    assert body["role"] == "owner"
    org_id = uuid.UUID(body["id"])
    membership = db_session.scalar(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == org_id)
    )
    assert membership is not None
    assert membership.user_id == user.id
    assert membership.role is OrganizationRole.OWNER
    audit = db_session.scalar(select(AuditLog).where(AuditLog.resource_id == org_id))
    assert audit is not None
    assert audit.action == "organization.created"
    assert audit.actor_user_id == user.id
    assert audit.request_id == "req-create-org"


def test_explicit_slug_conflict_returns_409(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    create_organization(db_session, slug="taken-slug")
    user = create_user(db_session)

    response = client.post(
        "/api/v1/organizations",
        json={"name": "Another", "slug": "taken-slug"},
        headers=auth_headers(settings, user),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_generated_slug_avoids_collisions(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    create_organization(db_session, slug="globex")
    user = create_user(db_session)

    response = client.post(
        "/api/v1/organizations", json={"name": "Globex"}, headers=auth_headers(settings, user)
    )

    assert response.status_code == 201
    slug = response.json()["slug"]
    assert slug.startswith("globex-")
    assert slug != "globex"


def test_list_returns_only_my_organizations_with_roles(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    user, stranger = create_user(db_session), create_user(db_session)
    owned = create_organization(db_session, owner=user)
    viewing = create_organization(db_session, owner=stranger)
    add_org_member(db_session, viewing, user, OrganizationRole.VIEWER)
    create_organization(db_session, owner=stranger)  # not visible

    response = client.get("/api/v1/organizations", headers=auth_headers(settings, user))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    roles = {item["id"]: item["role"] for item in body["items"]}
    assert roles == {str(owned.id): "owner", str(viewing.id): "viewer"}


def test_list_pagination(client: TestClient, db_session: Session, settings: Settings) -> None:
    user = create_user(db_session)
    for _ in range(3):
        create_organization(db_session, owner=user)

    response = client.get(
        "/api/v1/organizations?limit=2&offset=2", headers=auth_headers(settings, user)
    )

    body = response.json()
    assert (body["total"], body["limit"], body["offset"], len(body["items"])) == (3, 2, 2, 1)


def test_get_organization_for_member(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner, member = create_user(db_session), create_user(db_session)
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, member, OrganizationRole.MEMBER)

    response = client.get(f"/api/v1/organizations/{org.id}", headers=auth_headers(settings, member))

    assert response.status_code == 200
    assert response.json()["role"] == "member"


def test_non_member_cannot_see_organization(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    org = create_organization(db_session, owner=create_user(db_session))
    outsider_headers = auth_headers(settings, create_user(db_session))

    for path in ("", "/stats", "/audit-logs", "/workspaces"):
        response = client.get(f"/api/v1/organizations/{org.id}{path}", headers=outsider_headers)
        assert response.status_code == 404, path
    # Indistinguishable from an organization that does not exist.
    missing = client.get(f"/api/v1/organizations/{uuid.uuid4()}", headers=outsider_headers)
    assert missing.json()["error"]["message"] == "Organization not found."


def test_organization_stats(client: TestClient, db_session: Session, settings: Settings) -> None:
    owner, member = create_user(db_session), create_user(db_session)
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, member, OrganizationRole.MEMBER)
    create_workspace(db_session, org, environment=WorkspaceEnvironment.PRODUCTION)
    create_workspace(db_session, org, environment=WorkspaceEnvironment.STAGING)
    create_workspace(db_session, org)
    db_session.add(AuditLog(action="test.event", resource_type="test", organization_id=org.id))
    db_session.flush()

    response = client.get(
        f"/api/v1/organizations/{org.id}/stats", headers=auth_headers(settings, member)
    )

    assert response.status_code == 200
    stats = response.json()
    assert stats["workspaces_total"] == 3
    assert stats["workspaces_active"] == 3
    assert stats["workspaces_by_environment"] == {
        "development": 1,
        "staging": 1,
        "production": 1,
    }
    assert stats["members_total"] == 2
    assert stats["members_by_role"] == {"owner": 1, "admin": 0, "member": 1, "viewer": 0}
    assert stats["audit_events_last_7_days"] == 1
    assert stats["last_activity_at"] is not None


def test_audit_log_is_restricted_to_managers(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner, admin, member = (create_user(db_session) for _ in range(3))
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, admin, OrganizationRole.ADMIN)
    add_org_member(db_session, org, member, OrganizationRole.MEMBER)
    workspace = create_workspace(db_session, org)
    add_workspace_member(db_session, workspace, member, WorkspaceRole.ADMIN)
    db_session.add(
        AuditLog(
            action="organization.created",
            resource_type="organization",
            organization_id=org.id,
            actor_user_id=owner.id,
        )
    )
    db_session.flush()
    path = f"/api/v1/organizations/{org.id}/audit-logs"

    for manager in (owner, admin):
        response = client.get(path, headers=auth_headers(settings, manager))
        assert response.status_code == 200
        assert response.json()["items"][0]["actor_email"] == owner.email

    denied = client.get(path, headers=auth_headers(settings, member))
    assert denied.status_code == 403
    assert denied.json()["error"]["details"] == {"required_roles": ["admin", "owner"]}
