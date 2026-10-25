import re
import secrets
import unicodedata

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError

_UNIQUE_VIOLATION = "23505"
_SLUG_MIN, _SLUG_MAX = 3, 63


def slugify(value: str) -> str:
    """Derive a URL-safe slug from a display name, e.g. "Acme Corp." -> "acme-corp"."""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    slug = slug[: _SLUG_MAX - 7].rstrip("-")
    if len(slug) < _SLUG_MIN:
        slug = f"{slug or 'item'}-{secrets.token_hex(3)}"
    return slug


def with_random_suffix(slug: str) -> str:
    return f"{slug[: _SLUG_MAX - 7].rstrip('-')}-{secrets.token_hex(3)}"


def commit_or_conflict(db: Session, message: str) -> None:
    """Commit, translating unique-constraint races into a 409 Conflict."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) == _UNIQUE_VIOLATION:
            raise ConflictError(message) from exc
        raise
