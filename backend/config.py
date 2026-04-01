from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    RAPIDAPI_KEY: str = ""
    RAPIDAPI_HOST: str = "cricbuzz-cricket.p.rapidapi.com"
    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "criccity"
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()