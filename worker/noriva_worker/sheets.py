"""④+ 인물 시트: 작품 전체가 쓰는 인물 설정화를 그리고, 검사하고, 대표가 승인해요.

1. 승인된 ③ 인물 문서에서 인물마다 외모 명세(영어)를 뽑아 고정해요. ③에 영어 외모 고정 문구가 있으면 그대로 써요.
   시대 고증(무기, 복식, 머리 모양)과 '그리면 안 되는 것'도 인물마다 적어요.
2. 화풍 마스터와 대표가 올린 고증 참고 그림을 참조로 시트를 그려요.
3. 시트를 명세·고증·화풍 기준으로 검사하고, 불합격이면 한 번 더 그려 점수가 높은 쪽을 남겨요.
4. 대표가 승인하면 ⑦ 작화가 모든 회차에서 이 명세와 시트를 그대로 써요(작화가 외모를 새로 쓰지 않아요).
"""

from __future__ import annotations

import json
import re
from typing import Any

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
        )
    }
)

SPEC_TASK = """
## 출력 형식 (JSON)
승인된 인물 문서에 나오는 인물(동물·요괴 포함)마다 작화가 모든 회차에 그대로 쓸 고정 명세를 만든다. 많아야 12명, 주인공부터.
- id: 영문 소문자 짧은 id (예: sunjeong). 이름: 한국어 이름 (영어 표기).
- kind: 사람 person, 동물 animal, 용·요괴 같은 존재 creature. role: main, supporting, minor.
- appearance: 이미지 모델에 넣을 영어 외모 고정 문구 60단어 이내. 인물 문서에 '영어 외모 고정 문구'가 있으면 그 문장을 고치지 말고 그대로 옮긴다.
  없으면 나이, 얼굴형, 눈, 머리 모양과 색, 체형, 의상(형태·길이·색), 고정 소품, 신발 순서로 구체적인 단어만 쓴다.
- period_notes: 시대 고증을 영어로 구체적으로. 작품의 시대와 신분에 맞는 의상의 형태, 머리 모양, 무기·소품의 실제 생김새
  (예: 신라 무사라면 straight single-edged ring-pommel sword (hwandu daedo), no guard 같은 식).
- never: 이 인물에 절대 그리면 안 되는 것 영어 목록 (예: curved katana, round tsuba guard, Japanese hakama, Chinese Qing robe, modern clothing).
"""

CHECK_SCHEMA = _obj(
    {
        "score": {"type": "integer"},
        "defects": _arr(
            _obj({"code": _STR, "severity": {"type": "string", "enum": ["critical", "major", "minor"]}, "note": _STR})
        ),
    }
)

CHECK_TASK = """# 과제: 인물 시트 검사

첫 번째 그림이 검사할 인물 시트(설정화)다. {master_note}
이 시트는 작품의 모든 회차에서 이 인물의 기준이 된다. 엄격하게 검사하라.
먼저 명세의 period_notes와 appearance를 항목별로 하나씩 그림과 맞춰 본다(무기 생김새, 머리 모양, 머리 장식, 의상).
- 치명(critical): 명세의 'never'에 있는 것이 보임, 시대·나라가 다른 무기나 복식(일본도, 코등이, 하카마, 기모노, 중국 청나라 옷 등), 글자·워터마크, 얼굴·손 해부학 붕괴.
  칼은 특히 엄격하게 본다: 명세가 코등이 없는 칼인데 손잡이와 칼날 사이에 둥근·네모 코등이가 있음, 일본도식으로 끈을 마름모로 감은 손잡이,
  휜 칼날이나 휜 칼집, 명세에 있는 고리자루(ring pommel)가 없음 — 이 중 하나라도 보이면 치명이다.
  명세와 다른 머리 모양(예: 높이 올린 쪽머리가 명세인데 낮게 묶음)도 이 인물의 기준을 바꾸므로 치명으로 적는다.
- 주요(major): 외모 명세와 다름(머리 모양·색, 의상 형태·길이·색, 고정 소품, 신발, 나이, 체형), 정면·측면·뒷모습이 서로 다른 사람처럼 보임, 고른 화풍과 다름.
- 경미(minor): 그 밖에 고치면 좋은 것.
code에는 규칙 코드를 적는다(외모 불일치 K-1, 고증 H-1·GA-3, 화풍 V-7, AI 결함 AI-xx).
score는 0~100. 이 시트를 30화 동안 그대로 써도 될 때만 80 이상.

## 인물
{spec}
{note}"""

SHEET_PASS = 80

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

