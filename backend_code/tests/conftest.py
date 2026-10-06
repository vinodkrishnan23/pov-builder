"""Shared fixtures. Tests run without a database: providers are overridden with fakes."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest

os.environ.setdefault("MONGODB_URI", "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=300")
os.environ.setdefault("MONGODB_DATABASE", "test_db")
os.environ.setdefault("CREATE_INDEXES", "false")

from app.main import create_app
from app.settings import get_settings
from tests.support.fakes import FakeService, provide


@pytest.fixture
def app_factory() -> Callable[[dict[Callable[..., Any], Any]], Any]:
    def make(overrides: dict[Callable[..., Any], Any]) -> Any:
        get_settings.cache_clear()
        application = create_app()
        for provider, fake in overrides.items():
            application.dependency_overrides[provider] = provide(fake)
        return application

    return make


@pytest.fixture
async def client_factory(
    app_factory: Callable[[dict[Callable[..., Any], Any]], Any],
) -> AsyncIterator[Callable[[dict[Callable[..., Any], Any]], httpx.AsyncClient]]:
    clients: list[httpx.AsyncClient] = []

    def make(overrides: dict[Callable[..., Any], Any]) -> httpx.AsyncClient:
        application = app_factory(overrides)
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application, raise_app_exceptions=False),
            base_url="http://testserver",
        )
        clients.append(client)
        return client

    yield make
    for client in clients:
        await client.aclose()


__all__ = ["FakeService"]
