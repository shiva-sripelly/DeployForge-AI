from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SLUG_REGEX = r"^[a-z0-9]+(-[a-z0-9]+)*$"

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
Slug = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=63, pattern=SLUG_REGEX),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InputModel(BaseModel):
    """Base for request bodies: unknown fields are rejected rather than ignored."""

    model_config = ConfigDict(extra="forbid")


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
