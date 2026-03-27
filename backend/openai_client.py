import os
import json
from openai import OpenAI

from logging_config import get_logger

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY", ""),
    base_url=os.environ.get("OPENAI_BASE_URL", "https://models.inference.ai.azure.com"),
)
MODEL = "gpt-4o-mini"
logger = get_logger(__name__)


def _get_total_tokens(resp) -> int | None:
    usage = getattr(resp, "usage", None)
    if not usage:
        return None

    total_tokens = getattr(usage, "total_tokens", None)
    if total_tokens is not None:
        return total_tokens

    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    combined = prompt_tokens + completion_tokens
    return combined or None


def call_openai(prompt: str, max_tokens: int = 1024) -> str | None:
    """Return a plain-text completion."""
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        logger.info("OpenAI text completion succeeded model=%s tokens=%s", MODEL, _get_total_tokens(resp))
        return resp.choices[0].message.content
    except Exception as e:
        logger.error("OpenAI text completion failed: %s", e, exc_info=True)
        return None


def call_openai_json(prompt: str, max_tokens: int = 1024) -> dict | None:
    """Return a parsed JSON completion."""
    try:
        logger.info("OpenAI JSON request starting model=%s key_set=%s", MODEL, bool(os.environ.get("OPENAI_API_KEY")))
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.choices[0].message.content
        logger.info("OpenAI JSON completion succeeded model=%s tokens=%s", MODEL, _get_total_tokens(resp))
        return json.loads(text) if text else None
    except Exception as e:
        logger.error("OpenAI JSON completion failed: %s", e, exc_info=True)
        return None
