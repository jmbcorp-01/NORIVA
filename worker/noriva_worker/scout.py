"""소재 발굴 에이전트와 소재 자동 채우기.

두 단계로 나눠요.
1) 조사: 웹 검색을 켜고 지금의 웹툰 시장과 한국 설화·역사·민속을 살펴 근거 링크가 달린 조사 글을 써요.
2) 정리: 조사 글을 정해진 JSON 모양(시장 리포트 + 소재 후보)으로 옮겨요.
   구조화 출력은 인용과 함께 쓸 수 없어서 검색은 1단계에서만 해요.
"""

from __future__ import annotations

from typing import Any, Protocol

from .llm import JSONResult, ResearchResult
from .visual import _INT, _STR, _arr, _obj

CATEGORIES = ["folktale", "history_event", "history_person", "folk_belief", "creature", "place", "custom"]
CATEGORY_KO = {
    "folktale": "설화·신화",
    "history_event": "역사 사건",
    "history_person": "역사 인물",
    "folk_belief": "민속 신앙",
    "creature": "요괴·신",
    "place": "장소",
    "custom": "풍속",
}


class ScoutModel(Protocol):
    def research(self, system: str, task: str, max_searches: int = 15, max_rounds: int = 6) -> ResearchResult: ...

    def json(self, system: str, task: str, schema: dict[str, Any], images: list[bytes] | None = None, effort: str | None = None, max_tokens: int = 32000) -> JSONResult: ...


ROOT_RULES = """\
NORIVA는 한국의 역사·설화·민속에 뿌리를 둔 웹툰을 한국어와 영어로 연재하는 플랫폼이에요. 대표 한 명이 AI 에이전트와 함께 만들어요.
소재를 고를 때 지키는 뿌리 원칙:
- R-1 모든 작품은 한국의 설화, 역사 사건·인물, 민속 신앙, 요괴·신, 장소, 풍속 중 하나 이상에 뿌리를 둬요.
- R-2 뿌리는 장식이 아니라 이야기의 엔진이에요. 뿌리를 빼면 이야기가 무너져야 해요.
- R-3 원전을 그대로 옮기지 않고 재해석해요 (현대 이식, 이면 비틀기, 역사의 빈칸).
- R-4 고증을 지키고, 실존 인물의 명예를 훼손하거나 실제 비극(전쟁, 학살, 재난)의 피해자를 오락으로 소비하지 않아요.
- R-5 일본·중국 요소와 섞지 않아요 (구미호는 이나리가 아니고, 신당 문은 도리이가 아니며, 한복은 기모노·한푸와 달라요).
- R-6 유명 기존 작품과 겹치는 설정은 피해요 (예: 저승차사 재판 구조는 신과함께, 구미호 로맨스는 구미호뎐, 도깨비 신부는 도깨비, 조선 좀비는 킹덤).
"""

SCOUT_SYSTEM = ROOT_RULES + """
당신은 NORIVA의 소재 발굴 담당이에요. 웹 검색으로 지금 한국과 해외 웹툰 시장의 흐름을 확인하고,
그 흐름에 맞으면서 아직 많이 쓰이지 않은 한국 소재를 찾아요.
- 시장 주장(인기 장르, 흥행작, 플랫폼 동향)은 검색으로 확인한 것만 쓰고 출처를 인용해요. 추측은 추측이라고 밝혀요.
- 소재의 원전과 고증은 한국민족문화대백과, 한국구비문학대계, 조선왕조실록, 국립민속박물관 같은 믿을 만한 출처를 우선해요.
- 해외 독자가 처음 봐도 끌릴 만한지(글로벌 매력)를 따로 판단해요.
"""

FILL_SYSTEM = ROOT_RULES + """
당신은 NORIVA 소재 라이브러리 정리 담당이에요. 소재 이름을 받으면 웹 검색으로 원전과 고증 자료를 찾아 항목을 채워요.
믿을 만한 출처(한국민족문화대백과, 한국구비문학대계, 조선왕조실록, 국립민속박물관 등)를 우선 인용하고, 판본 차이나 틀리기 쉬운 점은 고증 메모에 적어요.
"""


def _candidate_schema() -> dict[str, Any]:
    return _obj(
        {
            "name": _STR,
            "category": {"type": "string", "enum": CATEGORIES},
            "era": _STR,
            "summary": _STR,
            "rules": _arr(_STR),
            "visualNotes": _STR,
            "references": _arr(_STR),
            "caution": _STR,
            "overlapWorks": _arr(_STR),
            "whyNow": _STR,
            "evidence": _arr(_obj({"claim": _STR, "url": _STR})),
            "similarHits": _arr(_STR),
            "difference": _STR,
            "loglines": _arr(_STR),
            "combo": _STR,
            "genre": _STR,
            "globalAppeal": _INT,
            "score": _INT,
            "factCheck": _arr(_STR),
        }
    )


