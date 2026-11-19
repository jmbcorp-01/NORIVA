from __future__ import annotations

import base64

import anthropic

from ..config import Settings
from . import T


class RefusedError(RuntimeError):
    pass


def _media_type(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "image/webp"


class AnthropicLLM:
    """Claude for every text agent: planning, scripts, storyboards, dialogue and QA."""

    def __init__(self, settings: Settings, client: anthropic.Anthropic | None = None):
        self.settings = settings
        self.client = client or anthropic.Anthropic()

    def structured(self, system: str, prompt: str, schema: type[T], images: list[bytes] | None = None):
        content: list[dict] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": _media_type(img),
                    "data": base64.standard_b64encode(img).decode(),
                },
            }
            for img in images or []
        ]
        content.append({"type": "text", "text": prompt})

        response = self.client.beta.messages.parse(
            model=self.settings.llm_model,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": self.settings.llm_effort},
            # Server-side fallback: a policy decline is retried on a suitable model
            # inside the same call (dark folklore themes can trip classifiers).
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise RefusedError(f"Model declined: {response.stop_details}")
        if response.stop_reason == "max_tokens" or response.parsed_output is None:
            raise RuntimeError(f"No complete structured output (stop_reason={response.stop_reason})")

        p = self.settings.prices
        u = response.usage
        input_tokens = u.input_tokens + (u.cache_creation_input_tokens or 0) + (u.cache_read_input_tokens or 0)
        cost = input_tokens / 1e6 * p.llm_input_per_mtok + u.output_tokens / 1e6 * p.llm_output_per_mtok
        return response.parsed_output, cost
