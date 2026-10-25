from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from tests.factories import auth_headers, create_organization, create_user


@pytest.fixture
def headers(db_session: Session, settings: Settings) -> dict[str, str]:
    return auth_headers(settings, create_user(db_session))


def _assert_validation_error(response: Any, field: str | None = None) -> None:
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert isinstance(error["details"], list)
    assert error["details"]
    if field is not None:
        assert any(field in detail["loc"] for detail in error["details"]), error["details"]


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({}, "name"),
        ({"name": ""}, "name"),
        ({"name": "   "}, "name"),
        ({"name": "A"}, "name"),
        ({"name": "x" * 201}, "name"),
        ({"name": 123}, "name"),
        ({"name": "Acme", "slug": "Not Valid!"}, "slug"),
        ({"name": "Acme", "slug": "ab"}, "slug"),
        ({"name": "Acme", "slug": "-leading-dash"}, "slug"),
        ({"name": "Acme", "slug": "double--dash"}, "slug"),
        ({"name": "Acme", "owner_id": "injected"}, "owner_id"),
    ],
)
def test_create_organization_validation(
    client: TestClient, headers: dict[str, str], payload: dict[str, Any], field: str
) -> None:
    _assert_validation_error(
        client.post("/api/v1/organizations", json=payload, headers=headers), field
    )


def test_malformed_json_body_is_rejected(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/organizations",
        content="{not json",
        headers={**headers, "Content-Type": "application/json"},
    )
    _assert_validation_error(response)


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"name": "Intake", "environment": "qa"}, "environment"),
        ({"name": "Intake", "description": "x" * 2001}, "description"),
        ({"name": "Intake", "status": "archived"}, "status"),
        ({"slug": "intake"}, "name"),
    ],
)
def test_create_workspace_validation(
    client: TestClient,
    db_session: Session,
    settings: Settings,
    payload: dict[str, Any],
    field: str,
) -> None:
    owner = create_user(db_session)
    org = create_organization(db_session, owner=owner)

    response = client.post(
        f"/api/v1/organizations/{org.id}/workspaces",
        json=payload,
        headers=auth_headers(settings, owner),
    )

    _assert_validation_error(response, field)


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/organizations/not-a-uuid",
        "/api/v1/organizations/123/stats",
        "/api/v1/workspaces/not-a-uuid",
    ],
)
def test_invalid_path_ids_are_rejected(
    client: TestClient, headers: dict[str, str], path: str
) -> None:
    _assert_validation_error(client.get(path, headers=headers))


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=abc"])
def test_pagination_bounds_are_enforced(
    client: TestClient, headers: dict[str, str], query: str
) -> None:
    _assert_validation_error(client.get(f"/api/v1/organizations?{query}", headers=headers))


def test_invalid_status_filter_is_rejected(
    client: TestClient, db_session: Session, settings: Settings
) -> None:
    owner = create_user(db_session)
    org = create_organization(db_session, owner=owner)

    response = client.get(
        f"/api/v1/organizations/{org.id}/workspaces?status=deleted",
        headers=auth_headers(settings, owner),
    )

    _assert_validation_error(response, "status")


@pytest.mark.parametrize("email", ["", "not-an-email", "a@", None])
def test_dev_token_requires_valid_email(client: TestClient, email: str | None) -> None:
    _assert_validation_error(client.post("/api/v1/auth/dev/token", json={"email": email}), "email")