SCOUT_SCHEMA = _obj(
    {
        "report": _obj(
            {
                "summary": _STR,
                "trends": _arr(_obj({"title": _STR, "detail": _STR, "region": {"type": "string", "enum": ["kr", "global", "both"]}})),
                "hits": _arr(_obj({"title": _STR, "platform": _STR, "why": _STR})),
                "changes": _STR,
                "links": _arr(_obj({"title": _STR, "url": _STR})),
            }
        ),
        "candidates": _arr(_candidate_schema()),
    }
)

FILL_SCHEMA = _obj(
    {
        "category": {"type": "string", "enum": CATEGORIES},
        "era": _STR,
        "summary": _STR,
        "rules": _arr(_STR),
        "visualNotes": _STR,
        "references": _arr(_STR),
        "caution": _STR,
        "overlapWorks": _arr(_STR),
    }
)


def _lines(items: list[str], empty: str = "(없음)") -> str:
    return "\n".join(f"- {x}" for x in items) if items else empty


def scout_task(ctx: dict[str, Any]) -> str:
    focus = (ctx.get("focus") or "").strip()
    dismissed = [f"{d['name']}: {d['reason'] or '이유 없음'}" for d in ctx.get("dismissed", [])]
    parts = [
        "지금 웹툰 시장을 조사하고 NORIVA가 다룰 만한 한국 소재 후보를 찾아 주세요.",
        "",
        "## 조사할 것",
        "1. 최근 3~6개월 한국 웹툰 시장 (네이버웹툰, 카카오페이지, 리디 등): 뜨는 장르, 흥행작, 독자 반응",
        "2. 해외 웹툰 시장 (WEBTOON 영어판, Tapas, Tappytoon, 넷플릭스 등 영상화): 한국 소재·K-오컬트·K-역사물 반응",
        "3. 위 흐름과 잘 맞으면서 아직 덜 쓰인 한국 설화·역사·민속 소재. 유명 작품이 이미 쓴 소재는 겹치는 점을 확인해요.",
        "",
        "## 이미 있는 것 (겹치지 않게)",
        "소재 라이브러리:",
        _lines(ctx.get("existing_sources", [])),
        "진행 중인 작품:",
        _lines(ctx.get("series_titles", [])),
        "",
        "## 대표의 취향 (지난 후보 중 넘긴 것과 이유: 비슷한 후보는 피해요)",
        _lines(dismissed),
        "대표가 채택한 후보:",
        _lines(ctx.get("adopted", [])),
    ]
    if ctx.get("last_summary"):
        parts += ["", "## 지난 리포트 요약 (바뀐 점을 짚어 주세요)", ctx["last_summary"]]
    if focus:
        parts += ["", "## 이번 조사의 초점 (대표가 지정)", focus]
    parts += [
        "",
        f"## 쓸 것\n시장 요약, 흐름, 흥행작, 지난번 대비 바뀐 점, 그리고 소재 후보 {ctx.get('count', 8)}개 안팎.",
        "후보마다: 소재 이름과 분류, 시대, 요약, 이야기 장치로 쓸 규칙, 시각 요소, 원전, 고증 메모, 겹치는 유명 작품,",
        "왜 지금인가(근거가 된 검색 결과), 비슷한 흥행작과 차별점, 로그라인 2~3개, 어울리는 장르,",
        "조합 아이디어(예: 도깨비 × 근대 경성 × 로맨스 판타지), 해외 독자 매력, R-4·R-5에 걸릴 수 있는 점.",
    ]
    return "\n".join(parts)


def _organize_task(research: ResearchResult, count: int) -> str:
    links = "\n".join(f"- {l['title']}: {l['url']}" for l in research.links) or "(인용 링크 없음)"
    return f"""\
아래 조사 글을 시장 리포트와 소재 후보 목록으로 정리해 주세요. 조사 글에 없는 사실을 새로 만들지 마세요.

규칙:
- 후보는 {count}개 안팎. 서로 다른 분류와 시대가 섞이게 해요.
- evidence의 url과 report.links의 url은 아래 "인용된 링크"에 있는 주소만 써요. 맞는 링크가 없으면 evidence를 비워요.
- loglines는 2~3개, 한 문장씩.
- globalAppeal은 해외 독자 매력 0~100, score는 NORIVA에 맞는 정도(시장 흐름, 뿌리 원칙, 차별성) 0~100이에요.
- factCheck에는 R-4(실존 인물 명예, 실제 비극 소비)나 R-5(일본·중국 요소 혼동)에 걸릴 수 있는 점과 확인할 고증을 적어요. 없으면 비워요.
- combo는 "소재 × 시대·배경 × 장르" 꼴의 조합 한 줄이에요.
- report.changes는 지난 리포트 대비 바뀐 점이에요. 지난 리포트가 없으면 "첫 리포트"라고 써요.

## 인용된 링크
{links}

## 조사 글
{research.text}
"""


def _int(v: Any, lo: int = 0, hi: int = 100) -> int:
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return lo


