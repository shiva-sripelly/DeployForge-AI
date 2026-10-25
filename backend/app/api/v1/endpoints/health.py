import logging
import time

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DbSession, SettingsDep
from app.db.session import check_database
from app.schemas.health import ComponentStatus, LivenessResponse, ReadinessResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=LivenessResponse, summary="Liveness probe")
def liveness(settings: SettingsDep) -> LivenessResponse:
    """The process is up and serving requests. Does not touch dependencies."""
    return LivenessResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessResponse}},
    summary="Readiness probe",
)
def readiness(db: DbSession, settings: SettingsDep) -> JSONResponse:
    """The service can handle traffic: every required dependency is reachable."""
    started = time.perf_counter()
    try:
        check_database(db)
        database = ComponentStatus(
            status="ok", latency_ms=round((time.perf_counter() - started) * 1000, 2)
        )
    except SQLAlchemyError:
        logger.warning("health.database_unavailable", exc_info=True)
        database = ComponentStatus(status="unavailable", detail="Database connection failed.")

    checks = {"database": database}
    ready = all(check.status == "ok" for check in checks.values())
    body = ReadinessResponse(
        status="ready" if ready else "not_ready",
        version=settings.app_version,
        environment=settings.environment,
        checks=checks,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body.model_dump(mode="json"),
    )
