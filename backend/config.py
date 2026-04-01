from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 🔐 Optional API (keep for future use)
    RAPIDAPI_KEY: str = ""
    RAPIDAPI_HOST: str = "cricbuzz-cricket.p.rapidapi.com"

    # 🌐 Frontend URL (used in CORS)
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"  # ignore unknown env vars (safe for Railway)


# 🚀 Create settings instance
settings = Settings()
