"""Application factory. Template code: routes, schemas, errors and DB access are generated."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, cast

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import ROUTERS
from app.api_error import ApiError, ErrorBody
from app.db.client import create_client, get_db, ping
from app.db.errors import register_db_error_handlers
from app.db.indexes import ensure_indexes
from app.errors import VALIDATION_ERROR_CODES
from app.settings import Settings, get_settings

logger = logging.getLogger("app")

APP_TITLE = "POV Backend"
APP_VERSION = "0.1.0"


HTTP_ERROR_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 415: "UNSUPPORTED_MEDIA_TYPE"}


class HealthResponse(BaseModel):
    status: str
    db: str


class _JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonLogFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())


def _validation_code(request: Request, error: RequestValidationError) -> str:
    route = request.scope.get("route")
    operation_id = route.operation_id if isinstance(route, APIRoute) else None
    codes = VALIDATION_ERROR_CODES.get(operation_id or "", {})
    for item in error.errors():
        location = item.get("loc", ())
        field = str(location[-1]) if location else ""
        for part in reversed([str(part) for part in location]):
            if part in codes:
                return codes[part]
        if field in codes:
            return codes[field]
    return codes.get("__default__", "INVALID_REQUEST")


def _error_response(status_code: int, body: ErrorBody) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True))


def _register_error_handlers(app: FastAPI) -> None:
    async def api_error_handler(_request: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, ApiError)  # noqa: S101 - handler is registered for ApiError
        return _error_response(error.status_code, error.body())

    async def validation_handler(request: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, RequestValidationError)  # noqa: S101
        fields = [
            {"loc": [str(part) for part in item.get("loc", ())], "msg": str(item.get("msg", ""))}
            for item in error.errors()
        ]
        body = ErrorBody(
            code=_validation_code(request, error),
            message="Request validation failed.",
            details={"errors": fields},
        )
        return _error_response(400, body)

    async def http_error_handler(request: Request, error: Exception) -> JSONResponse:
        """Framework-level HTTP errors (malformed JSON, 404 route, 405) in the contract shape."""
        assert isinstance(error, StarletteHTTPException)  # noqa: S101
        if error.status_code == 400:
            route = request.scope.get("route")
            operation_id = route.operation_id if isinstance(route, APIRoute) else ""
            code = VALIDATION_ERROR_CODES.get(operation_id or "", {}).get(
                "__default__", "INVALID_REQUEST"
            )
        else:
            code = HTTP_ERROR_CODES.get(error.status_code, f"HTTP_{error.status_code}")
        return _error_response(error.status_code, ErrorBody(code=code, message=str(error.detail)))

    async def unhandled_handler(request: Request, error: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("unhandled error request_id=%s", request_id, exc_info=error)
        body = ErrorBody(
            code="INTERNAL_ERROR",
            message="Internal server error.",
            details={"request_id": request_id},
        )
        return _error_response(500, body)

    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    register_db_error_handlers(app)
    app.add_exception_handler(Exception, unhandled_handler)


def _custom_openapi(app: FastAPI) -> Callable[[], dict[str, Any]]:
    """Contract-faithful OpenAPI: no FastAPI 422s; validation failures are documented as 400."""

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=APP_TITLE, version=APP_VERSION, routes=app.routes)
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        components.pop("HTTPValidationError", None)
        components.pop("ValidationError", None)
        paths = cast(dict[str, dict[str, Any]], schema.get("paths", {}))
        for path_item in paths.values():
            for raw_operation in path_item.values():
                if not isinstance(raw_operation, dict):
                    continue
                operation = cast(dict[str, Any], raw_operation)
                responses = cast(dict[str, Any], operation.setdefault("responses", {}))
                # Drop only FastAPI's own validation response (contracts may declare a real 422).
                default_422 = responses.get("422")
                had_validation = default_422 is not None and "HTTPValidationError" in str(
                    default_422
                )
                if had_validation:
                    responses.pop("422")
                takes_input = bool(operation.get("parameters") or operation.get("requestBody"))
                if (had_validation or takes_input) and "400" not in responses:
                    responses["400"] = {
                        "description": "Request validation failed",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorBody"}
                            }
                        },
                    }
        if "ErrorBody" not in components:
            components["ErrorBody"] = ErrorBody.model_json_schema()
        app.openapi_schema = schema
        return schema

    return openapi


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    _configure_logging(resolved.LOG_LEVEL)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        client = create_client(resolved)
        app.state.mongo_client = client
        app.state.db = get_db(client, resolved)
        index_task: asyncio.Task[None] | None = None
        if resolved.CREATE_INDEXES:
            index_task = asyncio.create_task(
                ensure_indexes(app.state.db, resolved.VECTOR_DIMENSIONS)
            )
        try:
            yield
        finally:
            if index_task is not None and not index_task.done():
                index_task.cancel()
            await client.close()

    app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)

    @app.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response

    if resolved.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=resolved.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    _register_error_handlers(app)

    @app.get(
        "/api/health", operation_id="getHealth", response_model=HealthResponse, tags=["health"]
    )
    async def health(request: Request) -> HealthResponse:
        db = getattr(request.app.state, "db", None)
        connected = db is not None and await ping(db)
        return HealthResponse(status="ok", db="connected" if connected else "unavailable")

    for router in ROUTERS:
        app.include_router(router)

    app.openapi = _custom_openapi(app)  # type: ignore[method-assign]
    return app


def __getattr__(name: str) -> Any:
    """`uvicorn app.main:app` builds the app lazily so importing this module needs no env."""
    if name == "app":
        return create_app()
    raise AttributeError(name)
