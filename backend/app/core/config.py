"""Environment-based application configuration."""

from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app import __version__

Environment = Literal["development", "test", "staging", "production"]

# Substrings that indicate a placeholder secret copied from an example file.
_PLACEHOLDER_MARKERS = ("change-me", "changeme", "dev-only", "example", "placeholder")


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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
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
        if "*" in self.cors_origins:
            problems.append("CORS_ORIGINS must not contain '*' in production")
        if self.database_echo:
            problems.append("DATABASE_ECHO must be false in production")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def docs_enabled(self) -> bool:
        return not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
