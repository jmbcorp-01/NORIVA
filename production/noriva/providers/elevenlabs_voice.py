from __future__ import annotations

import os

import httpx

from ..config import Settings


class ElevenLabsVoice:
    """Text-to-speech with designed (synthetic) voices only. Never clone a real person's voice."""

    def __init__(self, settings: Settings, timeout: float = 120):
        self.settings = settings
        self.http = httpx.Client(timeout=timeout)
        self.headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}

    def speak(self, text: str, voice_id: str) -> tuple[bytes, float]:
        r = self.http.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            json={"text": text, "model_id": self.settings.voice_model},
            headers=self.headers,
        )
        r.raise_for_status()
        cost = len(text) / 1000 * self.settings.prices.voice_per_1k_chars
        return r.content, cost
