"""Request context middleware: request IDs, access logging, security headers."""

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status

from app.core.exceptions import error_response
from app.core.logging import request_id_ctx

logger = logging.getLogger("app.request")

_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,128}")
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


async def request_context_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if _REQUEST_ID_PATTERN.fullmatch(incoming) else uuid.uuid4().hex
    request.state.request_id = request_id
    token = request_id_ctx.set(request_id)
    started = time.perf_counter()
    try:
        try:
            response = await call_next(request)
        except Exception:
            # Last-resort handler: never leak internals, always return the error envelope.
            logger.exception("request.unhandled_error")
            response = error_response(
                request,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="internal_error",
                message="An unexpected error occurred.",
            )

        response.headers["X-Request-ID"] = request_id
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")

        path = request.url.path
        logger.log(
            logging.DEBUG if "/health/" in path else logging.INFO,
            "request.completed",
            extra={
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return response
    finally:
        request_id_ctx.reset(token)
