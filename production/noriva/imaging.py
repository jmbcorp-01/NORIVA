"""Small image clean-ups applied to every generated panel."""

from __future__ import annotations

import io

from PIL import Image, ImageChops


def trim_border(data: bytes, tolerance: int = 18, max_fraction: float = 0.25) -> bytes:
    """Remove a flat frame or letterbox that the model sometimes draws around the art.

    Only crops when the border is a single flat colour and the crop keeps most of the image."""
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
    # also shave the thin drawn panel outline that usually sits just inside the margin
    pad = 6
    cropped = img.crop((min(left + pad, w), min(top + pad, h), max(right - pad, 0), max(bottom - pad, 0)))
    out = io.BytesIO()
    cropped.save(out, "PNG")
    return out.getvalue()
