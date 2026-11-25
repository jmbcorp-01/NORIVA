"""③+ 고증 자료: 그리기 전에 작품에 나오는 것들의 시대 고증을 한 번에 정리해요.

1. 승인된 ①~③을 읽고 옷, 머리 모양, 관모, 무기·도구, 건물, 동물·요괴를 항목으로 나눠
   맞는 생김새(영어, 구조까지 긍정형), 그림 모델이 잘 틀리는 모습(검사용), 실물 사진 검색어를 써요.
2. 항목마다 위키미디어 공용에서 자유 이용 실물 사진을 찾아, 그 시대 실물이 맞는지 확인한 것만 붙여요.
3. 대표가 승인하면 ④ 화풍은 선과 채색만 정하고, 옷·머리·건물은 이 자료의 문구를 그대로 써요.
   ④+ 인물 시트의 소품·의상 시트와 ⑦ 작화, 모든 검사도 같은 자료를 기준으로 봐요.
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import commons
from .images import thumbnail
from .media import Media
from .prompts import render_guidelines, render_task
from .visual import Costs, _arr, _map_progress, _obj, _report

_STR = {"type": "string"}
CATEGORIES = ["attire", "hair", "headwear", "weapon", "tool", "architecture", "creature", "other"]
CATEGORY_KO = {
    "attire": "옷", "hair": "머리 모양", "headwear": "관모·머리 장식", "weapon": "무기", "tool": "도구",
    "architecture": "건물", "creature": "동물·요괴", "other": "기타",
}
PHOTO_CATEGORIES = {"attire", "hair", "headwear", "weapon", "tool", "architecture"}
MAX_ITEMS = 12

RESEARCH_SCHEMA = _obj(
    {
        "era": _STR,
        "items": _arr(
            _obj(
                {
                    "id": _STR,
                    "category": {"type": "string", "enum": CATEGORIES},
                    "name": _STR,
                    "who": _arr(_STR),
                    "description": _STR,
                    "mistakes": _arr(_STR),
                    "search": _arr(_STR),
                    "certainty": {"type": "string", "enum": ["high", "medium", "low"]},
                }
            )
        ),
    }
)

RESEARCH_FORMAT = """
## 출력 형식 (JSON)
그림을 그리기 전에, 이 작품의 그림에 나오는 것들의 시대 고증을 정리한다. 이후 화풍·인물 시트·작화·모든 검사가 이 자료만 따른다.
- era: 작품의 시대와 장소 한 줄(한국어, 예: "통일신라 8세기 초, 동해안 강릉 어촌").
- items: 많아야 12개. 그림 모델이 다른 시대·나라 모양으로 잘못 그리기 쉬운 것부터.
  반드시 넣을 것: 주요 인물 계층별 옷(남자·여자, 신분), 머리 모양, 관모·머리 장식, 주인공의 무기·도구, 자주 나오는 건물, 중요한 동물·요괴.
  - id: 영문 소문자 짧은 id(예: commoner_man_attire, hwandudaedo, fishing_village_house).
  - category: attire, hair, headwear, weapon, tool, architecture, creature, other.
  - name: 한국어 이름. who: 이 모습을 따르는 인물 이름(한국어) 목록, 모두면 ["모든 인물"].
  - description: 이미지 모델에 그대로 넣을 영어 문구 70단어 이내. **맞는 생김새만 긍정형으로, 구조까지** 쓴다.
    옷은 길이, 여밈 방향과 방법, 깃 모양과 깃 가장자리 띠, 소매 폭, 허리띠, 바지·치마, 신발.
    머리는 묶는 위치와 방법, 덮는 것의 모양. 무기는 길이와 비율, 날, 자루, 고리, 칼집. 건물은 지붕 재료와 처마 곡선, 벽, 기단.
    금지할 것의 이름은 여기에 쓰지 않는다(그림 모델이 오히려 떠올린다).
  - mistakes: 그림 모델이 흔히 잘못 그리는 모습(한국어, 예: "코등이 있는 일본도", "조선 후기 고름 달린 저고리"). 검사에서만 쓴다.
  - search: 위키미디어 공용에서 그 시대 실물(유물, 토용, 벽화, 복원품, 남아 있는 건물) 사진을 찾을 검색어 3개. 각각 영어 2~4단어로 짧게.
    예: "Silla clay figurine", "ring pommel sword", "Goguryeo tomb mural". 설화 속 존재처럼 실물이 없으면 빈 목록.
  - certainty: 학계 자료로 확실하면 high, 시대가 가까운 자료로 추정하면 medium, 근거가 약하면 low. low는 그림에서 가리거나 단순하게 그리는 게 낫다.
- 같은 시대 안에서도 다른 이야기(설화, 기록)를 근거로 할 때는 그 근거를 따른다. 지어내지 않는다.
"""

RESEARCH_PHOTO_SCHEMA = _obj(
    {"photos": _arr(_obj({"index": {"type": "integer"}, "matches": {"type": "boolean"}, "real_photo": {"type": "boolean"}, "note": _STR}))}
)

RESEARCH_PHOTO_TASK = """# 과제: 고증 참고 사진 확인

첨부한 그림 {n}장은 아래 고증 항목의 참고 사진 후보다(순서대로 index 0부터). 사진마다 확인하라.
- real_photo: 박물관 유물, 그 시대의 토용·벽화, 박물관의 복원품, 남아 있는 옛 건물의 사진이면 true.
  AI로 만든 그림, 삽화, 게임·드라마 장면, 현대 재현 행사 사진이면 false. 확신이 없으면 false.
