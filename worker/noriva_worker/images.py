"""그림 생성(fal.ai)과 생성 직후 정리. 시제품 production/의 FalImage, trim_border를 옮겨 왔어요."""

from __future__ import annotations

import base64
import io
import os
import time
from dataclasses import dataclass
from typing import Protocol

RETRY_STATUS = {403, 429, 500, 502, 503, 504}


@dataclass
class ImageResult:
    data: bytes
    model: str
    cost_usd: float

    def cost_entry(self) -> dict:
        return {"provider": "fal", "model": self.model, "units": {"images": 1}, "cost_usd": self.cost_usd}


class ImageGen(Protocol):
    def generate(
        self,
        prompt: str,
        seed: int | None = None,
        references: list[bytes] | None = None,
        aspect_ratio: str = "3:4",
        model: str | None = None,
    ) -> ImageResult: ...


class ImageNotConfiguredError(Exception):
    """FAL_KEY가 없어서 그림을 그릴 수 없어요."""


# 비교 시험에 쓰는 그림 모델. 가격은 fal 안내 기준 어림값이에요 (실제 청구는 fal 대시보드).
IMAGE_MODELS: dict[str, float] = {
    "fal-ai/nano-banana": 0.04,
    "fal-ai/nano-banana-pro": 0.15,
    "fal-ai/bytedance/seedream/v4": 0.03,
}

# Seedream은 비율 대신 크기 이름을 받아요
_SEEDREAM_SIZE = {"3:4": "portrait_4_3", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "16:9": "landscape_16_9", "1:1": "square_hd"}


def request_for(model: str, prompt: str, aspect_ratio: str, references: list[bytes] | None) -> tuple[str, dict]:
    """모델마다 다른 호출 주소와 입력 이름을 맞춰요."""
    urls = ["data:image/png;base64," + base64.b64encode(ref).decode() for ref in references or []]
    body: dict = {"prompt": prompt, "num_images": 1, "sync_mode": True}
    if "seedream" in model:
        body["image_size"] = _SEEDREAM_SIZE.get(aspect_ratio, "portrait_4_3")
        if urls:
            body["image_urls"] = urls
        return model + ("/edit" if urls else "/text-to-image"), body
    body["aspect_ratio"] = aspect_ratio
    if model.endswith("-pro"):
        body["resolution"] = "1K"
    if urls:
        body["image_urls"] = urls
        return model + "/edit", body
    return model, body


def price_for(endpoint: str, default_model: str, default_price: float) -> float:
    base = endpoint.removesuffix("/edit").removesuffix("/text-to-image")
    if base == default_model:
        return default_price
    return IMAGE_MODELS.get(base, default_price)


class FalImage:
    """fal.ai 동기 호출. 인물 시트(참조 이미지)를 주면 모델의 /edit 경로로 그 얼굴과 옷을 맞춰 그려요."""

    def __init__(self, model: str, price_each: float, timeout: float = 300, retries: int = 3):
        import httpx

        key = os.environ.get("FAL_KEY")
        if not key:
            raise ImageNotConfiguredError("FAL_KEY가 설정되지 않아 작화 단계를 실행할 수 없어요. 비밀 값에 FAL_KEY를 넣어 주세요.")
        self.model = model
        self.price_each = price_each
        self.retries = retries
        self.http = httpx.Client(timeout=timeout)
        self.headers = {"Authorization": f"Key {key}"}

    def _post(self, url: str, body: dict):
        for attempt in range(self.retries):
            r = self.http.post(url, json=body, headers=self.headers)
            if r.status_code not in RETRY_STATUS or attempt == self.retries - 1:
                break
            time.sleep(5 * 2**attempt)
        r.raise_for_status()
        return r

    def generate(
        self,
        prompt: str,
        seed: int | None = None,
        references: list[bytes] | None = None,
        aspect_ratio: str = "3:4",
        model: str | None = None,
    ) -> ImageResult:
        model, body = request_for(model or self.model, prompt, aspect_ratio, references)
        if seed is not None:
            body["seed"] = seed
        r = self._post(f"https://fal.run/{model}", body)
        url = r.json()["images"][0]["url"]
        if url.startswith("data:"):
            data = base64.b64decode(url.split(",", 1)[1])
        else:
            img = self.http.get(url)
            img.raise_for_status()
            data = img.content
        return ImageResult(data=to_png(data), model=model, cost_usd=price_for(model, self.model, self.price_each))


def to_png(data: bytes) -> bytes:
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data))
    except Exception:
        return data
    if img.format == "PNG":
        return data
    out = io.BytesIO()
    img.convert("RGB").save(out, "PNG")
    return out.getvalue()


def trim_border(data: bytes, tolerance: int = 18, max_fraction: float = 0.25) -> bytes:
    """모델이 가끔 그려 넣는 단색 테두리나 위아래 띠를 잘라내요 (AI-12 '프레임 안의 프레임').

    테두리가 한 가지 색이고 잘라도 그림 대부분이 남을 때만 잘라요."""
    from PIL import Image, ImageChops

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return data
    w, h = img.size
    corner = img.getpixel((0, 0))
    diff = ImageChops.difference(img, Image.new("RGB", img.size, corner)).convert("L")
    box = diff.point(lambda v: 255 if v > tolerance else 0).getbbox()
    if not box or box == (0, 0, w, h):
        return data
    left, top, right, bottom = box
    if (right - left) < w * (1 - max_fraction) or (bottom - top) < h * (1 - max_fraction):
        return data
    pad = 6  # 여백 바로 안쪽의 얇은 컷 테두리 선까지 깎아요
    cropped = img.crop((min(left + pad, w), min(top + pad, h), max(right - pad, 0), max(bottom - pad, 0)))
    out = io.BytesIO()
    cropped.save(out, "PNG")
    return out.getvalue()


def thumbnail(data: bytes, max_side: int = 1024) -> bytes:
    """검사 모델에 보낼 때는 작게 줄여 비용을 아껴요."""
    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()
