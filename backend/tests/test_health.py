from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import get_db
from app.main import create_app


def test_liveness_reports_service_metadata(client: TestClient, settings: Settings) -> None:
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": "test",
    }


def test_readiness_checks_database(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"]["status"] == "ok"
    assert body["checks"]["database"]["latency_ms"] >= 0


def test_readiness_returns_503_when_database_is_unreachable(settings: Settings) -> None:
    unreachable = create_engine(
        "postgresql+psycopg://nobody:nothing@127.0.0.1:1/missing",
        connect_args={"connect_timeout": 1},
    )
    app = create_app(settings)

    def broken_db():  # type: ignore[no-untyped-def]
        session = Session(bind=unreachable)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = broken_db
    with TestClient(app) as client:
        response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"] == {
        "status": "unavailable",
        "latency_ms": None,
        "detail": "Database connection failed.",
    }
    unreachable.dispose()


def test_responses_carry_request_id_and_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")

    assert len(response.headers["X-Request-ID"]) == 32
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cache-Control"] == "no-store"


def test_valid_incoming_request_id_is_propagated(client: TestClient) -> None:
    response = client.get("/api/v1/health/live", headers={"X-Request-ID": "trace-abc.123"})
    assert response.headers["X-Request-ID"] == "trace-abc.123"


def test_malformed_incoming_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/api/v1/health/live", headers={"X-Request-ID": "bad id\x7f<script>"})
    assert response.headers["X-Request-ID"] != "bad id\x7f<script>"
    assert len(response.headers["X-Request-ID"]) == 32


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist", headers={"X-Request-ID": "req-404"})

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Not Found",
            "details": None,
            "request_id": "req-404",
        }
    }


def test_unhandled_exception_returns_generic_500(app: FastAPI) -> None:
    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    with TestClient(app) as client:
        response = client.get("/api/v1/_boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert "secret" not in response.text
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_cors_allows_configured_origin_only(client: TestClient) -> None:
    allowed = client.options(
        "/api/v1/health/live",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    denied = client.options(
        "/api/v1/health/live",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers
