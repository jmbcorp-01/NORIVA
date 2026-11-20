"""④+ 인물 시트: 작품 전체가 쓰는 인물 설정화를 그리고, 검사하고, 대표가 승인해요.

1. 승인된 ③ 인물 문서에서 인물마다 외모 명세(영어)를 뽑아 고정해요. ③에 영어 외모 고정 문구가 있으면 그대로 써요.
   시대 고증(무기, 복식, 머리 모양)과 '그리면 안 되는 것'도 인물마다 적어요.
2. 칼처럼 고증이 중요한 소품은 대표가 올린 고증 사진을 보고 소품만 먼저 그려 검사해요(소품 시트).
   글 설명보다 그림이 그림 모델을 훨씬 확실하게 붙잡아요.
3. 인물 시트는 화풍 마스터(선과 채색만)와 그 인물의 소품 시트를 참조로 그려요. 고증 사진은 인물 시트에 넣지 않아요(그림체가 흔들려요).
   그림 지시에는 맞는 모양만 적고, '그리면 안 되는 것'은 검사에서만 써요(금지 단어를 적으면 오히려 그 모양을 떠올려요).
4. 시트는 기본 모습만 담고 기본 모습만 검사해요. 점수는 치명·주요·경미 개수로 일정하게 계산하고, 불합격이면 한 번 더 그려요.
5. 대표가 승인하면 ⑦ 작화가 모든 회차에서 이 명세와 시트를 그대로 써요(작화가 외모를 새로 쓰지 않아요).
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
import re
from typing import Any

from . import commons
from .images import IMAGE_MODELS, ImageGen, thumbnail, trim_border
from .media import Media
from .prompts import render_guidelines, render_task
from .visual import Costs, StageInputError, _arr, _map_progress, _obj, _report, base_for

_STR = {"type": "string"}

SPEC_SCHEMA = _obj(
    {
        "characters": _arr(
            _obj(
                {
                    "id": _STR,
                    "name": _STR,
                    "kind": {"type": "string", "enum": ["person", "animal", "creature"]},
                    "role": {"type": "string", "enum": ["main", "supporting", "minor"]},
                    "appearance": _STR,
                    "period_notes": _STR,
                    "never": _arr(_STR),
                }
            )
        ),
        "props": _arr(
            _obj({"id": _STR, "name": _STR, "owners": _arr(_STR), "description": _STR, "search": _arr(_STR)})
        ),
    }
)

SPEC_TASK = """
## 출력 형식 (JSON)
승인된 인물 문서에 나오는 인물(동물·요괴 포함)마다 작화가 모든 회차에 그대로 쓸 고정 명세를 만든다. 많아야 12명, 주인공부터.
- id: 영문 소문자 짧은 id (예: sunjeong). 이름: 한국어 이름 (영어 표기).
- kind: 사람 person, 동물 animal, 용·요괴 같은 존재 creature. role: main, supporting, minor.
- appearance: 이미지 모델에 넣을 영어 외모 고정 문구 60단어 이내. 인물의 **기본 모습만** 쓴다.
  의상 변형, 특정 회차에만 나오는 상태(부상, 붕대, 변신, 젖은 모습), 회차 번호, '변형' 같은 말은 넣지 않는다(시트에 글자로 그려져요).
  인물 문서의 '영어 외모 고정 문구'가 기본 모습만 담고 있으면 그대로 옮기고, 아니면 기본 모습만 남긴다.
  나이, 얼굴형, 눈, 머리 모양과 색, 체형, 의상(형태·길이·색), 고정 소품, 신발 순서로 구체적인 단어만 쓴다.
- period_notes: 시대 고증을 영어로, **맞는 생김새만** 긍정형으로 쓴다(예: straight single-edged sword with a round ring pommel and a plain grip,
  straight scabbard). 금지할 것의 이름(일본도, 코등이 등)은 여기 쓰지 않고 never에만 쓴다.
- never: 이 인물에 절대 그리면 안 되는 것 영어 목록 (예: curved katana, round tsuba guard, Japanese hakama, Chinese Qing robe, modern clothing).
  검사에서만 쓰고 그림 지시에는 넣지 않는다.
