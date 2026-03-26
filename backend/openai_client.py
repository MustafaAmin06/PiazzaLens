import os
import json
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
MODEL = "gpt-4o-mini"


def call_openai(prompt: str, max_tokens: int = 1024) -> str | None:
    """Return a plain-text completion."""
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content
    except Exception as e:
        print(f"[openai_client] text call failed: {e}")
        return None


def call_openai_json(prompt: str, max_tokens: int = 1024) -> dict | None:
    """Return a parsed JSON completion."""
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.choices[0].message.content
        return json.loads(text) if text else None
    except Exception as e:
        print(f"[openai_client] JSON call failed: {e}")
        return None
