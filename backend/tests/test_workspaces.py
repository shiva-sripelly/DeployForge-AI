import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import (
    AuditLog,
    OrganizationRole,
    WorkspaceMembership,
    WorkspaceRole,
    WorkspaceStatus,
)
from tests.factories import (
    add_org_member,
    add_workspace_member,
    auth_headers,
    create_organization,
    create_user,
    create_workspace,
)


@pytest.mark.parametrize("role", [OrganizationRole.OWNER, OrganizationRole.ADMIN])
def test_managers_can_create_workspaces(
    client: TestClient, db_session: Session, settings: Settings, role: OrganizationRole
) -> None:
    user = create_user(db_session)
    org = create_organization(db_session, owner=create_user(db_session))
    add_org_member(db_session, org, user, role)

    response = client.post(
        f"/api/v1/organizations/{org.id}/workspaces",
        json={"name": "Claims Triage", "environment": "staging", "description": " Pilot "},
        headers=auth_headers(settings, user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["slug"] == "claims-triage"
    assert body["environment"] == "staging"
    assert body["status"] == "active"
    assert body["description"] == "Pilot"
    assert body["organization_id"] == str(org.id)
    assert body["access"] == {"organization_role": role.value, "workspace_role": "admin"}
    workspace_id = uuid.UUID(body["id"])
    membership = db_session.scalar(
        select(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace_id)
    )
    assert membership is not None
    assert membership.user_id == user.id
    audit = db_session.scalar(select(AuditLog).where(AuditLog.workspace_id == workspace_id))
    assert audit is not None
    assert audit.action == "workspace.created"
    assert audit.organization_id == org.id


@pytest.mark.parametrize("role", [OrganizationRole.MEMBER, OrganizationRole.VIEWER])
def test_non_managers_cannot_create_workspaces(
    client: TestClient, db_session: Session, settings: Settings, role: OrganizationRole
) -> None:
    user = create_user(db_session)
    org = create_organization(db_session, owner=create_user(db_session))
    add_org_member(db_session, org, user, role)

    response = client.post(
        f"/api/v1/organizations/{org.id}/workspaces",
        json={"name": "Shadow Project"},
        headers=auth_headers(settings, user),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


def test_outsiders_cannot_create_workspaces_in_other_tenants(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    attacker = create_user(db_session)
    create_organization(db_session, owner=attacker)
    victim_org = create_organization(db_session, owner=create_user(db_session))

    response = client.post(
        f"/api/v1/organizations/{victim_org.id}/workspaces",
        json={"name": "Injected"},
        headers=auth_headers(settings, attacker),
    )

    assert response.status_code == 404


def test_workspace_slug_conflict_returns_409(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner = create_user(db_session)
    org = create_organization(db_session, owner=owner)
    create_workspace(db_session, org, slug="intake")

    response = client.post(
        f"/api/v1/organizations/{org.id}/workspaces",
        json={"name": "Intake", "slug": "intake"},
        headers=auth_headers(settings, owner),
    )

    assert response.status_code == 409


def test_workspace_listing_respects_visibility(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner, member = create_user(db_session), create_user(db_session)
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, member, OrganizationRole.MEMBER)
    visible = create_workspace(db_session, org)
    create_workspace(db_session, org)
    archived = create_workspace(db_session, org)
    archived.status = WorkspaceStatus.ARCHIVED
    add_workspace_member(db_session, visible, member, WorkspaceRole.VIEWER)
    db_session.flush()
    path = f"/api/v1/organizations/{org.id}/workspaces"

    owner_view = client.get(path, headers=auth_headers(settings, owner)).json()
    member_view = client.get(path, headers=auth_headers(settings, member)).json()
    active_only = client.get(f"{path}?status=active", headers=auth_headers(settings, owner)).json()

    assert owner_view["total"] == 3
    assert [item["id"] for item in member_view["items"]] == [str(visible.id)]
    assert member_view["total"] == 1
    assert active_only["total"] == 2


def test_get_workspace_access_rules(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner, editor, bystander, outsider = (create_user(db_session) for _ in range(4))
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, editor, OrganizationRole.MEMBER)
    add_org_member(db_session, org, bystander, OrganizationRole.MEMBER)
    create_organization(db_session, owner=outsider)
    workspace = create_workspace(db_session, org)
    add_workspace_member(db_session, workspace, editor, WorkspaceRole.EDITOR)
    path = f"/api/v1/workspaces/{workspace.id}"

    owner_response = client.get(path, headers=auth_headers(settings, owner))
    editor_response = client.get(path, headers=auth_headers(settings, editor))

    assert owner_response.status_code == 200
    assert owner_response.json()["access"] == {
        "organization_role": "owner",
        "workspace_role": None,
    }
    assert editor_response.status_code == 200
    assert editor_response.json()["access"]["workspace_role"] == "editor"
    for denied_user in (bystander, outsider):
        for suffix in ("", "/stats"):
            response = client.get(f"{path}{suffix}", headers=auth_headers(settings, denied_user))
            assert response.status_code == 404
    unknown = client.get(
        f"/api/v1/workspaces/{uuid.uuid4()}", headers=auth_headers(settings, owner)
    )
    assert unknown.status_code == 404


def test_workspace_stats(client: TestClient, db_session: Session, settings: Settings) -> None:
    owner, viewer = create_user(db_session), create_user(db_session)
    org = create_organization(db_session, owner=owner)
    add_org_member(db_session, org, viewer, OrganizationRole.VIEWER)
    workspace = create_workspace(db_session, org)
    add_workspace_member(db_session, workspace, owner, WorkspaceRole.ADMIN)
    add_workspace_member(db_session, workspace, viewer, WorkspaceRole.VIEWER)
    db_session.add_all(
        [
            AuditLog(
                action="workspace.created",
                resource_type="workspace",
                organization_id=org.id,
                workspace_id=workspace.id,
            ),
            AuditLog(
                action="workspace.updated",
                resource_type="workspace",
                organization_id=org.id,
                workspace_id=workspace.id,
            ),
        ]
    )
    db_session.flush()

    response = client.get(
        f"/api/v1/workspaces/{workspace.id}/stats", headers=auth_headers(settings, viewer)
    )

    assert response.status_code == 200
    stats = response.json()
    assert stats["workspace_id"] == str(workspace.id)
    assert stats["members_total"] == 2
    assert stats["members_by_role"] == {"admin": 1, "editor": 0, "viewer": 1}
    assert stats["audit_events_total"] == 2
    assert stats["audit_events_last_7_days"] == 2
    assert stats["last_activity_at"] is not None