- props: 그림 모델이 흔히 잘못 그리는 시대 소품 중 주요 인물이 늘 지니는 **모양이 단단한 물건**(칼·창·활 같은 무기, 도구, 장신구), 많아야 4개.
  두건·옷·머리 모양처럼 몸에 걸친 것은 소품이 아니라 appearance에 쓴다.
  id(영문 소문자), name(한국어), owners(지니는 인물 id 목록),
  description(영어, 실제 생김새를 긍정형으로 구체적으로: 길이와 비율, 날·자루·고리·장식의 모양과 재질과 색),
  search(위키미디어 공용에서 이 소품의 실제 유물 사진을 찾을 검색어 2~3개, 영어 위주로 유물 이름·시대·박물관 이름. 예: "ring pommel sword Silla", "환두대도", "Gyeongju National Museum sword"). 없으면 빈 목록.
"""

CHECK_SCHEMA = _obj(
    {
        "defects": _arr(
            _obj({"code": _STR, "severity": {"type": "string", "enum": ["critical", "major", "minor"]}, "note": _STR})
        ),
    }
)

CHECK_TASK = """# 과제: 인물 시트 검사

첫 번째 그림이 검사할 인물 시트(설정화)다. {master_note}
이 시트는 작품의 모든 회차에서 이 인물의 기준이 된다. 엄격하게, 그러나 시트가 담는 것만 검사하라.
- 이 시트는 인물의 **기본 모습만** 담는다. 의상 변형, 특정 회차에만 나오는 상태(부상, 붕대, 변신, 회차별 표정 제한),
  시트 한 장에 담을 수 없는 것(다른 의상, 다른 장면, 크기 비교 대상)은 결함으로 적지 않는다. 얼굴 클로즈업 표정은 중립·화남·웃음이면 된다.
- 먼저 명세의 period_notes와 appearance를 항목별로 하나씩 그림과 맞춰 본다(무기 생김새, 머리 모양, 머리 장식, 의상).
- 소품 시트가 함께 있으면 인물이 지닌 소품이 소품 시트와 같은 물건인지 본다. 다르면 치명이다.
- 치명(critical): 명세의 'never'에 있는 것이 보임, 시대·나라가 다른 무기나 복식(일본도, 코등이, 하카마, 기모노, 중국 청나라 옷 등), 글자·워터마크, 얼굴·손 해부학 붕괴.
  칼은 특히 엄격하게 본다: 명세가 코등이 없는 칼인데 손잡이와 칼날 사이에 둥근·네모 코등이가 있음, 일본도식으로 끈을 마름모로 감은 손잡이,
  휜 칼날이나 휜 칼집, 명세에 있는 고리자루(ring pommel)가 없음 — 이 중 하나라도 보이면 치명이다.
  명세와 다른 머리 모양(예: 높이 올린 쪽머리가 명세인데 낮게 묶음)도 이 인물의 기준을 바꾸므로 치명으로 적는다.
- 주요(major): 외모 명세와 다름(머리 모양·색, 의상 형태·길이·색, 고정 소품, 신발, 나이, 체형), 정면·측면·뒷모습이 서로 다른 사람처럼 보임, 고른 화풍과 다름.
- 경미(minor): 그 밖에 고치면 좋은 것.
- 글자, 제목, 라벨, 회차 번호가 그려져 있으면 치명이다. 화풍 마스터의 장식(떠다니는 조각, 반짝임)을 옮겨 그린 것은 주요다.
code에는 규칙 코드를 적는다(외모 불일치 K-1, 고증 H-1~H-8, 화풍 V-7, AI 결함 AI-xx). 같은 문제는 한 번만 적는다.

## 인물
{spec}
{note}"""

SHEET_PASS = 80
# 점수는 결함 개수로 계산해요: 치명 하나면 불합격, 주요 둘까지는 합격선(80)
WEIGHT = {"critical": 30, "major": 10, "minor": 3}


def score_of(defects: list[dict[str, Any]]) -> int:
    return max(0, 100 - sum(WEIGHT.get(d.get("severity", "minor"), 3) for d in defects))


PROP_CHECK_TASK = """# 과제: 소품 시트 검사

첫 번째 그림이 검사할 소품 시트다. {photo_note}
이 소품은 작품의 모든 회차에서 이 모양 그대로 그려진다. 실제 유물의 생김새와 같은지 엄격하게 본다.
- 치명(critical): 사진·설명과 다른 모양(예: 사진에 없는 코등이, 휜 칼날, 다른 손잡이 감기 방식, 고리자루 없음), 다른 시대·나라의 물건으로 보임, 글자·라벨.
- 주요(major): 비율·길이·장식·재질·색이 사진이나 설명과 다름, 칼집과 뽑은 칼이 서로 다른 물건처럼 보임.
- 경미(minor): 그 밖에 고치면 좋은 것.
code는 H-6(무기), H-7(관모·장신구), AI-xx(그림 결함) 등.

