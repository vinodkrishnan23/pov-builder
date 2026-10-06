"""Base error type. Contract-specific subclasses are generated in app/errors.py."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel


class ErrorBody(BaseModel):
    """Uniform error body: {"code": ..., "message": ..., "details": {...}?}."""

    code: str
    message: str
    details: dict[str, Any] | None = None


class ApiError(Exception):
    """Raise subclasses of this from services; handlers render the contract error body."""

    status_code: ClassVar[int] = 500
    code: ClassVar[str] = "INTERNAL_ERROR"
    default_message: ClassVar[str] = "Internal server error."

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        self.message = message or self.default_message
        self.details = details
        super().__init__(self.message)

    def body(self) -> ErrorBody:
        return ErrorBody(code=self.code, message=self.message, details=self.details)


class InvalidRequest(ApiError):
    status_code = 400
    code = "INVALID_REQUEST"
    default_message = "The request is invalid."


class NotImplementedOperation(ApiError):
    status_code = 501
    code = "NOT_IMPLEMENTED"
    default_message = "This operation has not been implemented yet."


class DataShapeMismatch(ApiError):
    status_code = 500
    code = "DATA_SHAPE_MISMATCH"
    default_message = "Stored data does not match the data model."


class DatabaseUnavailable(ApiError):
    status_code = 503
    code = "DATABASE_UNAVAILABLE"
    default_message = "The database is currently unavailable."


class DuplicateKeyConflict(Exception):
    """Raised by repositories on a unique-index violation; services map it to the contract error."""

    def __init__(self, key: dict[str, Any] | None = None) -> None:
        self.key = key or {}
        super().__init__(f"duplicate key: {self.key}")
