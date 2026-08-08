"""
config.py

Centralized application settings, loaded from environment variables
(via a .env file locally, or real environment variables in production —
e.g. AWS Lambda environment config or ECS task definition secrets).

This is the ONLY file that should ever read GOOGLE_API_KEY directly.
Every other module receives the key indirectly through get_settings(),
so there is exactly one place to audit for secret handling.

Nothing in this file is ever returned in an HTTP response — it is
imported and used internally only.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Required: no default value, so the app fails fast at startup if
    # the key is missing rather than silently running without one.
    # Get a free key (no credit card required) at https://aistudio.google.com
    google_api_key: str

    # Sensible default, override via env if needed. gemini-2.5-flash is
    # covered by Google AI Studio's free tier (roughly 1,500 requests/day
    # as of this writing — check the AI Studio dashboard for your
    # account's live limits). gemini-2.5-flash-lite is an even higher-
    # throughput free alternative if you need more headroom.
    gemini_model: str = "gemini-2.5-flash"

    # Comma-separated origins allowed to call this API, parsed into a list.
    allowed_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance. lru_cache ensures the .env file is read
    once, not on every request, while still allowing dependency
    injection for testability (routers can override get_settings in tests).
    """
    return Settings()
