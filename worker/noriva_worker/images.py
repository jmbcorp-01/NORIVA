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


class NoImageError(Exception):
    """그림 모델이 이 지시로 그림을 내놓지 않았어요 (fal 422 'did not generate the expected output').
    안전 필터, 참고 사진, 지시 문구 때문에 생겨요. 씨앗을 바꿔 몇 번 다시 해도 안 될 때 올려요."""


NO_OUTPUT_TRIES = 3  # 422 '그림 없음'이면 씨앗을 바꿔 다시 그려 보는 횟수


def _no_output(e: Exception) -> bool:
    r = getattr(e, "response", None)
    return r is not None and r.status_code == 422 and "did not generate" in r.text


# 비교 시험에 쓰는 그림 모델. 가격은 fal 안내 기준 어림값이에요 (실제 청구는 fal 대시보드).
IMAGE_MODELS: dict[str, float] = {
    "fal-ai/nano-banana": 0.04,
    "fal-ai/nano-banana-pro": 0.15,
    "fal-ai/bytedance/seedream/v4": 0.03,
}

# Seedream은 비율 대신 크기를 받아요. 이름 프리셋은 해상도가 낮아서 픽셀로 줘요.
_SEEDREAM_SIZE = {
    "3:4": {"width": 1536, "height": 2048},
    "9:16": {"width": 1152, "height": 2048},
    "4:3": {"width": 2048, "height": 1536},
    "16:9": {"width": 2048, "height": 1152},
    "1:1": {"width": 2048, "height": 2048},
}


def request_for(model: str, prompt: str, aspect_ratio: str, references: list[bytes] | None) -> tuple[str, dict]:
    """모델마다 다른 호출 주소와 입력 이름을 맞춰요."""
    urls = ["data:image/png;base64," + base64.b64encode(ref).decode() for ref in references or []]
    body: dict = {"prompt": prompt, "num_images": 1, "sync_mode": True}
    if "seedream" in model:
        body["image_size"] = _SEEDREAM_SIZE.get(aspect_ratio, _SEEDREAM_SIZE["3:4"])
        if urls:
            body["image_urls"] = urls
        return model + ("/edit" if urls else "/text-to-image"), body
    body["aspect_ratio"] = aspect_ratio
    if model.endswith("-pro"):
        body["resolution"] = "2K"
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
        import httpx

        model, body = request_for(model or self.model, prompt, aspect_ratio, references)
        for t in range(NO_OUTPUT_TRIES):
            if seed is not None:
                body["seed"] = seed + 7919 * t
            try:
                r = self._post(f"https://fal.run/{model}", body)
                break
            except httpx.HTTPStatusError as e:
                if not _no_output(e):
                    raise
                if t == NO_OUTPUT_TRIES - 1:
                    raise NoImageError(
                        f"그림 모델이 이 지시로 그림을 만들지 못했어요 ({NO_OUTPUT_TRIES}번 시도). "
                        "참고 사진이나 지시 문구가 안전 필터에 걸렸을 수 있어요."
                    ) from e
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
