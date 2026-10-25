"""Environment-based application configuration."""

from functools import lru_cache
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy import make_url

from app import __version__

Environment = Literal["development", "test", "staging", "production"]
SSLMode = Literal["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]

# Substrings that indicate a placeholder secret copied from an example file.
_PLACEHOLDER_MARKERS = ("change-me", "changeme", "dev-only", "example", "placeholder")
# libpq modes that guarantee an encrypted connection.
_SECURE_SSL_MODES = frozenset({"require", "verify-ca", "verify-full"})
_LOCAL_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1"})  # noqa: S104
# Hosting providers (e.g. Supabase) hand out generic PostgreSQL URLs; SQLAlchemy
# would map those to psycopg2, which is not installed. Use psycopg 3 instead.
_GENERIC_POSTGRES_SCHEMES = ("postgres://", "postgresql://")
_PSYCOPG_SCHEME = "postgresql+psycopg://"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "DeployForge AI"
    app_version: str = __version__
    environment: Environment = "development"
    api_v1_prefix: str = "/api/v1"

    database_url: SecretStr
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=10, ge=0, le=100)
    database_pool_timeout_seconds: int = Field(default=30, ge=1, le=300)
    # Recycle pooled connections before poolers or load balancers drop idle ones.
    database_pool_recycle_seconds: int = Field(default=1800, ge=30, le=86400)
    database_connect_timeout_seconds: int = Field(default=10, ge=1, le=120)
    # Overrides any `sslmode` in DATABASE_URL. Production requires an encrypting mode.
    database_ssl_mode: SSLMode | None = None
    # CA bundle for `verify-ca` / `verify-full` (e.g. the Supabase root certificate).
    database_ssl_root_cert: str | None = None
    # Required for transaction-mode poolers (e.g. Supabase port 6543), which do
    # not support server-side prepared statements.
    database_disable_prepared_statements: bool = False
    database_echo: bool = False

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_format: Literal["json", "console"] = "json"

    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_issuer: str = "deployforge-api"
    jwt_audience: str = "deployforge-web"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)

    # Development-only token issuance. Replaced by SSO in Phase 2 and
    # rejected outright when ENVIRONMENT=production.
    dev_auth_enabled: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def _use_psycopg_driver(cls, value: Any) -> Any:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if isinstance(raw, str):
            for scheme in _GENERIC_POSTGRES_SCHEMES:
                if raw.startswith(scheme):
                    return _PSYCOPG_SCHEME + raw[len(scheme) :]
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> "Settings":
        if self.environment != "production":
            return self

        problems: list[str] = []
        if self.dev_auth_enabled:
            problems.append("DEV_AUTH_ENABLED must be false in production")
        secret = self.jwt_secret_key.get_secret_value()
        if len(secret) < 48 or any(marker in secret.lower() for marker in _PLACEHOLDER_MARKERS):
            problems.append(
                "JWT_SECRET_KEY must be a unique random value of at least 48 characters"
            )
        if not self.cors_origins:
            problems.append("CORS_ORIGINS must list the frontend origin(s) in production")
        for origin in self.cors_origins:
            parts = urlsplit(origin)
            if origin == "*" or parts.scheme != "https" or parts.hostname in _LOCAL_HOSTNAMES:
                problems.append(
                    f"CORS_ORIGINS entry {origin!r} must be an explicit non-local https origin"
                )
        if self.effective_database_ssl_mode not in _SECURE_SSL_MODES:
            problems.append(
                "Database TLS is required in production: set DATABASE_SSL_MODE "
                "(or sslmode in DATABASE_URL) to require, verify-ca or verify-full"
            )
        if self.database_echo:
            problems.append("DATABASE_ECHO must be false in production")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def effective_database_ssl_mode(self) -> str | None:
        if self.database_ssl_mode is not None:
            return self.database_ssl_mode
        sslmode = make_url(self.database_url.get_secret_value()).query.get("sslmode")
        return sslmode if isinstance(sslmode, str) else None

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def docs_enabled(self) -> bool:
        return not self.is_production


class ConfigurationError(RuntimeError):
    """Invalid settings, described without echoing any configured value."""


def load_settings(**overrides: Any) -> Settings:
    """Build settings, replacing pydantic's error text (which can include secret
    input values such as JWT_SECRET_KEY) with field names and messages only."""
    try:
        return Settings(**overrides)
    except ValidationError as exc:
        problems = [
            f"{'.'.join(str(part) for part in error['loc']).upper() or 'SETTINGS'}: {error['msg']}"
            for error in exc.errors(include_input=False, include_url=False)
        ]
        raise ConfigurationError("Invalid configuration: " + " | ".join(problems)) from None


@lru_cache
def get_settings() -> Settings:
    return load_settings()


if __name__ == "__main__":  # pragma: no cover - exercised by docker-entrypoint.sh
    import sys

    try:
        settings = get_settings()
    except ConfigurationError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    print(f"Configuration OK (environment={settings.environment})")
