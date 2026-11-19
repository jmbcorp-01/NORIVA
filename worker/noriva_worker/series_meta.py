"""연재 설정(독자 화면 정보) 채우기.

승인한 ① 기획안, ② 스토리, ③ 인물과 뿌리 소재를 읽고 제목, 한 줄 소개, 뿌리 노트를 한국어·영어로 써요.
대표가 이미 적은 칸은 덮지 않아요 (저장할 때 빈 칸만 채움).
"""

from __future__ import annotations

from typing import Any

from .scout import ROOT_RULES
from .visual import _STR, _obj

SYSTEM = ROOT_RULES + """
당신은 NORIVA의 연재 편집자예요. 승인된 기획 자료를 읽고 독자 화면에 보일 작품 정보를 써요.
- 제목: 기획안에서 대표가 고른 안의 제목을 그대로 써요. 기획안이 여러 개 남아 있으면 스토리·인물과 맞는 안의 제목을 써요. 새로 지어내지 않아요.
- 영어 제목: 한국어 제목을 직역하지 말고 영어권 독자가 바로 이해하고 끌릴 제목으로 (기획안에 영어 제목이 있으면 그것을 써요).
- 한 줄 소개: 스포일러 없이 첫 화를 보고 싶게 만드는 한두 문장. 한국어 80자, 영어 160자 안팎.
- 뿌리 노트: 작품이 어떤 한국 설화·역사·민속에서 왔는지 두세 문장. 원전과 재해석한 부분을 구분해요 (R-4).
- 영어 문장은 번역투가 아닌 자연스러운 영어로, 한국 고유어는 로마자 표기 후 짧게 풀어요.
"""

SCHEMA = _obj(
    {
        "title": _STR,
        "titleEn": _STR,
        "logline": _STR,
        "loglineEn": _STR,
        "rootNote": _STR,
        "rootNoteEn": _STR,
    }
)


def meta_task(ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    parts = [
        f"작품: {s['title']} / 장르: {s['genre']} / 연령: {(s.get('brief') or {}).get('ageRating', '')}",
        "",
        "## 뿌리 소재",
        *[f"- {src['name']}: {src['summary']}" for src in ctx["sources"]],
    ]
    for label, text in ctx["inputs"]:
        parts += ["", f"## 승인된 {label}", text[:12000]]
    parts += ["", "위 자료로 연재 설정 여섯 칸을 써 주세요."]
    return "\n".join(parts)


def run_series_meta(ctx: dict[str, Any], model: Any) -> tuple[dict[str, str], list[dict[str, Any]]]:
    r = model.json(SYSTEM, meta_task(ctx), SCHEMA, effort="medium", max_tokens=8000)
    d = r.data
    limits = {"title": 100, "titleEn": 150, "logline": 400, "loglineEn": 600, "rootNote": 800, "rootNoteEn": 1200}
    values = {k: (d.get(k) or "").strip()[:n] for k, n in limits.items()}
    return values, [r.result.cost_entry()]


# ── 회차 제목·요약 (승인된 스토리의 회차 요약에서) ──

EPISODE_SYSTEM = """\
당신은 NORIVA의 연재 편집자예요. 승인된 스토리 문서에서 지정한 회차의 정보를 찾아 옮겨요.
- 제목: 스토리의 회차 요약에 그 회차 제목이 있으면 그대로 써요. 없으면 회차 요약을 바탕으로 스포일러 없는 짧은 제목(15자 안팎)을 지어요.
- 영어 제목: 직역하지 말고 영어권 독자에게 자연스러운 짧은 제목으로 써요.
- 한 줄 요약: 스토리의 그 회차 한 줄 요약을 그대로 옮겨요 (대본 에이전트가 이 방향으로 써요).
- 스토리에 그 회차가 없으면(요약 범위를 넘음) 세 칸을 모두 빈 문자열로 두세요.
"""

EPISODE_SCHEMA = _obj({"title": _STR, "titleEn": _STR, "logline": _STR})


def run_episode_meta(ctx: dict[str, Any], model: Any) -> tuple[dict[str, str], list[dict[str, Any]]]:
    task = f"작품: {ctx['series_title']}\n찾을 회차: {ctx['number']}화\n\n## 승인된 스토리\n{ctx['story'][:30000]}"
    r = model.json(EPISODE_SYSTEM, task, EPISODE_SCHEMA, effort="low", max_tokens=2000)
    d = r.data
    values = {"title": (d.get("title") or "").strip()[:100], "titleEn": (d.get("titleEn") or "").strip()[:150], "logline": (d.get("logline") or "").strip()[:500]}
    return values, [r.result.cost_entry()]
