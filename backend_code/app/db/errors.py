"""Map driver connectivity failures to a clean 503 instead of a 500 stack trace."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from app.api_error import DatabaseUnavailable


def register_db_error_handlers(app: FastAPI) -> None:
    async def _unavailable(_request: Request, _error: Exception) -> JSONResponse:
        error = DatabaseUnavailable()
        return JSONResponse(
            status_code=error.status_code, content=error.body().model_dump(exclude_none=True)
        )

    app.add_exception_handler(ServerSelectionTimeoutError, _unavailable)
    app.add_exception_handler(ConnectionFailure, _unavailable)
