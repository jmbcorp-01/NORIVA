"""Provider interfaces. Agents depend on these, never on a vendor directly,
so a tool can be swapped after the quality and cost comparison."""

from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    def structured(
        self, system: str, prompt: str, schema: type[T], images: list[bytes] | None = None
    ) -> tuple[T, float]:
        """Return a validated instance of `schema` and the call's cost in USD."""


class ImageGen(Protocol):
    def generate(
        self, prompt: str, seed: int | None = None, references: list[bytes] | None = None
    ) -> tuple[bytes, float]:
        """Return PNG/JPEG bytes and the cost in USD. `references` are character sheets to match."""


class Voice(Protocol):
    def speak(self, text: str, voice_id: str) -> tuple[bytes, float]:
        """Return MP3 bytes and the cost in USD."""