def clean_candidate(c: dict[str, Any], allowed_urls: set[str]) -> dict[str, Any]:
    """모델이 만든 후보를 저장할 모양으로 다듬어요. 인용되지 않은 링크는 근거에서 빼요."""
    evidence = [e for e in c.get("evidence", []) if e.get("url") in allowed_urls]
    return {
        "name": (c.get("name") or "").strip()[:120],
        "category": c.get("category") if c.get("category") in CATEGORIES else "folktale",
        "era": c.get("era", ""),
        "summary": c.get("summary", ""),
        "rules": [r for r in c.get("rules", []) if r][:12],
        "visualNotes": c.get("visualNotes", ""),
        "references": [r for r in c.get("references", []) if r][:12],
        "caution": c.get("caution", ""),
        "overlapWorks": [r for r in c.get("overlapWorks", []) if r][:12],
        "whyNow": c.get("whyNow", ""),
        "evidence": evidence[:8],
        "similarHits": [r for r in c.get("similarHits", []) if r][:8],
        "difference": c.get("difference", ""),
        "loglines": [r for r in c.get("loglines", []) if r][:3],
        "combo": c.get("combo", ""),
        "genre": c.get("genre", ""),
        "globalAppeal": _int(c.get("globalAppeal")),
        "score": _int(c.get("score")),
        "factCheck": [r for r in c.get("factCheck", []) if r][:8],
    }


def run_scout(ctx: dict[str, Any], model: ScoutModel) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """(시장 리포트, 후보 목록, 비용 기록)을 돌려줘요."""
    count = int(ctx.get("count", 8))
    research = model.research(SCOUT_SYSTEM, scout_task(ctx), max_searches=int(ctx.get("max_searches", 15)))
    organized = model.json(SCOUT_SYSTEM, _organize_task(research, count), SCOUT_SCHEMA, effort="medium")
    allowed = {l["url"] for l in research.links}
    data = organized.data
    rep = data.get("report", {})
    known = {n.strip().lower() for n in ctx.get("existing_sources", [])}
    candidates = []
    for c in data.get("candidates", []):
        cc = clean_candidate(c, allowed)
        if cc["name"] and cc["name"].lower() not in known:
            candidates.append(cc)
    candidates.sort(key=lambda c: c["score"], reverse=True)
    # 리포트 링크는 실제로 인용된 것만, 모델이 빠뜨린 인용도 채워 넣어요
    links = [l for l in rep.get("links", []) if l.get("url") in allowed]
    seen = {l["url"] for l in links}
    links += [l for l in research.links if l["url"] not in seen]
    report = {
        "summary": rep.get("summary", ""),
        "trends": rep.get("trends", [])[:10],
        "hits": rep.get("hits", [])[:10],
        "changes": rep.get("changes", ""),
        "links": links[:30],
    }
    return report, candidates[: count + 2], [*research.cost_entries(), organized.result.cost_entry()]


def fill_task(source: dict[str, Any]) -> str:
    known = {
        "분류": CATEGORY_KO.get(source.get("category") or "", ""),
        "시대": source.get("era") or "",
        "요약": source.get("summary") or "",
        "핵심 규칙": ", ".join(source.get("rules") or []),
        "시각 요소": source.get("visual_notes") or "",
        "원전": ", ".join(source.get("references") or []),
        "고증 메모": source.get("caution") or "",
        "겹침 주의": ", ".join(source.get("overlap_works") or []),
    }
    filled = "\n".join(f"- {k}: {v}" for k, v in known.items() if v) or "(이름만 있어요)"
    return f"""\
소재 라이브러리 항목 "{source['name']}"을 조사해 빈 칸을 채워 주세요.

이미 적힌 내용 (이 내용과 어긋나지 않게):
{filled}

조사할 것: 원전과 판본, 시대, 다섯 줄 안팎 요약, 이야기 장치로 쓸 수 있는 규칙(금기, 대가, 조건),
작화에 참고할 시각 요소(복식, 소품, 장소, 색), 틀리기 쉬운 고증과 R-4·R-5 주의점, 이 소재를 이미 쓴 유명 작품.
"""


def run_source_fill(source: dict[str, Any], model: ScoutModel) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """소재 하나를 조사해 칸별 값을 돌려줘요. 어떤 칸을 덮을지는 저장할 때 정해요(빈 칸만)."""
    research = model.research(FILL_SYSTEM, fill_task(source), max_searches=6)
    links = "\n".join(f"- {l['title']}: {l['url']}" for l in research.links) or "(인용 링크 없음)"
    organized = model.json(
        FILL_SYSTEM,
        f"아래 조사 글을 소재 라이브러리 항목으로 정리해 주세요. 원전(references)에는 문헌 이름과, 있으면 인용된 링크 주소를 함께 적어요.\n\n## 인용된 링크\n{links}\n\n## 조사 글\n{research.text}",
        FILL_SCHEMA,
        effort="medium",
    )
    d = organized.data
    values = {
        "category": d.get("category") if d.get("category") in CATEGORIES else None,
        "era": d.get("era", ""),
        "summary": d.get("summary", ""),
        "rules": [r for r in d.get("rules", []) if r][:12],
        "visual_notes": d.get("visualNotes", ""),
        "references": [r for r in d.get("references", []) if r][:12],
        "caution": d.get("caution", ""),
        "overlap_works": [r for r in d.get("overlapWorks", []) if r][:12],
    }
    return values, [*research.cost_entries(), organized.result.cost_entry()]
