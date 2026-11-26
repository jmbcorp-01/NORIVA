"""AI 표지 만들기 (웹툰·웹소설 공통).

승인한 ① 기획안, ② 스토리, ③ 인물(웹툰이면 ④ 화풍과 주인공 시트도)을 읽고 표지 그림 지시를 쓴 뒤,
그림 모델로 세로 3:4 표지 후보를 몇 장 그려요. 제목 글자는 그림에 넣지 않아요 (독자 화면이 제목을 얹어요).

돈을 쓴 결과는 바로 저장해요 (CLAUDE.md 1-1): 그림 지시를 쓰면 바로, 그림 한 장마다 바로 작품에 저장하고,
같은 작업을 다시 시작하면 저장된 지시와 그림을 그대로 쓰고 남은 장만 그려요.
"""

from __future__ import annotations

import io
from typing import Any, Callable

from .images import NoImageError
from .scout import ROOT_RULES
from .visual import _STR, _obj

COVER_COUNT = 2  # 대표가 1·2·4장 중 골라요 (기본 2장)

SYSTEM = ROOT_RULES + """
당신은 NORIVA의 표지 아트 디렉터예요. 승인된 기획 자료를 읽고, 그림 모델에게 줄 표지 그림 지시를 영어로 써요.

표지 원칙:
- 세로 3:4 한 장. 작품 목록에서 작게 보여도 한눈에 장르와 분위기가 읽혀야 해요.
- 주인공(또는 주인공과 핵심 상대)이 중심. 얼굴과 눈빛, 손짓으로 이야기의 갈등을 암시해요. 스포일러는 피해요.
- 뿌리(설화·역사·민속)를 보여 주는 소품·장소·상징을 하나 넣어요. 고증을 지키고 일본·중국 요소와 섞지 않아요 (R-5).
  한복은 저고리와 치마/바지, 갓·족두리 등 한국 복식. 기와, 단청, 민화 문양은 한국 것으로.
- 그림 안에 글자, 제목, 로고, 서명, 워터마크를 절대 넣지 않아요. 아래쪽 1/4은 땅·물·그림자처럼 차분하고 어둡게 두어 제목을 얹을 자리를 남겨요 (독자 화면이 표지 아래쪽에 제목을 얹어요). 얼굴은 위쪽 절반 안에 둬요.
- AI 그림 티를 피해요: 과한 광택과 플라스틱 피부, 대칭 구도, 의미 없는 빛 번짐, 손가락 오류, 뭉개진 배경 글자.
  한국 상업 웹소설·웹툰 표지처럼 또렷한 선과 계획된 색 조합(주조색 2~3개)으로.
- 연령 등급에 맞게: 피, 노출, 잔혹한 장면은 그리지 않아요. 공포는 분위기와 그림자로.
- 화풍: 웹툰 작품이고 승인된 화풍이 있으면 그 화풍을 따르고, 웹소설이면 한국 웹소설 표지풍 디지털 일러스트(반실사, 섬세한 채색)로 해요.

출력:
- prompt: 영어 그림 지시 (120~220단어). 인물의 외모·옷·자세·표정, 배경, 조명, 색, 구도, 화풍, 그리고 마지막에
  "No text, no letters, no title, no logo, no watermark." 를 꼭 넣어요.
- idea: 대표에게 보여 줄 한국어 한두 문장 설명 (무엇을 그렸고 왜 그렇게 했는지).
"""

SCHEMA = _obj({"prompt": _STR, "idea": _STR})


def cover_task(ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    fmt = "웹소설" if s.get("format") == "novel" else "웹툰"
    parts = [
        f"작품: {s['title']} / 형식: {fmt} / 장르: {s['genre']} / 연령: {(s.get('brief') or {}).get('ageRating', '')}",
        "",
        "## 뿌리 소재",
        *[f"- {src['name']}: {src['summary']}" for src in ctx["sources"]],
    ]
    for label, text in ctx["inputs"]:
        parts += ["", f"## 승인된 {label}", text[:10000]]
    if ctx.get("has_reference"):
        parts += ["", "주인공 인물 시트 그림을 참고 그림으로 함께 보내요. 얼굴·머리·옷을 시트와 같게 그리라고 지시에 적어 주세요."]
    if ctx.get("direction"):
        parts += ["", "## 대표의 요청 (꼭 반영)", ctx["direction"][:1000]]
    parts += ["", "위 자료로 표지 그림 지시를 써 주세요."]
    return "\n".join(parts)


def to_jpeg(data: bytes, max_side: int = 1600, quality: int = 88) -> bytes:
    """표지는 목록에서 많이 불러와서 가볍게 저장해요."""
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return data
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def run_cover(
    ctx: dict[str, Any],
    writer: Any,
    image: Any,
    media: Any,
    saved: dict[str, Any],
    save: Callable[[dict[str, Any]], None],
    count: int = COVER_COUNT,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """표지 후보를 그려요. saved는 이 작업이 전에 저장해 둔 것 (다시 시작하면 이어서 해요)."""
    state = {"prompt": saved.get("prompt") or "", "idea": saved.get("idea") or "", "images": list(saved.get("images") or [])}
    costs: list[dict[str, Any]] = []
    if not state["prompt"]:
        r = writer.json(SYSTEM, cover_task(ctx), SCHEMA, effort="medium", max_tokens=6000)
        state["prompt"] = (r.data.get("prompt") or "").strip()
        state["idea"] = (r.data.get("idea") or "").strip()[:600]
        costs.append(r.result.cost_entry())
        if not state["prompt"]:
            raise NoImageError("표지 그림 지시를 쓰지 못했어요. 다시 시도해 주세요.")
        save(state)
    refs = [ctx["reference"]] if ctx.get("reference") else None
    seed0 = int(ctx.get("seed") or 0)
    failed = 0
    for i in range(len(state["images"]), count):
        try:
            res = image.generate(state["prompt"], seed=seed0 + 101 * i, references=refs, aspect_ratio="3:4")
        except NoImageError:
            # 한 장이 안 나오면 그 장만 빼요 (1-2). 모두 안 나오면 아래에서 멈춰요.
            failed += 1
            continue
        costs.append(res.cost_entry())
        key = f"series/{ctx['series']['id']}/cover/ai-{ctx['job_id'][:8]}-{i + 1}.jpg"
        media.put(key, to_jpeg(res.data), "image/jpeg")
        state["images"].append(key)
        save(state)
    if not state["images"]:
        raise NoImageError("표지 그림이 한 장도 나오지 않았어요. 요청 문구를 바꿔 다시 해 보세요 (안전 필터에 걸렸을 수 있어요).")
    state["failed"] = failed
    return state, costs
