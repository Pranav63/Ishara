from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    db_path: str
    llm_provider: str  # none | ollama | openai
    llm_model: str
    ollama_url: str
    llm_base_url: str
    llm_api_key: str
    offer_ttl_s: int
    wave_size: int
    origins: list
    demo_mode: bool
    telegram_token: str = ""
    remote_interpreter_url: str = "https://sanadrelay.cda.gov.ae/"
    confirmation_video_url: str = ""
    operator_key: str = ""
    operator_cookie_secure: bool = True

    def __post_init__(self) -> None:
        for url, allow_local in ((self.remote_interpreter_url, False), (self.confirmation_video_url, True)):
            if not url:
                continue
            if allow_local and url.startswith("/") and not url.startswith("//") and "\\" not in url:
                continue
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or "\\" in url:
                raise ValueError("Interpreter and confirmation video URLs must use HTTPS; videos may also use a local /path.")

    @staticmethod
    def load() -> "Settings":
        origins = _env("ALLOWED_ORIGINS", "http://localhost:3000")
        return Settings(
            db_path=_env("ISHARA_DB", "data/ishara.db"),
            llm_provider=_env("LLM_PROVIDER", "none").lower(),
            llm_model=_env("LLM_MODEL", "qwen2.5:7b-instruct"),
            ollama_url=_env("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
            llm_base_url=_env("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/"),
            llm_api_key=_env("LLM_API_KEY", ""),
            offer_ttl_s=int(_env("OFFER_TTL_S", "45")),
            wave_size=int(_env("WAVE_SIZE", "2")),
            origins=[o.strip() for o in origins.split(",") if o.strip()],
            demo_mode=_env("DEMO_MODE", "0") == "1",
            telegram_token=_env("TELEGRAM_BOT_TOKEN", ""),
            remote_interpreter_url=_env("REMOTE_INTERPRETER_URL", "https://sanadrelay.cda.gov.ae/"),
            confirmation_video_url=_env("CONFIRMATION_VIDEO_URL", ""),
            operator_key=_env("ISHARA_OPERATOR_KEY", ""),
            operator_cookie_secure=_env("OPERATOR_COOKIE_SECURE", "1") == "1",
        )