## 소품
{spec}
"""
FIX_BATCH = 3  # 명세 고치기를 한 번에 넣는 인물 수

MASTER_SCHEMA = _obj(
    {"violations": _arr(_obj({"item": _STR, "character_ids": _arr(_STR), "note": _STR}))}
)

MASTER_TASK = """# 과제: 화풍 마스터의 소품 검사

첨부한 그림은 이 작품의 화풍 마스터다. 인물 시트를 그릴 때 선과 채색의 기준으로 참고 그림에 넣는다.
그런데 그림 모델은 참고 그림의 칼·옷·머리 모양까지 따라 그린다. 마스터에 아래 인물들의 '그리면 안 되는 것'이나
시대·나라가 다른 무기·복식(일본도와 코등이, 하카마, 기모노, 변발 등)이 보이면 모두 적어라.
- item: 보이는 것(한국어), character_ids: 그 소품을 따라 그리면 안 되는 인물 id, note: 어디에 어떻게 보이는지 한 문장.
- 없으면 빈 목록.

## 인물
{specs}
"""

PHOTO_SCHEMA = _obj(
    {"photos": _arr(_obj({"index": {"type": "integer"}, "prop_ids": _arr(_STR), "real_photo": {"type": "boolean"}, "note": _STR}))}
)

PHOTO_TASK = """# 과제: 고증 참고 사진 확인

첨부한 그림 {n}장은 대표가 올린 고증 참고 사진이다(순서대로 index 0부터). 사진마다 확인하라.
- prop_ids: 이 사진이 아래 소품 중 어느 것의 실제 생김새를 보여 주는지(없으면 빈 목록).
- real_photo: 박물관·유물·실물 사진이면 true. AI로 만든 그림(구석의 별·반짝임 표시, 깨진 글자, 비현실적인 구조, 사진 같지만 고증과 맞지 않는 모양)이거나
  삽화·게임 그림이면 false. 확신이 없으면 false.
- note: 대표에게 보여줄 한 문장(예: "오른쪽 아래에 AI 생성 표시가 있고 칼날이 휘어 있어요").

## 소품
{props}
"""

CLEAN_PROMPT = (
    "Edit reference image 1. Remove these things completely: {items}. "
    "Also remove every floating particle, glowing shard, sparkle, ribbon effect and decorative effect. "
    "Where a weapon or prop is removed, show plain empty hands and a plain belt. "
    "Keep everything else exactly the same: the character's face, body, pose, clothing, line weight, coloring, shading and background. "
    "Do not add any text."
)

FIX_SCHEMA = _obj(
    {
        "updates": _arr(
            _obj({"id": _STR, "appearance": _STR, "period_notes": _STR, "never": _arr(_STR), "edit": _STR})
        ),
        "rules": _arr(_STR),
    }
)

FIX_TASK = """# 과제: ④+ 인물 시트 — 대표 지시를 고정 명세에 반영

대표가 아래 인물을 다시 그리라며 지시를 남겼다. 지시 하나에 여러 인물 이야기가 섞여 있을 수 있다. 인물마다 자기에게 해당하는 부분만 반영한다.
- appearance, period_notes, never: 지시를 반영한 새 명세(영어). 지시와 관계없는 부분은 글자 그대로 둔다. appearance는 70단어 이내.
  ⑦ 작화는 appearance와 never만 보므로, 지시가 무기·소품·머리 모양을 말하면 appearance에도 그 생김새를 구체적으로 적는다.
  지시가 없애라고 한 것(예: 코등이, 휜 칼, 두건 끈)은 never에 영어로 더한다.
- edit: 이전 시트 그림에서 바꿀 것만 적은 영어 편집 지시 한두 문장
  (예: Replace the sword with a straight single-edged Silla ring-pommel sword (hwandu daedo): no guard at all, plain grip, round ring at the pommel end, straight plain scabbard.).
  이 인물에 해당하는 지시가 없으면 빈 문자열.
- rules: 이 지시를 이 작품의 모든 회차가 지켜야 할 규칙으로 바꾼 한국어 문장 목록. 인물 이름과 구체적인 생김새를 넣는다
  (예: "순정의 칼은 코등이 없는 곧은 외날 환두대도로, 손잡이 끝에 둥근 고리가 있다."). 구도처럼 이번 그림에만 해당하는 지시는 빼고, 없으면 빈 목록.

## 대표 지시
{instruction}

