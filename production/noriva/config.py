"""Settings read from the environment. Keys are never stored in the repository."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Prices:
    """USD prices used for the cost ledger. Check providers' pricing pages and update."""

    llm_input_per_mtok: float = 4.00  # claude-opus-5-5
    llm_output_per_mtok: float = 20.00
    image_each: float = 0.04
    voice_per_1k_chars: float = 0.30


@dataclass(frozen=True)
class Settings:
    llm_model: str = "claude-opus-5-5"
    llm_effort: str = "high"
    image_model: str = "fal-ai/flux/dev"
    voice_model: str = "eleven_multilingual_v2"
    storyboard_variants: int = 3
    max_image_attempts: int = 3
    qa_pass_score: int = 80
    prices: Prices = field(default_factory=Prices)
    # character id -> provider voice id, from env NORIVA_VOICE_MAP="hana=abc123,narration=def456"
    voice_map: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "Settings":
        voice_map = {}
        for pair in filter(None, os.environ.get("NORIVA_VOICE_MAP", "").split(",")):
            k, _, v = pair.partition("=")
            voice_map[k.strip()] = v.strip()
        return cls(
            llm_model=os.environ.get("NORIVA_LLM_MODEL", cls.llm_model),
            image_model=os.environ.get("NORIVA_IMAGE_MODEL", cls.image_model),
            voice_map=voice_map,
        )


def missing_keys() -> list[str]:
    """API keys the real providers need that are not set."""
    needed = ["ANTHROPIC_API_KEY", "FAL_KEY", "ELEVENLABS_API_KEY"]
    return [k for k in needed if not os.environ.get(k)]
