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
    ENVIRONMENT: str = "development"

    # Retrieval models
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # CobbleAI 2.0 feature flags (each also serves as an ablation switch).
    # Turning one off restores the v1 behaviour of that component.
    HYBRID_RETRIEVAL: bool = True  # dense + BM25 + chapter prior; False = exact v1 retrieval
    RETRIEVAL_PRESET: str = "hybrid"  # see app/services/retrieval/config.py PRESETS
    CITE_OR_DECLINE: bool = True
    LEARNER_MODEL_V2: bool = True
    GRADER_V2: bool = True
    LECTURE_PIPELINE: bool = True
    FRAME_CAPTIONING: bool = True

    # Lecture pipeline (local speech-to-text, slide-change frames, OCR, captioning)
    MAX_MEDIA_SIZE_MB: int = 2048
    WHISPER_MODEL: str = "medium"  # faster-whisper size: tiny | base | small | medium | large-v3
    WHISPER_DEVICE: str = "auto"  # auto | cuda | cpu
    WHISPER_COMPUTE_TYPE: str = "int8_float16"  # used on CUDA; CPU falls back to int8
    LOW_CONFIDENCE_LOGPROB: float = -1.0  # transcript segments below this are shaded for students
    FRAME_SAMPLE_FPS: float = 1.0
    SLIDE_CHANGE_THRESHOLD: float = 0.005  # fraction of thumbnail pixels that must change to count as a new slide (an unchanged slide measures ~0)
    MAX_KEYFRAMES: int = 400
    OCR_ENGINE: str = "easyocr"  # easyocr | none
    CAPTION_MODEL: str = ""  # Ollama vision model for frame captions; empty = LLM_MODEL
    LECTURE_TASK_TIME_LIMIT_S: int = 4 * 3600
    # Host browsers use to reach MinIO for presigned media/file URLs (defaults to S3_ENDPOINT_URL)
    S3_PUBLIC_ENDPOINT_URL: str = ""

    # Grader v2
    GRADER_SAMPLES: int = 3  # independent gradings per answer; their spread feeds the confidence
    GRADER_SAMPLE_TEMPERATURE: float = 0.7
    GRADER_REVIEW_THRESHOLD: float = 0.7  # answers graded with lower confidence go to the instructor

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

    def validate_production_secrets(self) -> None:
        if self.ENVIRONMENT.lower() == "production":
            if self.AWS_SECRET_ACCESS_KEY == "minioadmin":
                raise RuntimeError("CRITICAL: AWS_SECRET_ACCESS_KEY is still the default placeholder in production.")
            if self.SECRET_KEY == "temp_secret_key":
                raise RuntimeError("CRITICAL: SECRET_KEY is still the default placeholder in production.")

settings = Settings()
# Validate on import   server refuses to start with bad keys
settings.validate_jwt_keys()
settings.validate_production_secrets()