## 다시 그릴 인물의 현재 명세
{specs}
"""


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_-]", "", (s or "").lower()) or "c"


def _sheet_prompt(base: str, style: str, c: dict[str, Any], n_masters: int, n_history: int, note: str) -> str:
    refs = []
    if n_masters:
        refs.append(
            f"Reference image(s) 1-{n_masters} are this series' approved style masters: match their line, coloring and finish only. "
            "Do not copy their characters, weapons, props, costumes or hairstyles."
        )
    if n_history:
        a = n_masters + 1
        refs.append(
            f"Reference image(s) {a}-{n_masters + n_history} are historical references for costume, hairstyle and weapons of this era: "
            "follow their real shapes, not their drawing style."
        )
    never = ", ".join(c.get("never") or [])
    parts = [
        base,
        f"Character design turnaround sheet for a Korean webtoon. {c['name']}: {c['appearance']}",
        "Front view, side view and back view side by side, full body, same outfit in all three views, "
        "plus three head close-ups (neutral, angry, smiling)." if c.get("kind", "person") == "person"
        else "Full body front, side and back views plus one head close-up.",
        f"Era-accurate details: {c['period_notes']}" if c.get("period_notes") else "",
        f"Must not include: {never}." if never else "",
        *refs,
        f"Style: {style}",
        "Pure flat white background with no texture. No text, labels or watermark.",
        f"Director's note: {note}" if note else "",
    ]
    return " ".join(p for p in parts if p)


def _edit_prompt(c: dict[str, Any], edit: str, n_history: int) -> str:
    """이전 시트에서 고칠 곳만 바꾸는 편집 지시. 얼굴·옷·구도는 그대로 두고 지시한 것만 바꿔요."""
    never = ", ".join(c.get("never") or [])
    parts = [
        "Edit reference image 1, a character design turnaround sheet for a Korean webtoon.",
        "Keep the same character, face, body, poses, layout, outfit colors and drawing style exactly as they are.",
        f"Change only this: {edit}",
        "Apply the change consistently in every view (front, side, back) and in the close-ups where it is visible.",
        f"Reference image(s) 2-{1 + n_history} are historical references: follow their real shapes, not their drawing style." if n_history else "",
        f"Character spec: {c['appearance']}",
        f"Era-accurate details: {c['period_notes']}" if c.get("period_notes") else "",
        f"Must not include: {never}." if never else "",
        "Pure flat white background with no texture. No text, labels or watermark.",
    ]
    return " ".join(p for p in parts if p)


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
    if only and prev.get("kind") == "sheets":
        chars = [dict(c) for c in prev["characters"]]
        targets = [c for c in chars if c["id"] in only]
        if instruction and targets:
            _report(ctx, "대표 지시를 인물 명세에 반영하는 중")
            r = llm.json(
                system,
                FIX_TASK.format(instruction=instruction, specs="\n".join(_spec_json(c) for c in targets)),
                FIX_SCHEMA,
                effort="medium",
                max_tokens=8000,
            )
            costs.add(r.result.cost_entry())
            rule_suggestions = [x.strip() for x in r.data.get("rules") or [] if x and x.strip()][:6]
            for u in r.data.get("updates") or []:
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
    else:
        only = []
        _report(ctx, "인물 외모 명세 고정하는 중")
        task = render_task("characters", ctx).replace("# 과제: ③ 인물", "# 과제: ④+ 인물 시트 — 외모 명세 고정") + SPEC_TASK
        if instruction:
            task += f"\n\n## 대표의 추가 지시 (가장 우선)\n{instruction}"
        r = llm.json(system, task, SPEC_SCHEMA, effort="medium", max_tokens=16000)
        costs.add(r.result.cost_entry())
        chars = r.data["characters"][:12]
        seen: set[str] = set()
        for c in chars:
            cid = _slug(c["id"])
            while cid in seen:
                cid += "x"
            seen.add(cid)
            c["id"] = cid

    out_base = f"series/{ctx['series']['id']}/sheets/{ctx['artifact_id']}"
    master_note = (
        f"두 번째부터 {len(masters)}장은 고른 화풍 마스터다. 선과 채색이 이 화풍과 같은지도 본다."
        if masters
        else ""
    )
    if history:
        a = len(masters) + 2
        master_note += (
            f" {a}번째부터 {len(history)}장은 대표가 올린 고증 참고 사진이다. "
            "시트의 무기·의상·머리 모양이 이 사진의 실제 생김새와 같은지 본다(그림체는 보지 않는다). 생김새가 다르면 치명이다."
        )
    check_refs = [thumbnail(m, 640) for m in masters] + [thumbnail(h, 640) for h in history]

    def check(c: dict[str, Any], data: bytes, local: list[dict[str, Any]]) -> dict[str, Any]:
        r = llm.json(
            system,
            CHECK_TASK.format(
                master_note=master_note,
                spec=_spec_json(c),
                note=f"\n## 대표의 지시 (이것도 지켰는지 본다)\n{instruction}\n" if only and instruction else "",
            ),
            CHECK_SCHEMA,
            images=[thumbnail(data)] + check_refs,
            effort="medium",
            max_tokens=8000,
        )
        local.append(r.result.cost_entry())
        d = r.data
        return {"score": max(0, min(100, int(d["score"]))), "defects": d["defects"]}

    def ok(x: dict[str, Any]) -> bool:
        return x["score"] >= SHEET_PASS and not any(d["severity"] == "critical" for d in x["defects"])

    def draw(c: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        note = instruction if only else ""
        prompt = _sheet_prompt(base, style, c, len(masters), len(history), note)
        tries: list[dict[str, Any]] = []
        # 대표가 고칠 곳을 지시했으면 첫 번째는 이전 시트를 그대로 두고 그 부분만 고쳐요. 두 번째는 새 명세로 새로 그려요.
        old = media.get(c["sheet"]) if edits.get(c["id"]) and c.get("sheet") else None
        for k in range(2):
            seed = 1 + k + 10 * (ctx.get("attempt") or 1)
            if k == 0 and old:
                img = images.generate(_edit_prompt(c, edits[c["id"]], len(history)), seed=seed, aspect_ratio="4:3", references=[old, *history], model=model)
            else:
                img = images.generate(prompt, seed=seed, aspect_ratio="4:3", references=(masters + history) or None, model=model)
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

    todo = [c for c in chars if not only or c["id"] in only]
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
        "summary": {"characters": len(final), "passed": sum(1 for c in final if c.get("passed"))},
    }
    return body, list(costs)
