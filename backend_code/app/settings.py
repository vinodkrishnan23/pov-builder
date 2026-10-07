"""Runtime configuration. The only place the backend reads environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated settings; startup fails fast with a clear message when one is missing."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=True)

    MONGODB_URI: str = Field(min_length=1, description="MongoDB / Atlas connection string")
    MONGODB_DATABASE: str = Field(min_length=1, description="Database holding the POV collections")
    PORT: int = 8080
    CORS_ORIGINS: str = ""
    CREATE_INDEXES: bool = True
    VECTOR_DIMENSIONS: int = Field(default=1024, gt=0)
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = Field(default=5000, gt=0)
    LOG_LEVEL: str = "INFO"

    @field_validator("MONGODB_URI")
    @classmethod
    def _uri_scheme(cls, value: str) -> str:
        if not value.startswith(("mongodb://", "mongodb+srv://")):
            raise ValueError("MONGODB_URI must start with mongodb:// or mongodb+srv://")
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
