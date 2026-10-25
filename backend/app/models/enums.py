"""Helpers for storing Python enums as constrained VARCHAR columns.

Non-native enums avoid PostgreSQL ``ALTER TYPE`` migrations when values are added
later, while a CHECK constraint still rejects unknown values at the database level.
"""

from enum import StrEnum

from sqlalchemy import Enum


def str_enum_column_type(enum_cls: type[StrEnum], name: str) -> Enum:
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )
