"""⑦ 작화, ⑧ 말풍선, ⑨ 검수 단계.

시제품(production/)의 그림 생성, 테두리 정리, 컷 품질검사, 말풍선 배치를 스튜디오 흐름에 맞게 옮겼어요.
- 입력은 스튜디오에서 승인한 콘티·화풍·인물(마크다운)이에요. 먼저 컷 목록(JSON)으로 정리한 뒤 그려요.
- 글자는 그림에 굽지 않고 레이어 데이터로 저장해요. 한국어와 영어가 같은 말풍선 위치를 써요.
- 모든 호출 비용은 cost 항목 목록으로 돌려줘서 제작비 원장에 쌓여요.
"""

from __future__ import annotations

import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

from .images import ImageGen, thumbnail, trim_border
from .llm import JSONResult
from .media import Media
from .prompts import render_guidelines


class JSONModel(Protocol):
    def json(self, system: str, task: str, schema: dict[str, Any], images: list[bytes] | None = None, effort: str | None = None, max_tokens: int = 32000) -> JSONResult: ...


@dataclass(frozen=True)
class ArtSettings:
    candidates: int = 2  # 컷마다 그려 볼 후보 수 (04번: 2~4장)
    pass_score: int = 80
    max_panels: int = 60
    parallel: int = 4
    check_effort: str = "medium"


class StageInputError(Exception):
    """앞 단계 결과가 이 단계에 맞지 않아요 (예: 작화 결과가 아닌 것을 말풍선 단계에 넣음)."""


# ── 공용 ─────────────────────────────────────────────────────────────


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_STR = {"type": "string"}
_INT = {"type": "integer"}
_NUM = {"type": "number"}
_BOOL = {"type": "boolean"}


