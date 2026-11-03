from __future__ import annotations

import json
import logging
import re
from typing import Optional

import httpx

from .config import Settings

log = logging.getLogger("ishara.llm")
_THINK = re.compile(r"<think>.*?</think>", re.S)  # reasoning models (e.g. DeepSeek-R1 family)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.M)


class LLM:
    """Provider-agnostic. Every caller must work when this returns None."""

    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg
        self._http = httpx.Client()

    @property
    def enabled(self) -> bool:
        return self.cfg.llm_provider in ("ollama", "openai")

    @property
    def label(self) -> str:
        if not self.enabled:
            return "Rules only"
        where = "local" if self.cfg.llm_provider == "ollama" else "hosted"
        return f"{self.cfg.llm_model} ({where})"

    def _chat(self, system: str, user: str, schema: Optional[dict], timeout: float) -> Optional[str]:
        c = self.cfg
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        try:
            if c.llm_provider == "ollama":
                body = {"model": c.llm_model, "messages": messages, "stream": False, "options": {"temperature": 0}}
                if schema:
                    body["format"] = schema
                r = self._http.post(f"{c.ollama_url}/api/chat", json=body, timeout=timeout)
                r.raise_for_status()
                out = r.json()["message"]["content"]
            else:
                body = {"model": c.llm_model, "messages": messages, "temperature": 0}
                if schema:
                    body["response_format"] = {"type": "json_object"}
                r = self._http.post(
                    f"{c.llm_base_url}/chat/completions",
                    json=body,
                    headers={"Authorization": f"Bearer {c.llm_api_key}"},
                    timeout=timeout,
                )
                r.raise_for_status()
                out = r.json()["choices"][0]["message"]["content"]
            return _THINK.sub("", out).strip()
        except Exception as e:  # network, auth, bad payload: caller falls back
            log.warning("llm call failed: %s", e)
            return None

    def json(self, system: str, user: str, schema: dict, timeout: float = 20) -> Optional[dict]:
        if not self.enabled:
            return None
        out = self._chat(system, user, schema, timeout)
        if not out:
            return None
        try:
            data = json.loads(_FENCE.sub("", out))
            return data if isinstance(data, dict) else None
        except ValueError:
            return None

    def text(self, system: str, user: str, timeout: float = 20) -> Optional[str]:
        if not self.enabled:
            return None
        return self._chat(system, user, None, timeout) or None
