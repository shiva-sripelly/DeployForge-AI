from typing import Literal

from pydantic import BaseModel


class LivenessResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str


class ComponentStatus(BaseModel):
    status: Literal["ok", "unavailable"]
    latency_ms: float | None = None
    detail: str | None = None


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    version: str
    environment: str
    checks: dict[str, ComponentStatus]
