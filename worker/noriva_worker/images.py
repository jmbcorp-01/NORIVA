"""그림 생성(fal.ai)과 생성 직후 정리. 시제품 production/의 FalImage, trim_border를 옮겨 왔어요."""

from __future__ import annotations

import base64
import io
import os
import time
from dataclasses import dataclass, field
from typing import Protocol

from . import ledger

RETRY_STATUS = {403, 429, 500, 502, 503, 504}


@dataclass
class ImageResult:
    data: bytes
    model: str
    cost_usd: float
    recorded: bool = field(default=False, init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        # 그림 한 장 값이 나간 순간 장부에 적어요 (CLAUDE.md 1-3)
        self.recorded = ledger.record(self._entry())

    def _entry(self) -> dict:
        return {"provider": "fal", "model": self.model, "units": {"images": 1}, "cost_usd": self.cost_usd}

    def cost_entry(self) -> dict:
        return {**self._entry(), "recorded": self.recorded}


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
    # 그림이 안 나왔거나(did not generate) 그림 모델의 안전 필터에 걸린 경우(content_policy_violation)
    return r is not None and r.status_code == 422 and ("did not generate" in r.text or "content_policy_violation" in r.text)


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


REF_MAX_SIDE = 1536  # 참고 그림은 이 크기면 충분해요. 2K 원본을 그대로 보내면 메모리와 전송량만 커져요.


def shrink_ref(data: bytes, max_side: int = REF_MAX_SIDE) -> bytes:
    """큰 참고 그림을 줄여요. 작거나 읽을 수 없으면 그대로 둬요."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data))
        if max(img.size) <= max_side:
            return data
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        out = io.BytesIO()
        img.save(out, "PNG", optimize=True)
        return out.getvalue()
    except Exception:
        return data


def request_for(model: str, prompt: str, aspect_ratio: str, references: list[bytes] | None) -> tuple[str, dict]:
    """모델마다 다른 호출 주소와 입력 이름을 맞춰요."""
    urls = ["data:image/png;base64," + base64.b64encode(shrink_ref(ref)).decode() for ref in references or []]
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
                        + ("그림 모델의 안전 필터에 걸렸어요 (폭력·피·노출 표현 등)." if "content_policy" in e.response.text
                           else "참고 사진이나 지시 문구가 안전 필터에 걸렸을 수 있어요.")
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


# ── 기계 검사와 후처리 (그림 모델·Claude를 부르지 않아 돈이 들지 않아요) ─────────────


def crop_region(data: bytes, x: float, y: float, w: float, h: float, pad: float = 0.15, max_side: int = 768) -> bytes | None:
    """퍼센트 좌표(0~100)의 영역을 원본 크기에서 조금 넉넉히 잘라요. 확대 검사에 써요."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return None
    W, H = img.size
    try:
        x, y, w, h = (max(0.0, min(100.0, float(v))) for v in (x, y, w, h))
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    px, py = w * pad, h * pad
    box = (
        int(W * max(0.0, x - px) / 100),
        int(H * max(0.0, y - py) / 100),
        int(W * min(100.0, x + w + px) / 100),
        int(H * min(100.0, y + h + py) / 100),
    )
    if box[2] - box[0] < 8 or box[3] - box[1] < 8:
        return None
    part = img.crop(box)
    part.thumbnail((max_side, max_side))
    out = io.BytesIO()
    part.save(out, "JPEG", quality=92)
    return out.getvalue()


def _row_stats(img, axis: int) -> list[tuple[float, float]]:
    """줄(axis=0: 가로줄, 1: 세로줄)마다 (밝기 평균, 표준편차)."""
    px = img.load()
    w, h = img.size
    out = []
    n_outer, n_inner = (h, w) if axis == 0 else (w, h)
    for i in range(n_outer):
        vals = [px[j, i] if axis == 0 else px[i, j] for j in range(n_inner)]
        m = sum(vals) / n_inner
        var = sum((v - m) ** 2 for v in vals) / n_inner
        out.append((m, var ** 0.5))
    return out


def comic_page_bands(data: bytes) -> list[str]:
    """그림 한가운데를 가로지르는 단색 띠(만화책 칸 사이 여백)를 찾아요. 한 장에 여러 컷이 들어간 그림이에요 (치명 결함).

    가장자리 띠는 trim_border가 이미 잘라요. 띠 위아래(또는 좌우)에 모두 그림이 충분히 있을 때만 칸 나눔으로 봐요."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data)).convert("L")
    except Exception:
        return []
    img.thumbnail((256, 256))
    found: list[str] = []
    for axis, label in ((0, "가로"), (1, "세로")):
        stats = _row_stats(img, axis)
        n = len(stats)
        if n < 40:
            continue
        flat = [s < 4 and (m > 232 or m < 18) for m, s in stats]
        busy = [s > 18 for _, s in stats]
        i = int(n * 0.12)
        while i < int(n * 0.88):
            if flat[i]:
                j = i
                while j < n and flat[j]:
                    j += 1
                thick = j - i
                before = sum(busy[:i]) / max(1, i)
                after = sum(busy[j:]) / max(1, n - j)
                if 1 <= thick <= n * 0.06 and before > 0.5 and after > 0.5 and i > n * 0.15 and j < n * 0.85:
                    color = "흰" if stats[i][0] > 128 else "검은"
                    found.append(f"그림 {int(100 * i / n)}% 위치에 {label}로 가로지르는 {color} 띠가 있어 한 장에 컷이 여러 개처럼 보여요")
                    break
                i = j
            else:
                i += 1
    return found


def color_stats(data: bytes) -> tuple[float, float, float] | None:
    """그림 전체의 평균 색(LAB). 장면 안에서 색이 따로 노는지(AI-10) 비교할 때 써요."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return None
    img.thumbnail((128, 128))
    lab = img.convert("LAB")
    bands = lab.split()
    out = []
    for b in bands:
        hist = b.histogram()
        total = sum(hist) or 1
        out.append(sum(i * c for i, c in enumerate(hist)) / total)
    return (out[0], out[1], out[2])


def color_distance(a: bytes, b: bytes) -> float | None:
    sa, sb = color_stats(a), color_stats(b)
    if not sa or not sb:
        return None
    # PIL의 LAB은 0~255 범위라 L은 100/255로 맞춰요
    dl = (sa[0] - sb[0]) * 100 / 255
    return round((dl ** 2 + (sa[1] - sb[1]) ** 2 + (sa[2] - sb[2]) ** 2) ** 0.5, 1)


COLOR_MATCH_MIN = 6.0  # 이보다 작은 차이는 손대지 않아요
COLOR_MATCH_MAX = 22.0  # 이보다 큰 차이는 연출(불이 꺼짐, 회상)일 수 있어 손대지 않아요


def match_colors(data: bytes, anchor: bytes, strength: float = 0.5) -> bytes | None:
    """같은 장면 앞 컷의 색 분위기로 살짝 끌어당겨요 (04번 5.2 팔레트 맞춤).

    차이가 작으면 할 필요가 없고, 너무 크면 의도한 빛 변화일 수 있어 그대로 둬요. 바꾼 그림을 돌려주거나, 바꾸지 않으면 None."""
    from PIL import Image

    d = color_distance(data, anchor)
    if d is None or d < COLOR_MATCH_MIN or d > COLOR_MATCH_MAX or strength <= 0:
        return None
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        ref = Image.open(io.BytesIO(anchor)).convert("RGB")
    except Exception:
        return None

    def mean_std(im):
        small = im.copy()
        small.thumbnail((256, 256))
        res = []
        for band in small.convert("LAB").split():
            hist = band.histogram()
            total = sum(hist) or 1
            m = sum(i * c for i, c in enumerate(hist)) / total
            v = sum(((i - m) ** 2) * c for i, c in enumerate(hist)) / total
            res.append((m, max(v ** 0.5, 1.0)))
        return res

    src_s, ref_s = mean_std(img), mean_std(ref)
    lab = img.convert("LAB")
    out_bands = []
    for band, (ms, ss), (mr, sr) in zip(lab.split(), src_s, ref_s):
        scale = 1 + strength * (sr / ss - 1)
        shift_to = ms + strength * (mr - ms)
        lut = [max(0, min(255, int(round((i - ms) * scale + shift_to)))) for i in range(256)]
        out_bands.append(band.point(lut))
    merged = Image.merge("LAB", out_bands).convert("RGB")
    out = io.BytesIO()
    merged.save(out, "PNG")
    return out.getvalue()


def contact_sheet(items: list[tuple[int, bytes]], cols: int = 3, cell: int = 340) -> bytes:
    """컷 여러 장을 번호를 붙여 한 장으로 묶어요. 검수가 회차의 모든 컷을 적은 비용으로 보게 해요."""
    from PIL import Image, ImageDraw

    cells = []
    for idx, data in items:
        try:
            im = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            im = Image.new("RGB", (cell, cell), (200, 200, 200))
        im.thumbnail((cell, int(cell * 1.6)))
        cells.append((idx, im))
    rows = -(-len(cells) // cols) if cells else 1
    row_h = [max((im.size[1] for _, im in cells[r * cols:(r + 1) * cols]), default=cell) for r in range(rows)]
    sheet = Image.new("RGB", (cols * (cell + 8) + 8, sum(h + 8 for h in row_h) + 8), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    y = 8
    for r in range(rows):
        x = 8
        for idx, im in cells[r * cols:(r + 1) * cols]:
            sheet.paste(im, (x, y))
            draw.rectangle((x, y, x + 34, y + 18), fill=(0, 0, 0))
            draw.text((x + 4, y + 4), str(idx), fill=(255, 255, 255))
            x += cell + 8
        y += row_h[r] + 8
    out = io.BytesIO()
    sheet.save(out, "JPEG", quality=85)
    return out.getvalue()
