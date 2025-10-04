"""Configuration management for AI microservice."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""

    # OpenRouter Configuration
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    model_name: str = "google/gemma-2-27b-it"

    # Supabase Configuration
    supabase_url: str
    supabase_key: str

    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8001
    debug: bool = False

    # LLM Configuration
    max_tokens: int = 1000
    temperature: float = 0.7
    top_p: float = 0.9
    conversation_history_limit: int = 10
    conversation_ttl_hours: int = 24

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
