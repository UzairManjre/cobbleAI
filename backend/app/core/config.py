from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017/cobbleai"
    DATABASE_NAME: str = "cobbleai"
    REDIS_URL: str = "redis://localhost:6379/0"
    QDRANT_URL: str = "http://localhost:6333"
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_ENDPOINT_URL: str = "http://localhost:9002"
    S3_BUCKET: str = "cobble-documents"
    SECRET_KEY: str = "temp_secret_key"
    LLM_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "gemma4:e2b"
    JWT_PRIVATE_KEY: str = "temp_private_key"
    JWT_PUBLIC_KEY: str = "temp_public_key"

    def validate_jwt_keys(self) -> None:
        """Fail fast if JWT keys are still the example placeholders."""
        placeholder_markers = [
            "REPLACE_WITH_YOUR_OWN",
            "temp_private_key",
            "temp_public_key",
        ]
        for marker in placeholder_markers:
            if marker in self.JWT_PRIVATE_KEY or marker in self.JWT_PUBLIC_KEY:
                raise RuntimeError(
                    f"CRITICAL: JWT keys contain placeholder '{marker}'.\n"
                    "Generate a real RSA key pair and update .env. See .env.example for instructions."
                )

settings = Settings()
# Validate on import   server refuses to start with bad keys
settings.validate_jwt_keys()
