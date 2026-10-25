"""Seed development accounts and a sample tenant.

Usage: ``python -m app.scripts.seed_dev``

Idempotent: existing rows are left untouched. Refuses to run in production.
The accounts have no passwords; they can only obtain tokens through the
development token endpoint, which is disabled outside development.
"""

import logging
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import get_session_factory
from app.models import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    Workspace,
    WorkspaceEnvironment,
    WorkspaceMembership,
    WorkspaceRole,
)
from app.services.audit import record_audit_event
from app.services.context import RequestContext

logger = logging.getLogger("app.seed")

DEV_USERS = {
    "admin@deployforge.dev": "Avery Admin",
    "engineer@deployforge.dev": "Riley Engineer",
    "outsider@deployforge.dev": "Casey Outsider",
}
SAMPLE_ORG = ("Northwind Health", "northwind-health")
SAMPLE_WORKSPACES = [
    ("Patient Intake Assistant", "patient-intake", WorkspaceEnvironment.DEVELOPMENT),
    ("Claims Triage", "claims-triage", WorkspaceEnvironment.STAGING),
]
_CONTEXT = RequestContext(request_id="seed-dev", user_agent="seed_dev")


def _get_or_create_user(db: Session, email: str, full_name: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name=full_name)
        db.add(user)
        db.flush()
        logger.info("seed.user_created", extra={"email": email})
    return user


def seed(db: Session) -> None:
    users = {email: _get_or_create_user(db, email, name) for email, name in DEV_USERS.items()}
    admin, engineer = users["admin@deployforge.dev"], users["engineer@deployforge.dev"]

    org_name, org_slug = SAMPLE_ORG
    org = db.scalar(select(Organization).where(Organization.slug == org_slug))
    if org is not None:
        db.commit()
        logger.info("seed.sample_org_exists", extra={"slug": org_slug})
        return

    org = Organization(name=org_name, slug=org_slug, created_by_id=admin.id)
    db.add(org)
    db.flush()
    db.add_all(
        [
            OrganizationMembership(
                organization_id=org.id, user_id=admin.id, role=OrganizationRole.OWNER
            ),
            OrganizationMembership(
                organization_id=org.id, user_id=engineer.id, role=OrganizationRole.MEMBER
            ),
        ]
    )
    db.flush()
    record_audit_event(
        db,
        action="organization.created",
        resource_type="organization",
        resource_id=org.id,
        actor_user_id=admin.id,
        organization_id=org.id,
        context=_CONTEXT,
        details={"name": org_name, "slug": org_slug, "source": "seed"},
    )

    for index, (name, slug, environment) in enumerate(SAMPLE_WORKSPACES):
        workspace = Workspace(
            organization_id=org.id,
            name=name,
            slug=slug,
            environment=environment,
            created_by_id=admin.id,
        )
        db.add(workspace)
        db.flush()
        db.add(
            WorkspaceMembership(
                workspace_id=workspace.id,
                organization_id=org.id,
                user_id=admin.id,
                role=WorkspaceRole.ADMIN,
            )
        )
        if index == 0:
            # The engineer only sees the first workspace, demonstrating scoped access.
            db.add(
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    organization_id=org.id,
                    user_id=engineer.id,
                    role=WorkspaceRole.EDITOR,
                )
            )
        record_audit_event(
            db,
            action="workspace.created",
            resource_type="workspace",
            resource_id=workspace.id,
            actor_user_id=admin.id,
            organization_id=org.id,
            workspace_id=workspace.id,
            context=_CONTEXT,
            details={"name": name, "slug": slug, "environment": environment.value},
        )

    db.commit()
    logger.info("seed.sample_org_created", extra={"slug": org_slug})


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    if settings.is_production:
        logger.error("seed.refused", extra={"reason": "ENVIRONMENT=production"})
        return 1
    with get_session_factory()() as db:
        seed(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
