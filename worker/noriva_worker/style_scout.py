"""④ 화풍 참고작 찾기.

승인한 ① 기획안, ② 스토리, ③ 인물을 읽고 웹 검색으로 분위기·장르·독자층이 맞는 시장 웹툰 5편을 찾아요.
작품마다 공식 페이지 링크, 어울리는 이유, 측정 가능한 화풍 특징(선, 채색, 비율 등)을 정리해요.
대표가 고른 작품의 '특징'만 화풍 후보 쓰기에 들어가고, 작품·작가 이름과 그림은 그림 모델에 가지 않아요.
"""

from __future__ import annotations

from typing import Any

from .scout import ROOT_RULES
from .style import CRITERIA_SCHEMA
from .visual import _STR, _arr, _obj

SYSTEM = ROOT_RULES + """
당신은 NORIVA의 아트 디렉터예요. 우리 작품에 맞는 화풍을 정하기 전에, 시장에서 검증된 웹툰 중 분위기·장르·독자층이 닮은 작품을 찾아요.
- 네이버웹툰, 카카오웹툰, 카카오페이지, 레진, 리디, 네이버 시리즈 등 공식 플랫폼에서 연재 중이거나 완결된 세로 스크롤 컬러 웹툰만 골라요.
- 작품 존재, 플랫폼, 작가, 연재 시기는 검색으로 확인한 것만 써요. 확인 못 한 작품은 넣지 않아요.
- 화풍 특징은 그 작품을 따라 그리기 위한 게 아니라 우리 그림이 넘어야 할 완성도 기준을 정하려는 거예요. 캐릭터 디자인이나 장면은 묘사하지 말고 측정 가능한 특징만 적어요.
- 다섯 작품은 서로 화풍 결이 달라야 대표가 비교해서 고를 수 있어요 (예: 어두운 실사풍, 부드러운 로맨스풍, 선명한 액션풍).
"""


def scout_task(ctx: dict[str, Any]) -> str:
    s = ctx["series"]
    brief = s.get("brief") or {}
    parts = [
        f"작품: {s['title']} / 장르: {s['genre']} / 연령: {brief.get('ageRating', '')} / 톤: {brief.get('tone', '')} / 독자: {brief.get('audience', '')}",
        "",
        "## 뿌리 소재",
        *[f"- {src['name']}: {src['summary']}" for src in ctx["sources"]],
    ]
    for label, text in ctx["inputs"]:
        parts += ["", f"## 승인된 {label}", text[:10000]]
    parts += [
        "",
        "위 작품과 장르·시대 배경·분위기·독자층이 닮은 시장 웹툰 다섯 편을 웹 검색으로 찾아 주세요.",
        "작품마다 공식 연재 페이지 주소, 우리 작품에 어울리는 이유, 화풍 특징(선, 채색, 그림자 단계, 팔레트, 비율, 얼굴, 배경, 연출, 컷 리듬)을 정리해 주세요.",
    ]
    return "\n".join(parts)


WORK = _obj(
    {
        "title": _STR,
        "platform": _STR,
        "author": _STR,
        "url": _STR,
        "why": _STR,
        "traits": CRITERIA_SCHEMA,
    }
)
SCHEMA = _obj({"works": _arr(WORK)})


def _organize_task(research_text: str, links: list[dict[str, str]]) -> str:
    link_lines = "\n".join(f"- {l['title']}: {l['url']}" for l in links[:40])
    return f"""# 과제: 조사 결과를 화풍 참고작 목록으로 정리

## 조사 결과
{research_text[:30000]}

## 조사에서 인용한 링크
{link_lines}

## 출력 형식 (JSON)
- works: 조사에서 확인된 작품 최대 5편. 확인 안 된 작품은 넣지 않는다.
- title: 작품 제목, platform: 연재 플랫폼, author: 작가(글/그림)
- url: 위 링크 중 그 작품의 공식 연재 페이지(없으면 그 작품을 다룬 링크). 위 목록에 없는 주소는 쓰지 않는다.
- why: 우리 작품에 어울리는 이유 한두 문장 (장르, 시대, 분위기, 독자층)
- traits: 측정 가능한 화풍 특징을 짧은 한국어로. 캐릭터 디자인·장면 묘사 금지.
  line(선 굵기·강약·색), coloring(채색 방식), shading_steps(그림자 단계 수, 정수), palette(채도·명도 경향),
  proportions(등신·체형), faces(눈 크기·턱선·생략 정도), backgrounds(배경 밀도·처리), effects(효과선·빛),
  panel_rhythm(컷 크기·여백 리듬), avoid(이 결을 따를 때 우리 그림에서 피할 것)
"""


def run_style_scout(ctx: dict[str, Any], model: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    research = model.research(SYSTEM, scout_task(ctx), max_searches=12)
    organized = model.json(SYSTEM, _organize_task(research.text, research.links), SCHEMA, effort="medium", max_tokens=16000)
    allowed = {l["url"] for l in research.links}
    works = []
    for w in organized.data.get("works", [])[:5]:
        title = (w.get("title") or "").strip()
        if not title:
            continue
        url = (w.get("url") or "").strip()
        works.append(
            {
                "title": title[:100],
                "platform": (w.get("platform") or "").strip()[:50],
                "author": (w.get("author") or "").strip()[:100],
                "url": url if url in allowed else "",
                "why": (w.get("why") or "").strip()[:500],
                "traits": w.get("traits") or {},
            }
        )
    return works, [*research.cost_entries(), organized.result.cost_entry()]
