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
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Protocol

from .images import IMAGE_MODELS, ImageGen, NoImageError, thumbnail, trim_border
from .llm import JSONResult
from .media import Media
from .prompts import render_guidelines


class JSONModel(Protocol):
    def json(self, system: str, task: str, schema: dict[str, Any], images: list[bytes] | None = None, effort: str | None = None, max_tokens: int = 32000) -> JSONResult: ...


@dataclass(frozen=True)
class ArtSettings:
    candidates: int = 2  # 컷마다 그려 볼 후보 수 (04번: 2~4장)
    pass_score: int = 80
    max_panels: int = 80  # 02번 S-16: 한 화 50~70컷, 1화·시즌 마지막 화는 80컷까지
    parallel: int = 4
    check_effort: str = "medium"
    test_panels: int = 5  # 처음 작화는 대표 장면 몇 컷만 그려 승인받아요. 0이면 끝까지 그려요.


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


def _load_json(media: Media, key: str) -> Any:
    try:
        b = media.get(key)
        return json.loads(b) if b else None
    except Exception:
        return None


def _save_json(media: Media, key: str, data: Any) -> None:
    try:
        media.put(key, json.dumps(data, ensure_ascii=False).encode(), content_type="application/json")
    except Exception:  # 저장이 안 돼도 작업은 계속해요 (이어 그리기만 못 할 뿐)
        pass


def _report(ctx: dict[str, Any], step: str, done: int | None = None, total: int | None = None) -> None:
    fn = ctx.get("progress")
    if fn:
        fn(step, done, total)


def _map_progress(ctx: dict[str, Any], parallel: int, fn: Any, items: list[Any], step: str) -> list[Any]:
    """병렬로 돌리면서 하나 끝날 때마다 진행 상황을 남겨요. 결과는 입력 순서대로 돌려줘요."""
    out: list[Any] = [None] * len(items)
    _report(ctx, step, 0, len(items))
    pool = ThreadPoolExecutor(max_workers=max(1, parallel))
    try:
        futures = {pool.submit(fn, it): i for i, it in enumerate(items)}
        for n, f in enumerate(as_completed(futures), 1):
            out[futures[f]] = f.result()
            _report(ctx, step, n, len(items))
    except BaseException:
        # 하나가 실패하면(크레딧 부족 등) 남은 일을 시작하지 않아요. 예전에는 남은 컷을 다 그리고 검사만 실패해 돈을 버렸어요.
        pool.shutdown(wait=True, cancel_futures=True)
        raise
    pool.shutdown(wait=True)
    return out


class Costs(list):
    def add(self, entry: dict[str, Any]) -> None:
        self.append(entry)


# ── ⑦ 작화 ───────────────────────────────────────────────────────────

