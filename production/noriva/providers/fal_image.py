from __future__ import annotations

import base64
import os

import httpx

from ..config import Settings


class FalImage:
    """Image generation through fal.ai's synchronous endpoint.

    Character consistency: once each main character has a trained LoRA, pass its
    weights URL via `loras` (supported by fal's flux-lora models).
    """

    def __init__(self, settings: Settings, loras: list[dict] | None = None, timeout: float = 180):
        self.settings = settings
        self.loras = loras or []
        self.http = httpx.Client(timeout=timeout)
        self.headers = {"Authorization": f"Key {os.environ['FAL_KEY']}"}

    def generate(self, prompt: str, seed: int | None = None) -> tuple[bytes, float]:
        body: dict = {"prompt": prompt, "image_size": "portrait_4_3", "num_images": 1, "sync_mode": True}
        if seed is not None:
            body["seed"] = seed
        if self.loras:
            body["loras"] = self.loras
        r = self.http.post(f"https://fal.run/{self.settings.image_model}", json=body, headers=self.headers)
        r.raise_for_status()
        url = r.json()["images"][0]["url"]
        # sync_mode returns the image inline as a data URI, so no download from fal's CDN is needed
        if url.startswith("data:"):
            return base64.b64decode(url.split(",", 1)[1]), self.settings.prices.image_each
        img = self.http.get(url)
        img.raise_for_status()
        return img.content, self.settings.prices.image_each
