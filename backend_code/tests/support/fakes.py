"""Fake services for contract tests and fuzzing: every method returns a schema-valid example."""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any, get_type_hints

from tests.support.factories import example_for


class FakeService:
    """Mimics a generated service class; selected methods can be overridden per test."""

    def __init__(self, service_cls: type, overrides: dict[str, Callable[..., Any]] | None = None):
        self._service_cls = service_cls
        self._overrides = overrides or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Callable[..., Any]:
        if name.startswith("_"):
            raise AttributeError(name)
        method = getattr(self._service_cls, name, None)
        if method is None or not inspect.iscoroutinefunction(method):
            raise AttributeError(name)
        return_type = get_type_hints(method).get("return")
        override = self._overrides.get(name)

        async def fake(**kwargs: Any) -> Any:
            self.calls.append((name, kwargs))
            if override is not None:
                result = override(**kwargs)
                if inspect.isawaitable(result):
                    result = await result
                return result
            return example_for(return_type)

        return fake


def provide(value: Any) -> Callable[[], Any]:
    """Zero-argument dependency override (FastAPI must not see parameters on overrides)."""

    def _provider() -> Any:
        return value

    return _provider


def raising(error: Exception) -> Callable[..., Any]:
    def _raise(**_kwargs: Any) -> Any:
        raise error

    return _raise
