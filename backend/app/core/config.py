import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-Powered Verifiable Credential Workflows on Sunbird RC"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "super-secret-key-change-in-production-32-chars-min!"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite+aiosqlite:///./sql_app.db"  # Fallback to local async sqlite for easy immediate running
    )
    
    # Sunbird RC Service
    SUNBIRD_RC_BASE_URL: str = os.getenv("SUNBIRD_RC_BASE_URL", "http://localhost:8080")
    SUNBIRD_RC_API_KEY: str = os.getenv("SUNBIRD_RC_API_KEY", "demo-key")
    USE_MOCK_SUNBIRD: bool = os.getenv("USE_MOCK_SUNBIRD", "True").lower() == "true"
    
    # AI Config
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "True").lower() == "true"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174",]

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()