- matches: 이 사진이 항목의 생김새를 분명하게 보여 주고 작품의 시대·나라와 맞으면 true. 다른 시대·나라의 물건이면 false.
- note: 대표에게 보여줄 한 문장(예: "고려 시대 칼이라 시대가 달라요").

## 작품 시대
{era}

## 항목
{item}
"""


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (s or "").lower()).strip("_")[:40] or "item"


def research_text(body: dict[str, Any] | None) -> str:
    """다음 단계 지시와 검사에 넣을 짧은 고증 요약 (영어 생김새 문구 중심)."""
    if not body or body.get("kind") != "research":
        return ""
    lines = [f"- 시대: {body.get('era', '')}"]
    for it in body.get("items") or []:
        who = ", ".join(it.get("who") or [])
        lines.append(f"- [{it['id']}] {it.get('name', '')} ({CATEGORY_KO.get(it.get('category', ''), '')}{', ' + who if who else ''}): {it.get('description', '')}")
        if it.get("mistakes"):
            lines.append(f"  잘 틀리는 모습: {', '.join(it['mistakes'])}")
    return "\n".join(lines)


def run_research(ctx: dict[str, Any], llm: Any, media: Media) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    system = render_guidelines(ctx["guidelines"], (ctx.get("series") or {}).get("format") or "webtoon")
    _report(ctx, "시대 고증 정리 중")
    r = llm.json(system, render_task("research", ctx) + RESEARCH_FORMAT, RESEARCH_SCHEMA, effort="high", max_tokens=32000)
    costs.add(r.result.cost_entry())
    era = (r.data.get("era") or "").strip()
    items: list[dict[str, Any]] = []
    for it in (r.data.get("items") or [])[:MAX_ITEMS]:
        if not (it.get("description") or "").strip():
            continue
        iid = _slug(it.get("id", ""))
        while any(x["id"] == iid for x in items):
            iid += "x"
        items.append(
            {
                "id": iid,
                "category": it.get("category") if it.get("category") in CATEGORIES else "other",
                "name": it.get("name", ""),
                "who": [str(x) for x in it.get("who") or []],
                "description": it["description"].strip(),
                "mistakes": [str(x) for x in it.get("mistakes") or [] if str(x).strip()],
                "search": [str(x) for x in it.get("search") or [] if str(x).strip()][:3],
                "certainty": it.get("certainty") or "medium",
                "photos": [],
            }
        )

    base = f"series/{ctx['series']['id']}/research/{ctx['artifact_id']}"

    def find(it: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        log = {"item": it["id"], "queries": it["search"], "candidates": 0, "accepted": 0, "notes": []}
        if it["category"] not in PHOTO_CATEGORIES or not it["search"]:
            return log, local
        cands = []
        for c in commons.search_commons(it["search"], limit=6):
            data = commons.fetch(c["url"])
            if data:
                cands.append((c, thumbnail(data, 1024)))
        log["candidates"] = len(cands)
        if not cands:
            return log, local
        rr = llm.json(
            system,
            RESEARCH_PHOTO_TASK.format(
                n=len(cands), era=era,
                item=json.dumps({k: it[k] for k in ("name", "category", "description")}, ensure_ascii=False),
            ),
            RESEARCH_PHOTO_SCHEMA,
            images=[d for _, d in cands],
            effort="medium",
            max_tokens=16000,
        )
        local.append(rr.result.cost_entry())
        for ph in rr.data.get("photos") or []:
            i = ph.get("index")
            if not isinstance(i, int) or not 0 <= i < len(cands):
                continue
            if ph.get("real_photo") and ph.get("matches") and len(it["photos"]) < 2:
                meta, data = cands[i]
                key = media.put(f"{base}/{it['id']}-{len(it['photos']) + 1}.jpg", data, "image/jpeg")
                it["photos"].append({"image": key, **{k: meta.get(k, "") for k in ("title", "page", "license", "artist")}})
                log["accepted"] += 1
            elif ph.get("note") and len(log["notes"]) < 3:
                log["notes"].append(ph["note"])
        return log, local

    done = _map_progress(ctx, 4, find, items, "실물 사진 찾는 중") if items else []
    search_log = [log for log, _ in done]
    for _, local in done:
        costs.extend(local)

    md = ["# ③+ 고증 자료", "", f"시대: {era}", "", "④ 화풍, ④+ 인물 시트, ⑦ 작화와 모든 검사가 이 자료를 기준으로 그려요.", ""]
    for it in items:
        md += [
            f"## {it['name']} ({it['id']}, {CATEGORY_KO[it['category']]})",
            f"- 누구: {', '.join(it['who']) or '-'}",
            f"- 생김새: {it['description']}",
            f"- 잘 틀리는 모습: {', '.join(it['mistakes']) or '-'}",
            f"- 확실성: {it['certainty']}",
            f"- 실물 사진: {len(it['photos'])}장" + (f" ({'; '.join(p['title'] for p in it['photos'])})" if it["photos"] else ""),
            "",
        ]
    body = {
        "kind": "research",
        "stage": "research",
        "markdown": "\n".join(md),
        "era": era,
        "items": items,
        "search_log": search_log,
        "summary": {"items": len(items), "with_photos": sum(1 for it in items if it["photos"])},
    }
    return body, list(costs)