def _arr(item: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": item}


def _clip(v: Any, lo: float = 0.0, hi: float = 100.0) -> float:
    try:
        return round(max(lo, min(hi, float(v))), 1)
    except (TypeError, ValueError):
        return lo


class Costs(list):
    def add(self, entry: dict[str, Any]) -> None:
        self.append(entry)


# ── ⑦ 작화 ───────────────────────────────────────────────────────────

PLAN_SCHEMA = _obj(
    {
        "style_prompt": _STR,
        "characters": _arr(_obj({"id": _STR, "name": _STR, "appearance": _STR})),
        "panels": _arr(
            _obj(
                {
                    "index": _INT,
                    "shot": _STR,
                    "height": {"type": "string", "enum": ["short", "normal", "long"]},
                    "gap_before": {"type": "string", "enum": ["none", "normal", "long"]},
                    "description": _STR,
                    "character_ids": _arr(_STR),
                    "dialogue": _arr(_obj({"speaker": _STR, "text": _STR})),
                    "sfx": _STR,
                    "avoid": _STR,
                }
            )
        ),
    }
)

PLAN_TASK = """# 과제: ⑦ 작화 준비 — 승인된 콘티를 컷 목록으로 정리

아래 승인된 콘티, 화풍 카드, 인물 설정을 그림 모델이 그대로 그릴 수 있는 컷 목록으로 바꿔라.
- panels: 콘티의 컷 순서를 지킨다. index는 1부터. 최대 {max_panels}컷.
- description: 영어로, 대본 없이도 그릴 수 있게 구체적으로(장소, 시대 고증, 조명, 구도, 자세, 표정). 글자나 말풍선은 쓰지 않는다.
- character_ids: 그 컷에 실제로 보이는 인물만.
- dialogue: 콘티의 한국어 대사를 고치지 말고 그대로. speaker는 인물 id, 내레이션은 "narration".
- sfx: 한국어 효과음, 없으면 빈 문자열. avoid: 이 컷에 보이면 안 되는 것(영어), 없으면 빈 문자열.
- characters: 등장하는 인물마다 짧은 id(영문 소문자)와 이름, 모든 컷에 똑같이 쓸 영어 외모 명세(나이, 얼굴, 머리, 옷, 고정 소품).
- style_prompt: 화풍 카드를 영어 한 단락으로(선, 채색, 명암, 팔레트, 질감). 특정 작가 이름은 쓰지 않는다.
"""

CHECK_SCHEMA = _obj(
    {
        "score": _INT,
        "people_count": _INT,
        "defects": _arr(
            _obj({"code": _STR, "severity": {"type": "string", "enum": ["critical", "major", "minor"]}, "note": _STR})
        ),
    }
)

CHECK_TASK = """# 과제: 컷 그림 자동 결함 검사

첨부한 그림 한 장을 이 컷의 지시와 지침의 AI-01~AI-14, 한국 고증 규칙으로 검사하라.
- 치명(critical): 글자·가짜 글자·워터마크, 인물 수가 틀림, 손·얼굴 해부학 붕괴, 일본·중국식 요소(도리이 등), 기존 작품과 닮음.
- 주요(major): 인물 외모가 명세와 다름, 화풍 이탈, AI 특유의 매끈한 광택·과한 보케·무의미한 배경 디테일.
- 경미(minor): 그 밖에 고치면 좋은 것.
score는 0~100, 그대로 연재할 수 있을 때만 80 이상. 결함마다 code에 지침 규칙 코드(예: AI-03, R-5)를 적어라.

## 이 컷
{panel}

## 등장인물 외모 명세
{cast}

## 화풍
{style}
"""


def _panel_prompt(style: str, panel: dict[str, Any], cast: list[dict[str, Any]], with_refs: bool, extra: str) -> str:
    parts = [
        f"One single vertical webtoon panel, {panel['shot']} shot, full-bleed artwork filling the whole frame edge to edge, no borders.",
        panel["description"],
        ("Characters: " + " | ".join(f"{c['name']}: {c['appearance']}" for c in cast)) if cast else "",
        (
            " ".join(f"Reference image {i + 1} is the design sheet for {c['name']}: match face, hair and outfit exactly." for i, c in enumerate(cast))
            + " Use the references only for character design; do not copy their layout, pose or background."
        )
        if with_refs and cast
        else "",
        f"Exactly {len(cast)} visible person(s)." if cast else "No people in this panel.",
        f"Style: {style}",
        "Korean setting: no Japanese or Chinese architecture, torii gates, kimono or kanji signage.",
        "Signs, papers and talismans are blank or carry only simple abstract red marks."
        " No text, letters, speech bubbles, signature or watermark anywhere.",
        f"Avoid: {panel['avoid']}." if panel.get("avoid") else "",
        f"Director's note: {extra}" if extra else "",
    ]
    return " ".join(p for p in parts if p)


def _sheet_key(series_id: str, char: dict[str, Any], style: str) -> str:
    h = hashlib.sha256(f"{char['appearance']}|{style}".encode()).hexdigest()[:10]
    slug = re.sub(r"[^a-z0-9_-]", "", char["id"].lower()) or "c"
    return f"series/{series_id}/refs/{slug}-{h}.png"


def _rank(c: dict[str, Any], pass_score: int) -> tuple[int, int]:
    ok = c["score"] >= pass_score and not any(d["severity"] == "critical" for d in c["defects"])
    return (1 if ok else 0, c["score"])


def run_art(ctx: dict[str, Any], llm: JSONModel, images: ImageGen, media: Media, s: ArtSettings) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    system = render_guidelines(ctx["guidelines"])
    payload = ctx.get("payload") or {}
    instruction = ctx.get("instruction") or ""
    prev = ctx.get("previous_body") or {}
    redraw = [int(i) for i in payload.get("panels") or []]

    if redraw and prev.get("kind") == "art":
        # 고른 컷만 다시 그려요. 컷 목록과 인물 명세는 이전 결과를 그대로 써요.
        plan = {"style_prompt": prev["style_prompt"], "characters": prev["characters"], "panels": [dict(p) for p in prev["panels"]]}
    else:
        redraw = []
        task = PLAN_TASK.format(max_panels=s.max_panels) + "\n" + _inputs_text(ctx)
        if instruction:
            task += f"\n\n## 대표의 추가 지시 (가장 우선)\n{instruction}"
        r = llm.json(system, task, PLAN_SCHEMA)
        costs.add(r.result.cost_entry())
        plan = r.data
        plan["panels"] = plan["panels"][: s.max_panels]
        for i, p in enumerate(plan["panels"]):
            p["index"] = i + 1

    if not plan["panels"]:
        raise StageInputError("콘티에서 컷을 찾지 못했어요. 콘티 결과를 확인해 주세요.")

    style = plan["style_prompt"]
    chars = {c["id"]: dict(c) for c in plan["characters"]}

    # 인물 시트: 외모 명세와 화풍이 같으면 한 번만 그려서 모든 회차가 같이 써요 (04번 일관성 1층).
    for c in chars.values():
        key = _sheet_key(ctx["series"]["id"], c, style)
        if media.get(key) is None:
            img = images.generate(
                f"Character design sheet for a Korean webtoon. {c['name']}: {c['appearance']}. Front view and three-quarter view side by side, "
                f"full body, neutral expression, plain light gray background. Style: {style}. No text, labels or watermark.",
                seed=1,
                aspect_ratio="4:3",
            )
            costs.add(img.cost_entry())
            media.put(key, trim_border(img.data))
        c["sheet"] = key

    artifact_id = ctx["artifact_id"]
    ep = ctx["episode"]["number"] if ctx.get("episode") else 0
    base = f"series/{ctx['series']['id']}/ep{ep:03d}/art/{artifact_id}"

    def draw(panel: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        cast = [chars[cid] for cid in panel["character_ids"] if cid in chars]
        refs = [media.get(c["sheet"]) for c in cast] if 0 < len(cast) <= 3 else []
        if any(r is None for r in refs):
            refs = []
        prompt = _panel_prompt(style, panel, cast, bool(refs), instruction if redraw else "")
        cands: list[dict[str, Any]] = []
        for k in range(s.candidates):
            img = images.generate(prompt, seed=panel["index"] * 100 + k + 10 * (ctx.get("attempt") or 1), references=refs or None)
            local.append(img.cost_entry())
            data = trim_border(img.data)
            key = media.put(f"{base}/{panel['index']:03d}-{k + 1}.png", data)
            check = llm.json(
                system,
                CHECK_TASK.format(
                    panel=json.dumps({k2: panel[k2] for k2 in ("shot", "description", "character_ids", "avoid")}, ensure_ascii=False),
                    cast=json.dumps([{"id": c["id"], "appearance": c["appearance"]} for c in cast], ensure_ascii=False) or "(없음)",
                    style=style,
                ),
                CHECK_SCHEMA,
                images=[thumbnail(data)],
                effort=s.check_effort,
                max_tokens=8000,
            )
            local.append(check.result.cost_entry())
            d = check.data
            if cast and d.get("people_count", len(cast)) < len(cast):
                d["defects"].append({"code": "AI-07", "severity": "major", "note": f"인물 수 {d['people_count']}명 (지시: {len(cast)}명)"})
            cands.append({"image": key, "score": max(0, min(100, int(d["score"]))), "defects": d["defects"]})
            if _rank(cands[-1], s.pass_score)[0]:
                break  # 합격 후보가 나오면 더 그리지 않아요
        best = max(cands, key=lambda c: _rank(c, s.pass_score))
        out = {
            **panel,
            "prompt": prompt,
            "image": best["image"],
            "score": best["score"],
            "defects": best["defects"],
            "passed": bool(_rank(best, s.pass_score)[0]),
            "candidates": [{"image": c["image"], "score": c["score"]} for c in cands],
            "drawn_in": artifact_id,
        }
        return out, local

    todo = [p for p in plan["panels"] if not redraw or p["index"] in redraw]
    with ThreadPoolExecutor(max_workers=max(1, s.parallel)) as pool:
        results = list(pool.map(draw, todo))
    drawn = {p["index"]: p for p, _ in results}
    for _, local in results:
        costs.extend(local)

    panels = [drawn.get(p["index"], p) for p in plan["panels"]]
    flagged = [p["index"] for p in panels if not p.get("passed")]
    scores = [p["score"] for p in panels if "score" in p]
    body = {
        "kind": "art",
        "style_prompt": style,
        "characters": list(chars.values()),
        "panels": panels,
        "flagged": flagged,
        "redrawn": redraw,
        "summary": {
            "panels": len(panels),
            "passed": len(panels) - len(flagged),
            "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
        },
    }
    return body, list(costs)


def _inputs_text(ctx: dict[str, Any]) -> str:
    return "\n\n".join(f"## 승인된 앞 단계: {label}\n{text}" for label, text in ctx["inputs"])


# ── ⑧ 말풍선 ─────────────────────────────────────────────────────────

TRANSLATE_SCHEMA = _obj(
    {
        "lines": _arr(_obj({"id": _STR, "en": _STR, "note": _STR})),
        "sfx": _arr(_obj({"panel": _INT, "en": _STR})),
        "glossary": _arr(_obj({"term": _STR, "note": _STR})),
    }
)

TRANSLATE_TASK = """# 과제: ⑧ 말풍선 준비 — 영어 대사

아래 한국어 대사를 미국 독자가 읽는 자연스러운 영어 구어체로 다시 써라. 직역하지 말고 인물 말투를 지켜라.
- lines: 모든 id에 하나씩. en은 25단어 이내. note에는 의미가 빠지거나 더해진 곳, 없으면 빈 문자열.
- sfx: 효과음이 있는 컷마다 영어 의성어.
- glossary: 처음 나오는 한국 문화 용어와 짧은 풀이.

## 대사 (id [화자] 한국어)
{lines}

## 효과음 (컷: 한국어)
{sfx}
"""

LAYOUT_SCHEMA = _obj(
    {
        "bubbles": _arr(
            _obj(
                {
                    "line": _INT,
                    "shape": {"type": "string", "enum": ["speech", "thought", "shout", "whisper", "narration"]},
                    "x": _NUM,
                    "y": _NUM,
                    "w": _NUM,
                    "h": _NUM,
                    "has_tail": _BOOL,
                    "tail_x": _NUM,
                    "tail_y": _NUM,
                }
            )
        ),
        "sfx": _obj({"present": _BOOL, "x": _NUM, "y": _NUM, "size": _NUM, "angle": _NUM}),
    }
)

LAYOUT_TASK = """# 과제: 말풍선 배치

첨부한 완성 컷에 아래 대사의 말풍선과 효과음을 배치하라. 지침 L-1~L-5를 지켜라.
- 얼굴, 손, 핵심 소품을 가리지 않는다. 빈 하늘, 벽, 어두운 곳, 컷 위쪽을 우선한다.
- 읽는 순서는 위에서 아래, 왼쪽에서 오른쪽. line은 아래 목록의 번호(0부터).
- 모든 좌표는 컷 너비·높이에 대한 퍼센트(0~100), 원점은 왼쪽 위. x, y는 말풍선의 왼쪽 위, w, h는 크기. 가장자리에서 3% 안쪽.
- 한국어와 영어 중 긴 쪽이 들어가게 크기를 잡아라. 내레이션과 화면 밖 화자는 has_tail=false.
- 꼬리 끝(tail_x, tail_y)은 말하는 인물의 입이나 머리 쪽. 효과음이 없으면 sfx.present=false.

## 대사
{lines}

## 효과음
{sfx}
"""


def run_lettering(ctx: dict[str, Any], llm: JSONModel, media: Media, s: ArtSettings) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    art = ctx["input_bodies"].get("art") or {}
    if art.get("kind") != "art":
        raise StageInputError("승인된 작화 결과가 없어요. 작화 단계를 먼저 승인해 주세요.")
    system = render_guidelines(ctx["guidelines"])
    panels = art["panels"]

    lines = []
    for p in panels:
        for li, d in enumerate(p.get("dialogue") or []):
            lines.append((f"{p['index']}-{li}", d["speaker"], d["text"]))
    sfx_in = [(p["index"], p["sfx"]) for p in panels if p.get("sfx")]

    en: dict[str, str] = {}
    notes: list[dict[str, str]] = []
    sfx_en: dict[int, str] = {}
    glossary: list[dict[str, str]] = []
    if lines or sfx_in:
        task = TRANSLATE_TASK.format(
            lines="\n".join(f"{i} [{sp}] {t}" for i, sp, t in lines) or "(없음)",
            sfx="\n".join(f"{i}: {t}" for i, t in sfx_in) or "(없음)",
        )
        plot = ctx["input_bodies"].get("plot") or {}
        if isinstance(plot.get("markdown"), str):
            task += "\n\n## 참고: 승인된 대본 (맥락용)\n" + plot["markdown"][:20000]
        if ctx.get("instruction"):
            task += f"\n\n## 대표의 추가 지시 (가장 우선)\n{ctx['instruction']}"
        r = llm.json(system, task, TRANSLATE_SCHEMA)
        costs.add(r.result.cost_entry())
        en = {x["id"]: x["en"] for x in r.data["lines"]}
        notes = [{"id": x["id"], "note": x["note"]} for x in r.data["lines"] if x.get("note")]
        sfx_en = {x["panel"]: x["en"] for x in r.data["sfx"]}
        glossary = r.data["glossary"]

    def place(p: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        dialogue = p.get("dialogue") or []
        out = {
            "index": p["index"],
            "image": p["image"],
            "height": p.get("height", "normal"),
            "gap_before": p.get("gap_before", "normal"),
            "description": p.get("description", ""),
            "score": p.get("score"),
            "defects": p.get("defects", []),
            "bubbles": [],
            "sfx": None,
        }
        if not dialogue and not p.get("sfx"):
            return out, local
        image = media.get(p["image"])
        listing = "\n".join(
            f"{li}. [{d['speaker']}] {d['text']} / {en.get(str(p['index']) + '-' + str(li), '')}" for li, d in enumerate(dialogue)
        )
        r = llm.json(
            system,
            LAYOUT_TASK.format(lines=listing or "(없음)", sfx=f"{p.get('sfx')} / {sfx_en.get(p['index'], '')}" if p.get("sfx") else "(없음)"),
            LAYOUT_SCHEMA,
            images=[thumbnail(image)] if image else None,
            effort=s.check_effort,
            max_tokens=8000,
        )
        local.append(r.result.cost_entry())
        placed = {b["line"]: b for b in r.data["bubbles"] if 0 <= b["line"] < len(dialogue)}
        for li, d in enumerate(dialogue):
            b = placed.get(li) or {"shape": "speech", "x": 6, "y": 4 + 14 * li, "w": 50, "h": 12, "has_tail": False, "tail_x": 0, "tail_y": 0}
            out["bubbles"].append(
                {
                    "speaker": d["speaker"],
                    "shape": "narration" if d["speaker"] == "narration" else b["shape"],
                    "text": {"ko": d["text"], "en": en.get(f"{p['index']}-{li}", "")},
                    "box": {"x": _clip(b["x"], 3, 97), "y": _clip(b["y"], 3, 97), "w": _clip(b["w"], 8, 94), "h": _clip(b["h"], 5, 60)},
                    "tail": {"x": _clip(b["tail_x"]), "y": _clip(b["tail_y"])} if b["has_tail"] else None,
                }
            )
        sx = r.data["sfx"]
        if p.get("sfx"):
            out["sfx"] = {
                "text": {"ko": p["sfx"], "en": sfx_en.get(p["index"], "")},
                "x": _clip(sx["x"] if sx["present"] else 70),
                "y": _clip(sx["y"] if sx["present"] else 15),
                "size": _clip(sx["size"] if sx["present"] else 10, 4, 30),
                "angle": _clip(sx["angle"] if sx["present"] else -8, -45, 45),
            }
        return out, local

    with ThreadPoolExecutor(max_workers=max(1, s.parallel)) as pool:
        results = list(pool.map(place, panels))
    for _, local in results:
        costs.extend(local)
    body = {
        "kind": "lettered",
        "panels": [p for p, _ in results],
        "glossary": glossary,
        "translation_notes": notes,
    }
    return body, list(costs)


# ── ⑨ 검수 ───────────────────────────────────────────────────────────

RUBRIC = {"Q-1": 15, "Q-2": 10, "Q-3": 15, "Q-4": 15, "Q-5": 20, "Q-6": 10, "Q-7": 10, "Q-8": 5}
RUBRIC_LABEL = {
    "Q-1": "훅과 절단",
    "Q-2": "전개 리듬",
    "Q-3": "대사 자연스러움",
    "Q-4": "캐릭터 일관성",
    "Q-5": "AI 티 없음",
    "Q-6": "한국 고증",
    "Q-7": "레터링 가독성",
    "Q-8": "화풍 통일",
}

REVIEW_SCHEMA = _obj(
    {
        "items": _arr(_obj({"code": {"type": "string", "enum": list(RUBRIC)}, "score": _INT, "evidence": _STR})),
        "defects": _arr(
            _obj(
                {
                    "severity": {"type": "string", "enum": ["critical", "major", "minor"]},
                    "panel": _INT,
                    "rule": _STR,
                    "note": _STR,
                }
            )
        ),
        "fixes": _arr(_STR),
        "summary": _STR,
    }
)

REVIEW_TASK = """# 과제: ⑨ 검수 — 고정 채점표

아래 회차를 지침의 채점표(Q-1~Q-8)로 채점하라. 항목마다 만점을 넘지 않게 점수를 주고, 근거에 컷 번호와 규칙 코드를 적어라.
만점: {rubric}
- 자동 검사 결과(컷별 그림 점수와 결함, 금지 표현)는 사실로 받아들이고 점수에 반영하라.
- defects: 치명/주요/경미, 컷 번호(회차 전체면 0), 규칙 코드, 설명. fixes: 다음 수정 라운드에서 할 일, 우선순위 순.
- summary: 대표에게 보여줄 두세 문장.

## 컷 (번호, 높이, 그림 점수, 그림 결함, 장면, 대사 한국어 / 영어)
{panels}

## 자동 검사
{auto}
"""


def _banned_hits(body: dict[str, Any], terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hits = []
    for p in body["panels"]:
        for b in p["bubbles"]:
            for t in terms:
                text = b["text"]["ko"] if t["kind"] == "dialogue_ko" else b["text"]["en"] if t["kind"] == "dialogue_en" else None
                if text and t["term"].lower() in text.lower():
                    hits.append({"panel": p["index"], "kind": t["kind"], "term": t["term"], "text": text})
    return hits


def run_review(ctx: dict[str, Any], llm: JSONModel, s: ArtSettings) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    lettered = ctx["input_bodies"].get("lettering") or {}
    if lettered.get("kind") != "lettered":
        raise StageInputError("승인된 말풍선 결과가 없어요. 말풍선 단계를 먼저 승인해 주세요.")
    panels = lettered["panels"]

    banned = _banned_hits(lettered, ctx.get("banned_terms") or [])
    low = [p["index"] for p in panels if (p.get("score") or 0) < s.pass_score]
    crowded = [p["index"] for p in panels if len(p["bubbles"]) > 3]
    art_critical = [
        {"panel": p["index"], "rule": d["code"], "note": d["note"]}
        for p in panels
        for d in p.get("defects") or []
        if d["severity"] == "critical"
    ]
    missing_en = [p["index"] for p in panels for b in p["bubbles"] if not b["text"]["en"]]
    auto = {
        "banned_terms": banned,
        "panels_below_pass": low,
        "panels_over_3_bubbles": crowded,
        "art_critical_defects": art_critical,
        "panels_missing_english": sorted(set(missing_en)),
    }

    def row(p: dict[str, Any]) -> str:
        talk = " | ".join(f"[{b['speaker']}] {b['text']['ko']} / {b['text']['en']}" for b in p["bubbles"])
        defects = "; ".join(f"{d['code']}({d['severity']}) {d['note']}" for d in p.get("defects") or [])
        return f"{p['index']}. ({p['height']}) 점수 {p.get('score')} 결함: {defects or '없음'} | 장면: {p['description']} | 대사: {talk or '없음'}"

    task = REVIEW_TASK.format(
        rubric=", ".join(f"{k} {RUBRIC_LABEL[k]} {v}점" for k, v in RUBRIC.items()),
        panels="\n".join(row(p) for p in panels),
        auto=json.dumps(auto, ensure_ascii=False, indent=2),
    )
    if ctx.get("instruction"):
        task += f"\n\n## 대표의 추가 지시\n{ctx['instruction']}"
    r = llm.json(render_guidelines(ctx["guidelines"]), task, REVIEW_SCHEMA)
    costs.add(r.result.cost_entry())

    scores = {k: 0 for k in RUBRIC}
    evidence = {k: "" for k in RUBRIC}
    for it in r.data["items"]:
        scores[it["code"]] = max(0, min(RUBRIC[it["code"]], int(it["score"])))
        evidence[it["code"]] = it["evidence"]
    defects = r.data["defects"] + [{"severity": "critical", **d} for d in art_critical if not any(x["panel"] == d["panel"] and x["severity"] == "critical" for x in r.data["defects"])]
    total = sum(scores.values())
    critical = [d for d in defects if d["severity"] == "critical"]
    passed = total >= 80 and scores["Q-5"] >= 16 and not critical

    md = [
        f"# 검수 결과: {'합격' if passed else '불합격'} ({total}/100)",
        "",
        r.data["summary"],
        "",
        "| 항목 | 점수 | 근거 |",
        "| --- | --- | --- |",
        *[f"| {k} {RUBRIC_LABEL[k]} | {scores[k]}/{RUBRIC[k]} | {evidence[k].replace('|', '/')} |" for k in RUBRIC],
        "",
        "합격 기준: 80점 이상, AI 티 없음 16점 이상, 치명 결함 0개.",
        "",
        "## 결함",
        *([f"- [{ {'critical': '치명', 'major': '주요', 'minor': '경미'}[d['severity']] }] {d['panel'] or '전체'}컷 {d['rule']}: {d['note']}" for d in defects] or ["- 없음"]),
        "",
        "## 수정 지시",
        *([f"{i + 1}. {f}" for i, f in enumerate(r.data["fixes"])] or ["- 없음"]),
        "",
        "## 자동 검사",
        f"- 금지 표현: {len(banned)}건" + ("".join(f"\n  - {h['panel']}컷 '{h['term']}' ({h['kind']})" for h in banned)),
        f"- 그림 점수 미달 컷: {', '.join(map(str, low)) or '없음'}",
        f"- 말풍선 4개 이상 컷: {', '.join(map(str, crowded)) or '없음'}",
        f"- 영어 대사 빠진 컷: {', '.join(map(str, auto['panels_missing_english'])) or '없음'}",
    ]
    body = {
        "kind": "review",
        "markdown": "\n".join(md),
        "passed": passed,
        "total": total,
        "scores": scores,
        "defects": defects,
        "fixes": r.data["fixes"],
        "auto_checks": auto,
    }
    return body, list(costs)