## 지난 검사에서 걸린 문제
명세가 맞는데 그림이 틀린 문제는 명세를 바꾸지 말고 edit에 고칠 것을 적는다. 명세가 모호해서 생긴 문제는 명세를 구체적으로 고친다.
{issues}

## 다시 그릴 인물의 현재 명세
{specs}
"""


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_-]", "", (s or "").lower()) or "c"


NO_TEXT = (
    "Do not write any text anywhere in the image: no title, no names, no view labels, no captions, no numbers, no watermark. "
    "No floating particles, sparkles, shards, leaves or decorative effects."
)


def _prop_refs_text(props: list[dict[str, Any]], start: int) -> list[str]:
    return [
        f"Reference image {start + i} is the approved prop design for {p['name']} ({p['description']}): "
        "wherever this object appears, draw exactly this object with the same shape, fittings and colors."
        for i, p in enumerate(props)
    ]


def _sheet_prompt(base: str, style: str, c: dict[str, Any], n_masters: int, props: list[dict[str, Any]], note: str) -> str:
    refs = []
    if n_masters:
        refs.append(
            f"Reference image(s) 1-{n_masters} are this series' approved style masters: match their line weight, coloring and finish only. "
            "Do not copy their characters, weapons, props, costumes, hairstyles or decorative effects."
        )
    refs += _prop_refs_text(props, n_masters + 1)
    parts = [
        base,
        f"Character design turnaround sheet for a Korean webtoon. {c['name']}: {c['appearance']}",
        "Front view, side view and back view side by side, full body, same outfit in all three views, "
        "plus three head close-ups (neutral, angry, smiling)." if c.get("kind", "person") == "person"
        else "Full body front, side and back views plus one head close-up.",
        f"Era-accurate details: {c['period_notes']}" if c.get("period_notes") else "",
        *refs,
        f"Style: {style}",
        "Pure flat white background with no texture.",
        NO_TEXT,
        f"Director's note: {note}" if note else "",
    ]
    return " ".join(p for p in parts if p)


def _prop_prompt(base: str, style: str, p: dict[str, Any], n_photos: int) -> str:
    sword = any(w in (p.get("description", "") + p.get("id", "")).lower() for w in ("sword", "blade", "daedo", "dagger", "knife", "spear"))
    parts = [
        base,
        f"Prop design sheet for a Korean webtoon: {p['name']}. {p['description']}",
        "Show the object alone, large and centered, in a clean side view. "
        + ("Draw it twice side by side: sheathed, and drawn with the blade fully visible next to its scabbard. Add one close-up of the grip and pommel."
           if sword else "Add one close-up of its most distinctive detail."),
        f"Reference image(s) 1-{n_photos} are museum photos of the real object of this era: copy its exact shape, proportions, fittings, "
        "ornaments and materials; ignore the glass case, stand, background and lighting, and redraw it cleanly in the style below." if n_photos else "",
        f"Style: {style}",
        "Pure flat white background with no texture.",
        NO_TEXT,
    ]
    return " ".join(x for x in parts if x)


def _edit_prompt(c: dict[str, Any], edit: str, props: list[dict[str, Any]]) -> str:
    """이전 시트에서 고칠 곳만 바꾸는 편집 지시. 얼굴·옷·구도는 그대로 두고 지시한 것만 바꿔요."""
    parts = [
        "Edit reference image 1, a character design turnaround sheet for a Korean webtoon.",
        "Keep the same character, face, body, poses, layout, outfit colors and drawing style exactly as they are.",
        f"Change only this: {edit}",
        "Apply the change consistently in every view (front, side, back) and in the close-ups where it is visible.",
        *_prop_refs_text(props, 2),
        f"Character spec: {c['appearance']}",
        f"Era-accurate details: {c['period_notes']}" if c.get("period_notes") else "",
        "Pure flat white background with no texture.",
        NO_TEXT,
    ]
    return " ".join(p for p in parts if p)


def _issue_lines(defects: list[dict[str, Any]]) -> str:
    return "; ".join(f"{d.get('code', '')} {d.get('note', '')}".strip() for d in defects if d.get("severity") in ("critical", "major"))


def _issues(chars: list[dict[str, Any]]) -> str:
    """지난 검사에서 걸린 치명·주요 문제를 인물별로 모아요. 다시 그릴 때 대표가 일일이 적지 않아도 고치게 해요."""
    out = []
    for c in chars:
        lines = [f"  - [{d['severity']}] {d.get('code', '')} {d.get('note', '')}" for d in c.get("defects") or [] if d.get("severity") in ("critical", "major")]
        if lines:
            out.append(f"- {c['id']} ({c.get('name', '')}):\n" + "\n".join(lines))
    return "\n".join(out)


def _spec_json(c: dict[str, Any]) -> str:
    keys = ("id", "name", "kind", "appearance", "period_notes", "never")
    return json.dumps({k: c.get(k) for k in keys}, ensure_ascii=False)


def run_sheets(ctx: dict[str, Any], llm: Any, images: ImageGen, media: Media) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    system = render_guidelines(ctx["guidelines"])
    brief = (ctx.get("series") or {}).get("brief") or {}
    model = brief.get("imageModel") if brief.get("imageModel") in IMAGE_MODELS else None
    payload = ctx.get("payload") or {}
    instruction = ctx.get("instruction") or ""
    prev = ctx.get("previous_body") or {}
    only = [str(x) for x in payload.get("chars") or []]

    style_body = (ctx.get("input_bodies") or {}).get("style") or {}
    chosen = style_body.get("chosen")
    cands = style_body.get("candidates") or []
    if not (isinstance(chosen, int) and 0 <= chosen < len(cands)):
        raise StageInputError("④ 화풍에서 후보를 골라 승인해야 인물 시트를 그릴 수 있어요.")
    style = cands[chosen]["style_prompt"]
    medium = cands[chosen].get("medium")
    base = base_for(medium)
    masters = [m for m in (media.get(k) for k in (style_body.get("style_masters") or [])[:2]) if m]
    history = [h for h in (media.get_private(k) for k in (brief.get("historyRefs") or [])[:3]) if h]
    history = [thumbnail(h, 1280) for h in history]

    # 1. 고정 명세: 고른 인물만 다시 그릴 때는 이전 명세를 쓰고, 대표 지시가 있으면 그 인물 명세에 반영해요
    #    (반영하지 않으면 ⑦ 작화가 예전 명세로 다시 그려요)
    edits: dict[str, str] = {}
    rule_suggestions: list[str] = []
    props: list[dict[str, Any]] = []
    if only and prev.get("kind") == "sheets":
        chars = [dict(c) for c in prev["characters"]]
        props = [dict(p) for p in prev.get("props") or []]
        targets = [c for c in chars if c["id"] in only]
        if (instruction or _issues(targets)) and targets:
            _report(ctx, "지시와 지난 검사 결과를 인물 명세에 반영하는 중")
            # 인물이 많으면 한 번에 넣을 때 답이 길어져 잘려요. 3명씩 나눠 동시에 처리해요.
            groups = [targets[i : i + FIX_BATCH] for i in range(0, len(targets), FIX_BATCH)]

            def fix(group: list[dict[str, Any]]) -> dict[str, Any]:
                r = llm.json(
                    system,
                    FIX_TASK.format(
                        instruction=instruction or "(없음)",
                        issues=_issues(group) or "(없음)",
                        specs="\n".join(_spec_json(c) for c in group),
                    ),
                    FIX_SCHEMA,
                    effort="medium",
                    max_tokens=32000,
                )
                costs.add(r.result.cost_entry())
                return r.data

            with ThreadPoolExecutor(max_workers=4) as pool:
                answers = list(pool.map(fix, groups))
            rules: list[str] = []
            for data in answers:
                rules += [x.strip() for x in data.get("rules") or [] if x and x.strip()]
                for u in data.get("updates") or []:
                    c = next((x for x in targets if x["id"] == _slug(u.get("id", ""))), None)
                    if not c:
                        continue
                    for k in ("appearance", "period_notes"):
                        if (u.get(k) or "").strip():
                            c[k] = u[k].strip()
                    if u.get("never"):
                        c["never"] = list(dict.fromkeys([*(c.get("never") or []), *u["never"]]))
                    if (u.get("edit") or "").strip():
                        edits[c["id"]] = u["edit"].strip()
            rule_suggestions = list(dict.fromkeys(rules))[:8]
    else:
        only = []
        _report(ctx, "인물 외모 명세 고정하는 중")
        task = render_task("characters", ctx).replace("# 과제: ③ 인물", "# 과제: ④+ 인물 시트 — 외모 명세 고정") + SPEC_TASK
        if instruction:
            task += f"\n\n## 대표의 추가 지시 (가장 우선)\n{instruction}"
        r = llm.json(system, task, SPEC_SCHEMA, effort="medium", max_tokens=32000)
        costs.add(r.result.cost_entry())
        chars = r.data["characters"][:12]
        seen: set[str] = set()
        for c in chars:
            cid = _slug(c["id"])
            while cid in seen:
                cid += "x"
            seen.add(cid)
            c["id"] = cid
        props = []
        for p in (r.data.get("props") or [])[:4]:
            owners = [_slug(o) for o in p.get("owners") or [] if _slug(o) in seen]
            if owners and (p.get("description") or "").strip():
                props.append({"id": _slug(p.get("id", "")), "name": p.get("name", ""), "owners": owners,
                              "description": p["description"].strip(), "search": [str(x) for x in p.get("search") or []][:3]})

    out_base = f"series/{ctx['series']['id']}/sheets/{ctx['artifact_id']}"
    todo = [c for c in chars if not only or c["id"] in only]

    # 2. 화풍 마스터에 금지 소품(일본도 등)이나 장식 효과가 있으면, 마스터에서 그것만 지운 '깨끗한 마스터'를 만들어 모든 인물에 써요.
    #    지우고도 남아 있으면 그 소품과 엮인 인물만 마스터를 빼요.
    master_warnings: list[dict[str, Any]] = []
    no_master: set[str] = set()
    clean_keys: list[str] = list(prev.get("clean_masters") or []) if only else []
    ids = {c["id"] for c in todo}

    def screen(imgs: list[bytes]) -> list[dict[str, Any]]:
        r = llm.json(
            system,
            MASTER_TASK.format(specs="\n".join(_spec_json(c) for c in todo)),
            MASTER_SCHEMA,
            images=[thumbnail(m, 1024) for m in imgs],
            effort="medium",
            max_tokens=16000,
        )
        costs.add(r.result.cost_entry())
        return [
            {"item": v.get("item", ""), "note": v.get("note", ""), "characters": [_slug(x) for x in v.get("character_ids") or [] if _slug(x) in ids]}
            for v in r.data.get("violations") or []
        ]

    if clean_keys and all(media.get(k) for k in clean_keys):
        masters = [m for m in (media.get(k) for k in clean_keys) if m]
    elif masters and any(c.get("never") for c in todo):
        _report(ctx, "화풍 마스터의 소품 검사 중")
        found = screen(masters)
        if found:
            _report(ctx, "화풍 마스터에서 금지 소품과 장식 지우는 중")
            items = "; ".join(v["item"] for v in found)
            cleaned = []
            for i, m in enumerate(masters):
                img = images.generate(CLEAN_PROMPT.format(items=items), seed=3 + i, aspect_ratio="3:4", references=[m], model=model)
                costs.add(img.cost_entry())
                data = trim_border(img.data)
                clean_keys.append(media.put(f"{out_base}/master-clean-{i + 1}.png", data))
                cleaned.append(data)
            masters = cleaned
            found = screen(masters)
        for v in found:
            master_warnings.append(v)
            no_master.update(v["characters"])
    def ok(x: dict[str, Any]) -> bool:
        return x["score"] >= SHEET_PASS and not any(d["severity"] == "critical" for d in x["defects"])

    # 3. 소품 시트: 고증 사진을 보고 소품만 먼저 그려요. 다시 그리기에서는 그 인물의 소품 중 불합격이었던 것만 다시 그려요.
    todo_ids = {c["id"] for c in todo}
    prop_todo = [p for p in props if (not only or (set(p["owners"]) & todo_ids and not p.get("passed")))]
    # 고증 사진마다 어떤 소품의 사진인지, 실제 사진인지 먼저 봐요. AI 그림이나 관계없는 사진은 쓰지 않아요.
    photo_notes: list[dict[str, Any]] = []
    photos_for: dict[str, list[bytes]] = {}
    if history and prop_todo:
        _report(ctx, "고증 사진 확인 중")
        r = llm.json(
            system,
            PHOTO_TASK.format(n=len(history), props="\n".join(json.dumps({k: p.get(k) for k in ("id", "name", "description")}, ensure_ascii=False) for p in prop_todo)),
            PHOTO_SCHEMA,
            images=[thumbnail(h, 1024) for h in history],
            effort="medium",
            max_tokens=16000,
        )
        costs.add(r.result.cost_entry())
        for ph in r.data.get("photos") or []:
            i = ph.get("index")
            if not isinstance(i, int) or not 0 <= i < len(history):
                continue
            used = [_slug(x) for x in ph.get("prop_ids") or []] if ph.get("real_photo") else []
            photo_notes.append({"index": i, "real_photo": bool(ph.get("real_photo")), "props": used, "note": ph.get("note", "")})
            for pid in used:
                photos_for.setdefault(pid, []).append(history[i])

    # 맞는 실물 사진이 없는 소품은 위키미디어 공용에서 자유 이용 사진을 찾아, 검사를 통과한 것만 써요
    found_photos: list[dict[str, Any]] = []
    for p in prop_todo:
        if photos_for.get(p["id"]):
            continue
        queries = p.get("search") or [p["name"], p["description"].split(",")[0]]
        _report(ctx, f"{p['name']} 실물 사진 찾는 중")
        cands = []
        for c in commons.search_commons(queries, limit=6):
            data = commons.fetch(c["url"])
            if data:
                cands.append((c, thumbnail(data, 1024)))
        if not cands:
            continue
        r = llm.json(
            system,
            PHOTO_TASK.format(n=len(cands), props=json.dumps({k: p.get(k) for k in ("id", "name", "description")}, ensure_ascii=False)),
            PHOTO_SCHEMA,
            images=[d for _, d in cands],
            effort="medium",
            max_tokens=16000,
        )
        costs.add(r.result.cost_entry())
        for ph in r.data.get("photos") or []:
            i = ph.get("index")
            if not isinstance(i, int) or not 0 <= i < len(cands):
                continue
            if ph.get("real_photo") and p["id"] in [_slug(x) for x in ph.get("prop_ids") or []] and len(photos_for.get(p["id"], [])) < 2:
                meta, data = cands[i]
                photos_for.setdefault(p["id"], []).append(data)
                key = media.put(f"{out_base}/ref-{p['id']}-{len(photos_for[p['id']])}.jpg", data, "image/jpeg")
                found_photos.append({"prop": p["id"], "image": key, **{k: meta[k] for k in ("title", "page", "license", "artist")}})

    def draw_prop(p: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        tries: list[dict[str, Any]] = []
        refs = photos_for.get(p["id"], [])[:3]
        photos = [thumbnail(h, 1024) for h in refs]
        for k in range(3):
            prompt = _prop_prompt(base, style, p, len(refs))
            if tries:
                fix = _issue_lines(tries[-1]["defects"])
                prompt += f" Fix these problems found in the previous attempt: {fix}" if fix else ""
            img = images.generate(prompt, seed=7 + k + 10 * (ctx.get("attempt") or 1), aspect_ratio="4:3", references=refs or None, model=model)
            local.append(img.cost_entry())
            data = trim_border(img.data)
            key = media.put(f"{out_base}/prop-{p['id']}-{k + 1}.png", data)
            r = llm.json(
                system,
                PROP_CHECK_TASK.format(
                    photo_note=f"두 번째부터 {len(photos)}장은 대표가 올린 실제 유물 사진이다. 모양은 이 사진을 기준으로 본다." if photos else "",
                    spec=json.dumps({k2: p.get(k2) for k2 in ("id", "name", "description")}, ensure_ascii=False),
                ),
                CHECK_SCHEMA,
                images=[thumbnail(data)] + photos,
                effort="medium",
                max_tokens=16000,
            )
            local.append(r.result.cost_entry())
            tries.append({"image": key, "defects": r.data["defects"], "score": score_of(r.data["defects"])})
            if ok(tries[-1]):
                break
        best = max(tries, key=lambda t: (ok(t), t["score"]))
        return {**p, "image": best["image"], "score": best["score"], "defects": best["defects"], "passed": ok(best)}, local

    if prop_todo:
        done = _map_progress(ctx, 4, draw_prop, prop_todo, "소품 시트 그리는 중")
        new_props = {p["id"]: p for p, _ in done}
        for _, local in done:
            costs.extend(local)
        props = [new_props.get(p["id"], p) for p in props]
    # 검사를 통과한 소품 시트만 인물 시트의 참고 그림으로 써요. 틀린 소품을 넣으면 인물도 같이 틀려요.
    prop_imgs = {p["id"]: thumbnail(img, 1024) for p in props if p.get("passed") and p.get("image") and (img := media.get(p["image"]))}

    def props_of(c: dict[str, Any]) -> list[dict[str, Any]]:
        return [p for p in props if c["id"] in p["owners"] and p["id"] in prop_imgs][:2]

    def check(c: dict[str, Any], data: bytes, local: list[dict[str, Any]]) -> dict[str, Any]:
        mine = props_of(c)
        notes = []
        if masters:
            notes.append(f"두 번째부터 {len(masters)}장은 고른 화풍 마스터다. 선과 채색이 이 화풍과 같은지 본다(마스터의 인물·소품·장식은 기준이 아니다).")
        if mine:
            a = len(masters) + 2
            notes.append(f"{a}번째부터 {len(mine)}장은 승인 전 검사를 통과한 소품 시트({', '.join(p['name'] for p in mine)})다.")
        r = llm.json(
            system,
            CHECK_TASK.format(
                master_note=" ".join(notes),
                spec=_spec_json(c),
                note=f"\n## 대표의 지시 (이것도 지켰는지 본다)\n{instruction}\n" if only and instruction else "",
            ),
            CHECK_SCHEMA,
            images=[thumbnail(data)] + [thumbnail(m, 640) for m in masters] + [thumbnail(prop_imgs[p["id"]], 640) for p in mine],
            effort="medium",
            max_tokens=16000,
        )
        local.append(r.result.cost_entry())
        defects = r.data["defects"]
        return {"score": score_of(defects), "defects": defects}

    def draw(c: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        note = instruction if only else ""
        mine = props_of(c)
        n_masters = 0 if c["id"] in no_master else len(masters)
        refs = masters[:n_masters] + [prop_imgs[p["id"]] for p in mine]
        tries: list[dict[str, Any]] = []
        # 대표가 고칠 곳을 지시했으면 첫 번째는 이전 시트를 그대로 두고 그 부분만 고쳐요. 두 번째는 새 명세로 새로 그려요.
        old = media.get(c["sheet"]) if edits.get(c["id"]) and c.get("sheet") else None
        for k in range(3 if c.get("role") == "main" else 2):
            seed = 1 + k + 10 * (ctx.get("attempt") or 1)
            if k == 0 and old:
                img = images.generate(_edit_prompt(c, edits[c["id"]], mine), seed=seed, aspect_ratio="4:3", references=[old, *[prop_imgs[p["id"]] for p in mine]], model=model)
            else:
                # 앞 시도에서 걸린 치명·주요 문제를 이번 그림 지시에 넣어요
                fix = _issue_lines(tries[-1]["defects"]) if tries else ""
                prompt = _sheet_prompt(base, style, c, n_masters, mine, note)
                if fix:
                    prompt += f" Fix these problems found in the previous attempt: {fix}"
                img = images.generate(prompt, seed=seed, aspect_ratio="4:3", references=refs or None, model=model)
            local.append(img.cost_entry())
            data = trim_border(img.data)
            key = media.put(f"{out_base}/{c['id']}-{k + 1}.png", data)
            tries.append({"image": key, **check(c, data, local)})
            if ok(tries[-1]):
                break
        best = max(tries, key=lambda t: (ok(t), t["score"]))
        return {
            **c,
            "sheet": best["image"],
            "score": best["score"],
            "defects": best["defects"],
            "passed": ok(best),
            "candidates": [{"image": t["image"], "score": t["score"]} for t in tries],
        }, local

    results = _map_progress(ctx, 4, draw, todo, "인물 시트 그리는 중")
    drawn = {c["id"]: c for c, _ in results}
    for _, local in results:
        costs.extend(local)
    final = [drawn.get(c["id"], c) for c in chars]

    md = ["# ④+ 인물 시트", "", "⑦ 작화는 모든 회차에서 아래 외모 명세와 시트를 그대로 써요.", ""]
    for c in final:
        md += [
            f"## {c['name']} ({c['id']}, {c.get('kind', 'person')})",
            f"- 외모: {c['appearance']}",
            f"- 고증: {c.get('period_notes', '')}",
            f"- 금지: {', '.join(c.get('never') or []) or '없음'}",
            f"- 검사: {c.get('score', '-')}점",
            "",
        ]
    for p in props:
        md += [f"## 소품: {p['name']} ({p['id']})", f"- 지니는 인물: {', '.join(p['owners'])}", f"- 생김새: {p['description']}", f"- 검사: {p.get('score', '-')}점", ""]
    body = {
        "kind": "sheets",
        "stage": "sheets",
        "markdown": "\n".join(md),
        "characters": final,
        "style_prompt": style,
        "medium": medium,
        "model": model,
        "redrawn": [c["id"] for c in todo] if only else [],
        "rule_suggestions": rule_suggestions,
        "master_warnings": master_warnings,
        "props": props,
        "clean_masters": clean_keys,
        "photo_notes": photo_notes,
        "found_photos": found_photos,
        "summary": {"characters": len(final), "passed": sum(1 for c in final if c.get("passed")),
                    "props": len(props), "props_passed": sum(1 for p in props if p.get("passed"))},
    }
    return body, list(costs)
