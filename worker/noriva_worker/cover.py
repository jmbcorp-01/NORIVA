"""표지 만들기: 승인한 기획·스토리·인물로 표지 그림 지시를 쓰고, 그림 모델로 세로 3:4 표지 후보를 그려요.

웹소설처럼 작화 그림이 없는 작품도 표지를 갖게 해요. 웹툰도 쓸 수 있어요.
- 제목 글자는 그리지 않아요. 독자 화면이 표지 위에 제목을 얹고, 그림 모델은 한글을 자주 틀려요.
- 돈을 쓴 결과는 바로 저장해요 (CLAUDE.md 1-1): 그림 지시는 쓰자마자, 표지 그림은 한 장 그릴 때마다
  저장소에 올리고 작업 기록(jobs.payload)에 남겨요. 다시 시작하면 남은 장만 그려요.
- 한 장이 안전 필터에 걸리면 그 장만 빼고 계속해요 (1-2). 한 장도 못 그리면 실패로 알려요.
"""

from __future__ import annotations

import uuid
from typing import Any, Callable

from .images import NoImageError
from .scout import ROOT_RULES
from .visual import _STR, StageInputError, _obj

MAX_COUNT = 4
DEFAULT_COUNT = 2

SYSTEM = ROOT_RULES + """
당신은 NORIVA의 표지 아트 디렉터예요. 승인된 기획 자료를 읽고, 그림 모델에 보낼 연재 표지 그림 지시를 영어로 써요.
- 세로 3:4 한 장짜리 표지. 휴대폰 목록에서 작게 보여도 무슨 이야기인지 느껴지게, 주인공 한두 명과 이야기의 핵심 분위기를 한 장면에 담아요.
- 인물은 승인된 인물 자료의 생김새(나이, 머리, 옷, 소품)를 그대로 옮겨요. 시대·복식·배경은 자료와 맞춰요.
- 화면 아래쪽 4분의 1은 비교적 단순하게 둬요 (독자 화면이 그 위에 제목을 얹어요).
- 글자, 제목, 로고, 서명, 워터마크, 말풍선은 넣지 않아요. 지시 끝에 "no text, no letters, no logo, no watermark"를 꼭 넣어요.
- 테두리나 액자 없이 화면 끝까지 채운 그림으로.
- 연령 등급에 맞춰요. 피, 상처, 노출은 그리지 않고 분위기로만 암시해요 (그림 모델의 안전 필터에 걸려요).
- 실제 작품, 작가, 배우의 이름이나 화풍 이름을 쓰지 않아요.
- 그림체: 한국 연재 웹소설 표지처럼 완성도 높은 디지털 일러스트. 웹툰이고 승인된 화풍이 있으면 그 화풍 설명을 따라요.
"""

SCHEMA = _obj({"prompt": _STR, "summary": _STR})


def cover_task(ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    brief = s.get("brief") or {}
    fmt = "웹소설" if (s.get("format") or "webtoon") == "novel" else "웹툰"
    parts = [
        f"작품: {s['title']} ({fmt}) / 장르: {s['genre']} / 연령: {brief.get('ageRating', '')} / 분위기: {brief.get('tone', '')}",
        f"한 줄 소개: {s.get('logline') or ''}",
    ]
    for label, text in ctx["inputs"]:
        parts += ["", f"## 승인된 {label}", text[:12000]]
    if ctx.get("instruction"):
        parts += ["", "## 대표의 요청 (가장 우선)", ctx["instruction"]]
    parts += [
        "",
        "위 자료로 표지 그림 지시를 써 주세요.",
        "- prompt: 그림 모델에 보낼 영어 지시 (150~250 단어)",
        "- summary: 대표에게 보여 줄 한국어 한 문장 (무엇을 그렸는지)",
    ]
    return "\n".join(parts)


def run_cover(
    ctx: dict[str, Any],
    writer: Any,
    images: Any,
    media: Any,
    save: Callable[[dict[str, Any]], None],
    report: Callable[..., None] = lambda *a, **k: None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """표지 후보를 그려요. (결과, 이번에 쓴 비용) — 결과: keys(표지 그림 키), prompt, summary, skipped(빠진 장 수).

    save(payload 일부)는 돈을 쓴 결과를 바로 작업 기록에 남기는 함수예요. 다시 시작하면 ctx['saved']로 돌아와요."""
    if not ctx["inputs"]:
        raise StageInputError("승인한 기획안이 없어요. ① 기획안을 먼저 승인해 주세요.")
    saved = ctx.get("saved") or {}
    count = max(1, min(MAX_COUNT, int(ctx.get("count") or DEFAULT_COUNT)))
    costs: list[dict[str, Any]] = []

    prompt, summary = saved.get("prompt"), saved.get("summary") or ""
    if not prompt:
        report("표지 그림 지시 쓰는 중")
        r = writer.json(SYSTEM, cover_task(ctx), SCHEMA, effort="medium", max_tokens=4000)
        costs.append(r.result.cost_entry())
        prompt = (r.data.get("prompt") or "").strip()
        summary = (r.data.get("summary") or "").strip()
        if not prompt:
            raise StageInputError("표지 그림 지시를 쓰지 못했어요. 요청 문구를 바꿔 다시 해 주세요.")
        if "no text" not in prompt.lower():
            prompt += "\nno text, no letters, no logo, no watermark"
        save({"prompt": prompt, "summary": summary})

    keys: list[str] = list(saved.get("keys") or [])
    skipped = int(saved.get("skipped") or 0)
    model = (ctx["series"].get("brief") or {}).get("imageModel") or None
    sid = ctx["series"]["id"]
    for i in range(len(keys) + skipped, count):
        report("표지 그리는 중", i, count)
        try:
            res = images.generate(prompt, seed=1000 + i * 7919, aspect_ratio="3:4", model=model)
        except NoImageError:
            # 이 장만 빼요. 남은 장은 계속 그려요.
            skipped += 1
            save({"skipped": skipped})
            continue
        costs.append(res.cost_entry())
        key = media.put(f"series/{sid}/cover/ai-{uuid.uuid4().hex[:12]}.png", res.data)
        keys.append(key)
        save({"keys": keys})
    if not keys:
        raise NoImageError("그림 모델이 표지를 그리지 못했어요 (안전 필터). 요청 문구를 바꿔 다시 해 주세요.")
    return {"keys": keys, "prompt": prompt, "summary": summary, "skipped": skipped}, costs