PLAN_SCHEMA = _obj(
    {
        "style_prompt": _STR,
        "characters": _arr(
            _obj({"id": _STR, "name": _STR, "kind": {"type": "string", "enum": ["person", "animal", "creature"]}, "appearance": _STR})
        ),
        "panels": _arr(
            _obj(
                {
                    "index": _INT,
                    "shot": _STR,
                    "camera": _STR,
                    "depth": _STR,
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
  ③+ 고증 자료가 있으면 옷, 머리, 무기, 건물, 동물·요괴는 그 자료 항목의 영어 생김새 문구를 그대로 쓴다. 금지 단어 목록은 쓰지 않는다.
- camera: 콘티의 카메라 각도를 영어로 그대로 옮기고 구체적으로(예: low angle from knee height looking up, wide-angle lens, frame tilted 15 degrees / high angle from above the roof / over-the-shoulder from behind Suro).
  웹툰은 입체적인 화면이 기본이다. 콘티가 정면 눈높이를 분명히 지시한 컷만 eye level로 쓰고, 나머지는 각도·렌즈·기울기로 깊이를 만든다.
- depth: 앞·중간·뒤 층을 영어로(예: foreground: out-of-focus net poles; midground: Suro running; background: dry bay). 클로즈업은 배경 처리(색면, 효과선)로 쓴다.
- 이웃한 컷끼리 샷 크기와 각도를 바꿔 리듬을 만든다(같은 샷 3번 연속 금지, S-12~S-16).
- character_ids: 그 컷에 실제로 보이는 인물만.
- dialogue: 콘티의 한국어 대사를 고치지 말고 그대로. speaker는 인물 id, 내레이션은 "narration".
- sfx: 한국어 효과음, 없으면 빈 문자열. avoid: 이 컷에 보이면 안 되는 것(영어, 검사에서만 쓴다), 없으면 빈 문자열.
- characters: 등장하는 인물마다 짧은 id(영문 소문자)와 이름, kind(사람 person, 동물 animal, 용·요괴 같은 존재 creature), 모든 컷에 똑같이 쓸 영어 외모 명세(나이, 얼굴, 머리, 옷, 고정 소품). 동물도 그 컷에 보이면 character_ids에 넣는다.
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

첨부한 첫 번째 그림이 검사할 컷이다. 이 컷의 지시와 지침의 AI-01~AI-14, 한국 고증 규칙으로 검사하라.
그 뒤에 붙은 그림은 등장인물의 인물 시트(설정화)다. 순서는 아래 '인물 시트 순서'와 같다. {master_note} 컷 속 인물의 얼굴형, 머리 모양과 색, 옷의 형태와 색, 고정 소품, 신발이 시트와 같은지 하나씩 비교하라. 다르면 code K-1, 주요(major)로 무엇이 어떻게 다른지 적어라.
people_count에는 사람만 센다(동물과 요괴는 빼고).
- 치명(critical): 글자·가짜 글자·한자·워터마크(간판과 부적의 글자 포함), 그림 안에 그린 컷 테두리·여백·한 장에 여러 컷(만화책 페이지처럼 보임), 인물 수가 틀림, 손·얼굴 해부학 붕괴, 일본·중국식 요소(도리이, 일본도, 기모노 등), 기존 작품과 닮음.
- 주요(major): {medium_rule}, 인물 외모가 명세와 다름, 다른 컷과 등신·화풍이 다름, AI 특유의 매끈한 광택·과한 보케·무의미한 배경 디테일.
- 구도(code C-1, 주요): 지시한 샷 크기나 카메라 각도(camera)와 다름, 원근·깊이 없이 인물을 정면 눈높이 가운데 세운 평면 구도(그림책·삽화식).
  단, camera가 정면 눈높이를 지시한 컷은 평면 구도를 결함으로 보지 않는다. 'avoid'에 적힌 것이 보이면 주요다.
- 경미(minor): 그 밖에 고치면 좋은 것.
score는 0~100, 그대로 연재할 수 있을 때만 80 이상. 결함마다 code에 지침 규칙 코드(예: AI-03, R-5)를 적어라.
인물마다 '절대 그리면 안 되는 것(never)'이 보이면 치명(critical)이다.

## 이 컷
{panel}

## 등장인물 외모 명세
{cast}

## 인물 시트 순서
{sheet_order}

## 화풍
{style}
{research}"""


# 플랫폼 공통 화풍 바탕: 작품 화풍 카드보다 앞에 붙여 "웹툰 디지털 채색"에서 벗어나지 않게 해요.
WEBTOON_BASE = (
    "Korean webtoon (manhwa) digital illustration for vertical-scroll smartphone reading: clean confident digital lineart, "
    "flat cel shading with one or two shadow tones and crisp highlights, saturated digital colors, simplified painted backgrounds. "
    "Not watercolor, not paper or canvas texture, not ink hatching, not a western comic or picture-book style, not a photo or 3D render."
)

_FINISH = "Polished finish of a top-ranked serialized webtoon. Not a children's picture book or storybook, not a rough sketch, not a western comic, not a photo or 3D render."

# 화풍 후보의 그리는 방식(medium)별 바탕. 대표가 수채·수묵 결의 참고작을 고르면 셀 채색 바탕과 충돌하지 않게 바꿔요.
BASES = {
    "cel": WEBTOON_BASE,
    "painterly": (
        "Korean webtoon (manhwa) digital painting for vertical-scroll smartphone reading: confident clean lineart with thick-thin variation, "
        "soft digitally painted shading with controlled gradients, clear readable silhouettes and faces, atmospheric painted backgrounds. " + _FINISH
    ),
    "ink": (
        "Korean webtoon (manhwa) digital illustration with modern ink-wash (sumuk) rendering for vertical-scroll smartphone reading: "
        "bold expressive brush lineart with strong thick-thin variation, restrained muted palette with one or two accent colors, "
        "ink bleed and wash only in backgrounds and effects, faces clean and readable. " + _FINISH
    ),
}


MEDIUM_RULE = {
    "cel": "한국 웹툰 디지털 셀 채색이 아닌 화풍(수채화, 종이 질감, 잉크 해칭, 서양 그래픽노블, 그림책, 실사)",
    "painterly": "작품이 고른 브러시 디지털 채색과 다른 화풍(그림책, 동화풍 수채, 종이 질감, 실사, 서양 그래픽노블). 브러시 결과 붓 터치는 고른 화풍이라 결함이 아니다",
    "ink": "작품이 고른 현대 수묵·먹선 웹툰 화풍과 다른 화풍(그림책, 동화풍, 실사, 서양 그래픽노블, 매끈한 3D). 먹선의 굵기 변화, 붓 질감, 먹 번짐, 드라이 브러시는 고른 화풍이라 결함이 아니다",
}


def medium_rule(medium: Any) -> str:
    return MEDIUM_RULE.get(medium if isinstance(medium, str) else "cel", MEDIUM_RULE["cel"])


def base_for(medium: Any) -> str:
    return BASES.get(medium if isinstance(medium, str) else "cel", WEBTOON_BASE)


# 콘티의 컷 높이 → 그림 비율. 웹툰은 가로로 넓은 컷과 세로로 긴 컷이 섞여야 리듬이 생겨요.
ASPECT = {"short": "4:3", "normal": "3:4", "long": "9:16"}


def choose_test_panels(panels: list[dict[str, Any]], n: int) -> list[int]:
    """시험 컷: 첫 컷과 마지막 컷, 그리고 인물이 나오는 컷을 고르게 섞어 n개."""
    if n <= 0 or len(panels) <= n:
        return [p["index"] for p in panels]
    if n == 1:
        return [panels[0]["index"]]
    picked = [panels[0]["index"], panels[-1]["index"]]
    if n == 2:
        return picked
    people = [p for p in panels[1:-1] if p.get("character_ids")] or panels[1:-1]
    need = n - 2
    step = len(people) / need
    for k in range(need):
        idx = people[int(k * step + step / 2)]["index"]
        if idx not in picked:
            picked.append(idx)
    return sorted(picked)


def rhythm_warnings(panels: list[dict[str, Any]]) -> list[str]:
    """같은 샷 크기가 3컷 넘게 이어지거나, 각도가 정면 눈높이로만 이어지는 구간을 찾아요 (S-12~S-14)."""
    out: list[str] = []
    run = 1
    for i in range(1, len(panels)):
        same = (panels[i].get("shot") or "").strip().lower() == (panels[i - 1].get("shot") or "").strip().lower()
        run = run + 1 if same else 1
        if run == 3:
            out.append(f"{panels[i - 2]['index']}~{panels[i]['index']}컷: 같은 샷({panels[i].get('shot', '')})이 3번 이어져요")
    flat = 0
    for p in panels:
        cam = (p.get("camera") or "").lower()
        flat = flat + 1 if (not cam or "eye level" in cam or "eye-level" in cam) else 0
        if flat == 4:
            out.append(f"{p['index']}컷 근처: 정면 눈높이 컷이 4번 이어져 화면이 평면적이에요")
    return out


def _panel_prompt(
    style: str,
    panel: dict[str, Any],
    cast: list[dict[str, Any]],
    sheet_cast: list[dict[str, Any]] | bool,
    extra: str,
    n_masters: int = 0,
    base: str = WEBTOON_BASE,
    part_refs: list[dict[str, Any]] | None = None,
) -> str:
    sheet_offset = n_masters
    if isinstance(sheet_cast, bool):  # 예전 호출: 모든 인물에 시트가 있으면 True
        sheet_cast = list(cast) if sheet_cast else []
    humans = [c for c in cast if kind_of(c) == "person"]
    others = [c for c in cast if kind_of(c) != "person"]
    parts = [
        base,
        f"One single webtoon panel, {panel['shot']} shot, one continuous image filling the whole frame edge to edge."
        " Not a comic page: no panel borders, no frames, no gutters, no split panels, no paper margins.",
        f"Camera: {panel['camera']}." if panel.get("camera") else "",
        f"Depth: {panel['depth']}." if panel.get("depth") else "",
        "Dynamic cinematic webtoon composition with clear perspective and depth, not a flat centered storybook layout.",
        panel["description"],
        ("Characters: " + " | ".join(
            # 금지 목록은 검사에서만 써요. 그림 지시에 금지 단어를 넣으면 오히려 그 모양을 떠올려요.
            f"{c['name']}: {c['appearance']}" for c in cast
        )) if cast else "",
        (
            " ".join(
                f"Reference image {i + 1 + sheet_offset} is the design sheet for {c['name']}: match face shape, hairstyle, "
                "hair color, outfit cut and colors, props and footwear exactly."
                for i, c in enumerate(sheet_cast)
            )
            + " Use the references only for character design; do not copy their layout, pose or background."
        )
        if sheet_cast
        else "",
        (
            f"Reference image(s) 1-{n_masters} are this series' approved style masters: match their line weight, cel shading, "
            "palette and finish exactly, but not their characters, layout or content."
        )
        if n_masters
        else "",
        (f"Exactly {len(humans)} visible person(s)." if humans else "No people in this panel.")
        + (" Also visible: " + ", ".join(c["name"] for c in others) + "." if others else ""),
        f"Style: {style}",
        "Signs, papers and talismans are blank or carry only simple abstract red marks."
        " No text, letters, speech bubbles, signature or watermark anywhere.",
        (
            " ".join(
                f"Reference image {i + 1 + n_masters + len(sheet_cast)} is the approved, period-accurate design of "
                f"{p['name']} ({p['owner_name']}): whenever it appears in this panel draw exactly this shape, length and fittings."
                for i, p in enumerate(part_refs)
            )
            + " Do not add these objects if the panel does not call for them."
        )
        if part_refs
        else "",
        f"Director's note: {extra}" if extra else "",
    ]
    return " ".join(p for p in parts if p)


_ANIMAL = re.compile(
    r"\b(cow|ox|bull|calf|cattle|horse|pony|dog|puppy|cat|tiger|fox|wolf|deer|rabbit|bird|crow|magpie|crane|fish|snake|pig|goat|bear)\b",
    re.I,
)
_CREATURE = re.compile(r"\b(dragon|serpent|spirit|ghost|goblin|dokkaebi|monster|beast|demon|imugi)\b", re.I)


def kind_of(c: dict[str, Any]) -> str:
    """사람·동물·요괴 구분. 예전 결과처럼 kind가 없으면 이름과 외모 명세로 짐작해요."""
    if c.get("kind") in ("person", "animal", "creature"):
        return c["kind"]
    # 외모 명세는 앞 세 단어만 봐요 ("old man leading a cow"를 소로 착각하지 않게)
    head = " ".join((c.get("appearance") or "").split()[:3])
    text = f"{c.get('id', '')} {c.get('name', '')} {head}"
    if _CREATURE.search(text):
        return "creature"
    if _ANIMAL.search(text) or re.search(r"소\)|\(.*소|누렁소|황소|호랑이", c.get("name", "")):
        return "animal"
    return "person"


MAX_SHEETS = 4  # 한 컷에 넣는 인물 시트 수
MAX_REFS = 5  # 화풍 마스터 + 인물 시트 합계
MAX_PART_REFS = 2  # ④+에서 잠근 소품(칼·도구) 그림. 시트에 작게 그려져 모양이 흐려지는 걸 막아요


def _sheet_key(series_id: str, char: dict[str, Any], style: str) -> str:
    h = hashlib.sha256(f"v2|{char['appearance']}|{style}".encode()).hexdigest()[:10]
    slug = re.sub(r"[^a-z0-9_-]", "", char["id"].lower()) or "c"
    return f"series/{series_id}/refs/{slug}-{h}.png"


def _valid_model(m: Any) -> str | None:
    return m if isinstance(m, str) and m in IMAGE_MODELS else None


def _model_slug(m: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", m.lower()).strip("-")[-40:]


def images_default_model(images: Any) -> str | None:
    return getattr(images, "model", None)


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
    # ④+ 인물 시트가 승인돼 있으면 외모 명세와 시트를 그대로 써요 (작화가 외모를 새로 쓰지 않아요)
    sheets_body = (ctx.get("input_bodies") or {}).get("sheets") or {}
    from .research import research_text  # research가 visual을 불러 써서 여기서 불러요

    research = research_text((ctx.get("input_bodies") or {}).get("research"))
    fixed = [
        {k: c.get(k) for k in ("id", "name", "kind", "appearance", "never", "sheet")}
        for c in (sheets_body.get("characters") or [])
        if sheets_body.get("kind") == "sheets" and c.get("sheet")
    ]

    # 작업이 도중에 끊겨 다시 시작하면(작업기 종료, 일시 오류) 같은 결과물의 컷 목록과 끝난 컷을 이어 써요.
    _ep = ctx["episode"]["number"] if ctx.get("episode") else 0
    ck_base = f"series/{ctx['series']['id']}/ep{_ep:03d}/art/{ctx['artifact_id']}/_progress"
    saved_plan = _load_json(media, f"{ck_base}/plan.json")

    if saved_plan:
        plan = saved_plan
        redraw = [int(i) for i in plan.pop("_redraw", [])]
    elif redraw and prev.get("kind") == "art":
        # 고른 컷만 다시 그려요. 컷 목록과 인물 명세는 이전 결과를 그대로 써요.
        plan = {"style_prompt": prev["style_prompt"], "characters": prev["characters"], "panels": [dict(p) for p in prev["panels"]]}
    else:
        redraw = []
        _report(ctx, "콘티를 컷 목록으로 정리 중")
        task = PLAN_TASK.format(max_panels=s.max_panels) + "\n" + _inputs_text(ctx)
        if fixed:
            task += (
                "\n\n## 고정 등장인물 (④+ 인물 시트에서 승인됨)\n"
                "characters에는 아래 목록을 id, name, appearance까지 그대로 옮기고, character_ids에는 이 id만 쓴다. 외모를 새로 쓰거나 바꾸지 마라.\n"
                + "\n".join(f"- {c['id']}: {c['name']} ({c.get('kind', 'person')})" for c in fixed)
            )
        if instruction:
            task += f"\n\n## 대표의 추가 지시 (가장 우선)\n{instruction}"
        # 컷이 70~80개면 컷 목록 JSON만 3만 토큰을 넘어요. 생각 토큰도 같은 한도를 쓰니 넉넉히 줘요.
        r = llm.json(system, task, PLAN_SCHEMA, effort="medium", max_tokens=96000)
        costs.add(r.result.cost_entry())
        plan = r.data
        if fixed:
            plan["characters"] = [dict(c) for c in fixed]
        plan["panels"] = plan["panels"][: s.max_panels]
        for i, p in enumerate(plan["panels"]):
            p["index"] = i + 1
    if not saved_plan:
        _save_json(media, f"{ck_base}/plan.json", {**plan, "_redraw": redraw})

    if not plan["panels"]:
        raise StageInputError("콘티에서 컷을 찾지 못했어요. 콘티 결과를 확인해 주세요.")

    # 그림 모델: 이번 작업에서 고른 것 > 작품에 정해 둔 것 > 기본값
    brief = (ctx.get("series") or {}).get("brief") or {}
    model = _valid_model(payload.get("model")) or _valid_model(payload.get("adopt_model")) or _valid_model(brief.get("imageModel"))
    compare = [m for m in (payload.get("compare_models") or []) if _valid_model(m)]

    # 비교 시험에서 고른 모델의 그림을 그 컷의 결과로 삼아요
    adopt = _valid_model(payload.get("adopt_model"))
    if adopt:
        for p in plan["panels"]:
            v = next((v for v in p.get("variants") or [] if v["model"] == adopt), None)
            if v:
                p.update({"image": v["image"], "score": v["score"], "defects": v["defects"], "passed": v["passed"]})
            p.pop("variants", None)

    # 처음 작화는 시험 컷만 그려요. 대표가 보고 '나머지 그리기'를 누르면 나머지를 그려요.
    if not redraw and s.test_panels > 0 and not payload.get("full"):
        redraw = choose_test_panels(plan["panels"], s.test_panels)
        test_run = True
    else:
        test_run = False

    # ④에서 대표가 고른 화풍: 영어 화풍 문구와 화풍 마스터 그림
    style_body = (ctx.get("input_bodies") or {}).get("style") or {}
    chosen = style_body.get("chosen")
    base = WEBTOON_BASE
    chosen_medium = "cel"
    if isinstance(chosen, int) and 0 <= chosen < len(style_body.get("candidates") or []):
        plan["style_prompt"] = style_body["candidates"][chosen]["style_prompt"]
        chosen_medium = style_body["candidates"][chosen].get("medium") or "cel"
        base = base_for(chosen_medium)
    # ④+에서 금지 소품·장식을 지운 깨끗한 마스터를 만들었으면 그것을 써요
    master_keys = (sheets_body.get("clean_masters") or []) if sheets_body.get("kind") == "sheets" else []
    masters = [m for m in (media.get(k) for k in (master_keys or style_body.get("style_masters") or [])[:2]) if m]

    style = plan["style_prompt"]
    chars = {c["id"]: dict(c) for c in plan["characters"]}
    # ④+에서 대표가 잠근 소품(칼·도구) 그림: 그 인물이 나오는 컷에 참고 그림으로 넣어요.
    # 옷차림·머리 모양은 인물 시트에 이미 그려져 있어서 넣지 않아요.
    locked_objects: list[dict[str, Any]] = []
    if sheets_body.get("kind") == "sheets" and sheets_body.get("phase") != "parts":
        for p in sheets_body.get("parts") or []:
            if (p.get("kind") or "object") == "object" and p.get("locked"):
                b = media.get(p["locked"])
                if b is not None:
                    locked_objects.append({**p, "data": b})

    _report(ctx, "인물 시트 준비 중")
    # 인물 시트: 외모 명세와 화풍이 같으면 한 번만 그려서 모든 회차가 같이 써요 (04번 일관성 1층).
    for c in chars.values():
        if c.get("sheet") and str(c["sheet"]).startswith(f"series/{ctx['series']['id']}/sheets/") and media.get(c["sheet"]) is not None:
            continue  # ④+에서 승인한 시트
        key = _sheet_key(ctx["series"]["id"], c, style + "|" + ",".join(style_body.get("style_masters") or []))
        if media.get(key) is None:
            img = images.generate(
                f"{base} Character turnaround sheet for a Korean webtoon. {c['name']}: {c['appearance']}. "
                "Front view, side view and back view side by side, full body, plus three head close-ups (neutral, angry, smiling). "
                f"Pure flat white background with no texture. Style: {style}. No text, labels or watermark.",
                seed=1,
                aspect_ratio="4:3",
                references=masters or None,
                model=model,
            )
            costs.add(img.cost_entry())
            media.put(key, trim_border(img.data))
        c["sheet"] = key

    artifact_id = ctx["artifact_id"]
    ep = ctx["episode"]["number"] if ctx.get("episode") else 0
    key_base = f"series/{ctx['series']['id']}/ep{ep:03d}/art/{artifact_id}"

    def check(
        panel: dict[str, Any], cast: list[dict[str, Any]], data: bytes, local: list[dict[str, Any]],
        sheet_cast: list[dict[str, Any]] | None = None, sheets: list[bytes] | None = None,
    ) -> dict[str, Any]:
        sheet_cast = sheet_cast or []
        r = llm.json(
            system,
            CHECK_TASK.format(
                panel=json.dumps({k2: panel.get(k2, "") for k2 in ("shot", "camera", "depth", "description", "character_ids", "avoid")}, ensure_ascii=False),
                cast=json.dumps([{"id": c["id"], "kind": kind_of(c), "appearance": c["appearance"], "never": c.get("never") or []} for c in cast], ensure_ascii=False) or "(없음)",
                sheet_order=", ".join(f"{i + 2}번째 그림 = {c['name']}" for i, c in enumerate(sheet_cast)) or "(시트 없음)",
                style=style,
                medium_rule=medium_rule(chosen_medium),
                master_note="마지막 그림은 작품의 화풍 마스터다. 선 굵기, 채색, 명암, 질감이 마스터와 다르면 V-7 주요(major)로 적어라." if masters else "",
                research=f"\n## ③+ 고증 자료 (옷·머리·무기·건물은 이것과 맞아야 한다)\n{research}\n" if research else "",
            ),
            CHECK_SCHEMA,
            images=[thumbnail(data)] + [thumbnail(b, 640) for b in (sheets or [])] + ([thumbnail(masters[0], 512)] if masters else []),
            effort=s.check_effort,
            max_tokens=8000,
        )
        local.append(r.result.cost_entry())
        d = r.data
        humans = [c for c in cast if kind_of(c) == "person"]
        if humans and d.get("people_count", len(humans)) < len(humans):
            d["defects"].append({"code": "AI-07", "severity": "major", "note": f"사람 수 {d['people_count']}명 (지시: {len(humans)}명)"})
        return {"score": max(0, min(100, int(d["score"]))), "defects": d["defects"]}

    def draw(panel: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        cast = [chars[cid] for cid in panel["character_ids"] if cid in chars]
        # 인물 시트는 컷에 나오는 인물(동물 포함) 모두, 많아야 MAX_SHEETS장. 시트가 없는 인물만 빠져요.
        sheet_cast: list[dict[str, Any]] = []
        sheets: list[bytes] = []
        for c in cast:
            b = media.get(c["sheet"]) if c.get("sheet") else None
            if b is not None and len(sheets) < MAX_SHEETS:
                sheet_cast.append(c)
                sheets.append(b)
        # 화풍 마스터는 남는 자리에 (최소 1장, 많아야 2장)
        use_masters = masters[: max(1, min(2, MAX_REFS - len(sheets)))]
        ids = {c["id"] for c in cast}
        part_refs = [
            {"name": p["name"], "owner_name": ", ".join(chars[o]["name"] for o in p.get("owners") or [] if o in chars), "data": p["data"]}
            for p in locked_objects
            if ids & set(p.get("owners") or [])
        ][:MAX_PART_REFS]
        refs = use_masters + sheets + [p["data"] for p in part_refs]
        prompt = _panel_prompt(
            style, panel, cast, sheet_cast, instruction if redraw and not test_run else "", len(use_masters), base, part_refs
        )
        aspect = ASPECT.get(panel.get("height") or "normal", "3:4")
        seed0 = panel["index"] * 100 + 10 * (ctx.get("attempt") or 1)

        if compare:
            # 모델 비교: 같은 지시로 모델마다 한 장씩 그려 나란히 보여줘요
            variants = []
            for m in compare:
                try:
                    img = images.generate(prompt, seed=seed0, references=refs or None, aspect_ratio=aspect, model=m)
                except Exception as e:  # 한 모델이 실패해도 나머지 비교는 계속해요
                    variants.append({"model": m, "error": str(e)[:300]})
                    continue
                local.append(img.cost_entry())
                key = media.put(f"{key_base}/{panel['index']:03d}-{_model_slug(m)}.png", trim_border(img.data))
                c = check(panel, cast, trim_border(img.data), local, sheet_cast, sheets)
                variants.append({"model": m, "image": key, **c, "passed": bool(_rank(c, s.pass_score)[0])})
            ok = [v for v in variants if "image" in v]
            best = ok[0] if ok else {"image": None, "score": 0, "defects": [], "passed": False}
            out = {**panel, "prompt": prompt, "aspect": aspect, "image": best["image"], "score": best["score"],
                   "defects": best["defects"], "passed": best["passed"], "variants": variants, "drawn_in": artifact_id}
            return out, local

        cands: list[dict[str, Any]] = []
        blocked = ""
        # 같은 결과물을 다시 돌리는 경우(작업기 종료, 이어서 그리기): 지난 시도에서 그려 둔 그림이 있으면
        # 새로 그리지 않고 검사만 다시 해요. 이 컷의 지시와 맞으면 그대로 써요 (그리기보다 훨씬 싸요).
        n_old = 0
        for k in range(1, 4):
            old_key = f"{key_base}/{panel['index']:03d}-{k}.png"
            old = media.get(old_key)
            if old is None:
                break
            n_old = k
            cands.append({"image": old_key, "reused": True, **check(panel, cast, old, local, sheet_cast, sheets)})
            if _rank(cands[-1], s.pass_score)[0]:
                break
        for k in range(s.candidates):
            if cands and _rank(max(cands, key=lambda c: _rank(c, s.pass_score)), s.pass_score)[0]:
                break  # 다시 쓴 그림이 합격이면 새로 그리지 않아요
            try:
                img = images.generate(prompt, seed=seed0 + k, references=refs or None, aspect_ratio=aspect, model=model)
            except NoImageError as e:
                # 이 컷만 그림 모델이 거부했어요 (안전 필터 등). 작업 전체를 멈추지 않고 이 컷만 비워 둬요.
                blocked = str(e)
                break
            local.append(img.cost_entry())
            data = trim_border(img.data)
            key = media.put(f"{key_base}/{panel['index']:03d}-{k + 1 + n_old}.png", data)
            cands.append({"image": key, **check(panel, cast, data, local, sheet_cast, sheets)})
            if _rank(cands[-1], s.pass_score)[0]:
                break  # 합격 후보가 나오면 더 그리지 않아요
        if not cands:
            out = {**panel, "prompt": prompt, "aspect": aspect, "model": model or images_default_model(images), "image": None,
                   "score": 0, "defects": [], "passed": False, "candidates": [], "drawn_in": artifact_id,
                   "blocked": blocked or "그림이 만들어지지 않았어요."}
            out.pop("variants", None)
            return out, local
        best = max(cands, key=lambda c: _rank(c, s.pass_score))
        out = {
            **panel,
            "prompt": prompt,
            "aspect": aspect,
            "model": model or images_default_model(images),
            "image": best["image"],
            "score": best["score"],
            "defects": best["defects"],
            "passed": bool(_rank(best, s.pass_score)[0]),
            "candidates": [{"image": c["image"], "score": c["score"]} for c in cands],
            "drawn_in": artifact_id,
        }
        out.pop("variants", None)
        return out, local

    todo = [p for p in plan["panels"] if not redraw or p["index"] in redraw]
    if payload.get("keep_adopted"):
        todo = []  # 고른 모델의 시험 컷 그림만 옮기고 새로 그리지 않아요

    def draw_saved(panel: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """끝난 컷은 바로 저장해요. 다시 시작한 작업은 저장된 컷을 그대로 쓰고 남은 컷만 그려요."""
        key = f"{ck_base}/panel-{panel['index']:03d}.json"
        done = _load_json(media, key)
        if done and (done.get("out", {}).get("image") or done.get("out", {}).get("blocked")):
            return done["out"], done.get("costs") or []
        out, local = draw(panel)
        _save_json(media, key, {"out": out, "costs": local})
        return out, local

    resumed = sum(1 for p in todo if _load_json(media, f"{ck_base}/panel-{p['index']:03d}.json"))
    step = "시험 컷 그리는 중" if test_run else "컷 그리는 중"
    try:
        results = _map_progress(ctx, s.parallel, draw_saved, todo, step + (f" (끝난 {resumed}컷 이어서)" if resumed else ""))
    except BaseException as e:
        # 멈춰도 그때까지 끝난 컷은 화면에 보여 줘요. '이어서 그리기'를 누르면 다음 컷부터 그려요.
        done = [d["out"] for p in todo if (d := _load_json(media, f"{ck_base}/panel-{p['index']:03d}.json")) and d.get("out", {}).get("image")]
        e.partial_body = {  # type: ignore[attr-defined]
            "kind": "art_partial",
            "panels": [{k: d.get(k) for k in ("index", "image", "score", "passed", "description")} for d in sorted(done, key=lambda d: d["index"])],
            "drawn": len(done),
            "total": len(todo),
        }
        raise
    drawn = {p["index"]: p for p, _ in results}
    for _, local in results:
        costs.extend(local)

    panels = [drawn.get(p["index"], p) for p in plan["panels"]]
    pending = [p["index"] for p in panels if not p.get("image") and not p.get("blocked")]
    blocked = [{"index": p["index"], "note": p["blocked"]} for p in panels if p.get("blocked") and not p.get("image")]
    flagged = [p["index"] for p in panels if p.get("image") and not p.get("passed")]
    scores = [p["score"] for p in panels if p.get("image") and "score" in p]
    body = {
        "kind": "art",
        "style_prompt": style,
        "characters": list(chars.values()),
        "panels": panels,
        "flagged": flagged,
        "rhythm_warnings": rhythm_warnings(panels),
        "redrawn": [] if test_run or payload.get("keep_adopted") else redraw,
        "pending": pending,
        "blocked": blocked,
        "test_panels": redraw if test_run else (prev.get("test_panels") or []),
        "model": model,
        "compare_models": compare,
        "summary": {
            "panels": len(panels),
            "drawn": len(panels) - len(pending),
            "passed": len(panels) - len(pending) - len(flagged),
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
        _report(ctx, "영어 대사 쓰는 중")
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

    results = _map_progress(ctx, s.parallel, place, panels, "말풍선 배치 중")
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


REVIEW_MAX_IMAGES = 24


def run_review(ctx: dict[str, Any], llm: JSONModel, s: ArtSettings, media: Media | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
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
    # 실제 컷 그림을 작게 줄여 함께 봐요 (캐릭터 일관성, AI 티, 화풍 통일은 그림을 봐야 채점할 수 있어요)
    shown: list[int] = []
    pics: list[bytes] = []
    if media is not None:
        drawn = [p for p in panels if p.get("image")]
        step = max(1, -(-len(drawn) // REVIEW_MAX_IMAGES))
        for p in drawn[::step][:REVIEW_MAX_IMAGES]:
            data = media.get(p["image"])
            if data:
                pics.append(thumbnail(data, 384))
                shown.append(p["index"])
    if shown:
        task += (
            f"\n\n## 첨부한 컷 그림\n첨부 그림은 순서대로 {', '.join(f'{i}컷' for i in shown)}이다. "
            "Q-4 캐릭터 일관성, Q-5 AI 티, Q-6 고증, Q-8 화풍 통일은 그림을 직접 보고 채점하고, 근거에 컷 번호를 적어라."
        )
    if ctx.get("instruction"):
        task += f"\n\n## 대표의 추가 지시\n{ctx['instruction']}"
    _report(ctx, "채점표로 검수 중")
    r = llm.json(render_guidelines(ctx["guidelines"]), task, REVIEW_SCHEMA, images=pics or None)
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
