from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    """Request metadata recorded alongside audited actions."""

    request_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
