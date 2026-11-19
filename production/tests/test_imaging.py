import io

from PIL import Image, ImageDraw

from noriva.imaging import trim_border


def _png(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_trims_flat_white_margin():
    img = Image.new("RGB", (400, 500), "white")
    ImageDraw.Draw(img).rectangle((40, 50, 360, 450), fill=(30, 40, 90))
    out = Image.open(io.BytesIO(trim_border(_png(img))))
    assert out.size[0] < 330 and out.size[1] < 410


def test_leaves_full_bleed_art_alone():
    img = Image.new("RGB", (400, 500), (30, 40, 90))
    ImageDraw.Draw(img).rectangle((0, 0, 200, 500), fill=(200, 100, 50))
    data = _png(img)
    assert trim_border(data) == data


def test_ignores_non_images():
    assert trim_border(b"not an image") == b"not an image"
