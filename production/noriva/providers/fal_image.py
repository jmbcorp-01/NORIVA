from __future__ import annotations

import base64
import os
import time

import httpx

from ..config import Settings

RETRY_STATUS = {403, 429, 500, 502, 503, 504}


class FalImage:
    """Image generation through fal.ai's synchronous endpoint.

    Character consistency: when character reference sheets are passed, the model's
    "/edit" endpoint draws the panel while matching those references.
    """

    def __init__(self, settings: Settings, timeout: float = 300, retries: int = 3):
        self.settings = settings
        self.retries = retries
        self.http = httpx.Client(timeout=timeout)
        self.headers = {"Authorization": f"Key {os.environ['FAL_KEY']}"}

    def _post(self, url: str, body: dict) -> httpx.Response:
        for attempt in range(self.retries):
            r = self.http.post(url, json=body, headers=self.headers)
            if r.status_code not in RETRY_STATUS or attempt == self.retries - 1:
                break
            time.sleep(5 * 2**attempt)
        r.raise_for_status()
        return r

    def generate(
        self, prompt: str, seed: int | None = None, references: list[bytes] | None = None
    ) -> tuple[bytes, float]:
        body: dict = {"prompt": prompt, "num_images": 1, "sync_mode": True, "aspect_ratio": "3:4"}
        model = self.settings.image_model
        if references:
            model += "/edit"
            body["image_urls"] = [
                "data:image/jpeg;base64," + base64.b64encode(ref).decode() for ref in references
            ]
        if seed is not None:
            body["seed"] = seed
        r = self._post(f"https://fal.run/{model}", body)
        url = r.json()["images"][0]["url"]
        # sync_mode returns the image inline as a data URI, so no download from fal's CDN is needed
        if url.startswith("data:"):
            return base64.b64decode(url.split(",", 1)[1]), self.settings.prices.image_each
        img = self.http.get(url)
        img.raise_for_status()
        return img.content, self.settings.prices.image_each
