"""MongoDB client lifecycle. The client is lazy: startup never blocks on the database."""

from __future__ import annotations

import asyncio
from datetime import UTC
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.settings import Settings

Document = dict[str, Any]


def create_client(settings: Settings) -> AsyncMongoClient[Document]:
    return AsyncMongoClient(
        settings.MONGODB_URI,
        tz_aware=True,
        tzinfo=UTC,
        serverSelectionTimeoutMS=settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        appname="pov-backend",
    )


def get_db(client: AsyncMongoClient[Document], settings: Settings) -> AsyncDatabase[Document]:
    return client[settings.MONGODB_DATABASE]


async def ping(db: AsyncDatabase[Document], timeout_seconds: float = 2.0) -> bool:
    try:
        await asyncio.wait_for(db.command("ping"), timeout=timeout_seconds)
    except Exception:  # noqa: BLE001 - health must never raise
        return False
    return True
