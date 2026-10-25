"""FastAPI application factory.

Run with: ``uvicorn --factory app.main:create_app``
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import build_api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import get_engine
from app.middleware import request_context_middleware

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "app.startup",
            extra={
                "environment": settings.environment,
                "version": settings.app_version,
                "dev_auth_enabled": settings.dev_auth_enabled,
            },
        )
        if settings.dev_auth_enabled:
            logger.warning("app.dev_auth_enabled", extra={"note": "development tokens enabled"})
        yield
        if get_engine.cache_info().currsize:
            get_engine().dispose()
        logger.info("app.shutdown")

    app = FastAPI(
        title=f"{settings.app_name} API",
        version=settings.app_version,
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.dependency_overrides[get_settings] = lambda: settings

    register_exception_handlers(app)
    app.middleware("http")(request_context_middleware)
    # Added last so it is outermost and error responses also carry CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.include_router(build_api_router(settings), prefix=settings.api_v1_prefix)
    return app
