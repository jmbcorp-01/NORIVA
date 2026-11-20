"""④ 화풍: 글로 된 화풍 카드에 더해 실제 샘플 그림을 그려요.

1. 대표가 올린 참고 캡처가 있으면 그림을 보고 화풍 '기준 값'(선, 채색 단계, 비율 등)만 뽑아요.
   캡처는 그림 모델에 보내지 않고, 결과물에도 남기지 않아요 (저작권: 기준 값만 참고).
2. 화풍 후보 3개를 화풍 카드(한국어)와 영어 화풍 문구로 쓰고, 시험 장면 3개를 정해요.
3. 후보 3개 × 장면 3개 = 9장을 그려 대표가 고르게 해요. 고른 그림은 '화풍 마스터'가 되어
   ⑦ 작화의 모든 컷에 화풍 참조 이미지로 들어가요.
"""

from __future__ import annotations

from typing import Any

from .images import IMAGE_MODELS, ImageGen, thumbnail, trim_border
from .media import Media
from .prompts import render_guidelines, render_task
from .visual import BASES, Costs, JSONModel, _arr, _map_progress, _obj, _report, base_for

_STR = {"type": "string"}

CRITERIA_SCHEMA = _obj(
    {
        "line": _STR,
        "coloring": _STR,
        "shading_steps": {"type": "integer"},
        "palette": _STR,
        "proportions": _STR,
        "faces": _STR,
        "backgrounds": _STR,
        "effects": _STR,
        "panel_rhythm": _STR,
        "avoid": _STR,
    }
)

CRITERIA_TASK = """# 과제: 참고 웹툰 캡처에서 화풍 기준 값 뽑기

첨부한 그림은 대표가 고른 시장 웹툰 화면 캡처예요. 이 그림을 따라 그리려는 게 아니라, 우리 작품이 넘어야 할 '완성도 기준'을 정하려는 거예요.
작품이나 작가 이름을 추측해 적지 말고, 캐릭터 디자인·구도·장면을 묘사하지 마라. 아래처럼 측정 가능한 특징만 짧게 한국어로 적어라.
- line: 외곽선 굵기(인물/배경 비율), 강약, 선 색
- coloring: 채색 방식(셀/그라데이션/브러시), 하이라이트 처리
- shading_steps: 그림자 단계 수(정수)
- palette: 채도와 명도 경향, 장면별 지배색 사용 방식
- proportions: 등신, 성인 남녀 체형 경향
- faces: 눈 크기(얼굴 대비), 턱선, 코·입 생략 정도
- backgrounds: 배경 밀도, 인물 컷의 배경 처리(흐림/색면/효과선)
- effects: 효과선, 빛, 연출 기호 사용
- panel_rhythm: 컷 크기와 여백 리듬, 클로즈업 비중
- avoid: 이 기준에 비춰 우리 그림에서 피해야 할 것
"""

PLAN_SCHEMA = _obj(
    {
        "candidates": _arr(_obj({"name": _STR, "medium": {"type": "string", "enum": list(BASES)}, "card": _STR, "style_prompt": _STR})),
        "scenes": _arr(_obj({"title": _STR, "prompt": _STR})),
    }
)

PLAN_TASK = """
## 출력 형식 (JSON)
- candidates: 화풍 후보 정확히 3개. name은 짧은 한국어 이름.
  card는 한국어 마크다운 화풍 카드. 맨 앞에 '작품 고유 요소'(뿌리 소재·시대·주제에서 뽑은 시각 모티프 2~3개: 문양, 상징색, 반복 소품, 빛의 성질)와
  '시장 기준 대비표'(선, 채색, 비율, 얼굴, 배경, 연출별 시장 기준 / 우리 값 / 다르게 한 이유)를 두고,
  이어서 선, 채색, 명암, 장면별 팔레트 hex, 배경 처리, 질감, 장르 연출, 금지 요소를 쓴다.
  style_prompt는 이미지 모델에 그대로 붙일 영어 한 단락(70~100단어): 선 굵기와 강약, 채색 단계, 명암, 팔레트, 배경 처리, 작품 고유 요소, 장르 연출(카메라 각도, 효과선). 작가·작품 이름 금지.
  medium은 그리는 방식: cel(디지털 셀 채색, 기본), painterly(브러시로 칠한 디지털 채색), ink(현대 수묵 렌더링).
  대표가 고른 참고 화풍이나 캡처 기준 값이 브러시·수채 결이면 painterly, 수묵 결이면 ink 후보를 넣고, 그렇지 않으면 cel 중심으로 낸다.
  style_prompt는 medium과 같은 방향으로 쓰고 서로 충돌하는 지시(예: 셀 채색 + 수채 번짐)를 섞지 않는다.
  어떤 medium이든 상위 연재 한국 웹툰 완성도여야 한다 (동화책·그림책풍, 종이 질감, 거친 스케치, 서양 그래픽노블 금지).
- scenes: 세 후보에 똑같이 쓸 시험 장면 정확히 3개.
  1) 주인공 감정 클로즈업 (눈썹·입·시선이 구체적인 표정, 연출 기호 포함)
  2) 장르의 핵심 순간을 극적인 카메라로 (액션이면 동작 정점을 로우·하이 앵글과 속도선으로, 공포면 리빌, 로맨스면 두 인물 거리감). 정면 눈높이 구도 금지.
  3) 시대 고증이 드러나는 와이드 장소 컷 (원근과 깊이가 분명하게)
  prompt는 영어로, 인물 외모(나이, 머리, 옷, 고정 소품)를 인물 문서 그대로 넣고 카메라 각도·거리·조명과 시대 고증을 구체적으로. 글자·말풍선은 넣지 않는다.
"""

SCENE_ASPECT = ["3:4", "9:16", "4:3"]


def _criteria_text(c: dict[str, Any]) -> str:
    labels = {
        "line": "선", "coloring": "채색", "shading_steps": "그림자 단계", "palette": "팔레트", "proportions": "비율",
        "faces": "얼굴", "backgrounds": "배경", "effects": "연출", "panel_rhythm": "컷 리듬", "avoid": "피할 것",
    }
    return "\n".join(f"- {labels[k]}: {c[k]}" for k in labels if c.get(k) not in (None, ""))


def picked_traits(brief: dict[str, Any]) -> list[dict[str, Any]]:
    works = ((brief.get("styleSuggestions") or {}).get("works")) or []
    idx = [i for i in (brief.get("styleChoice") or []) if isinstance(i, int) and 0 <= i < len(works)]
    return [works[i].get("traits") or {} for i in idx[:3]]


def picked_titles(brief: dict[str, Any]) -> list[str]:
    works = ((brief.get("styleSuggestions") or {}).get("works")) or []
    idx = [i for i in (brief.get("styleChoice") or []) if isinstance(i, int) and 0 <= i < len(works)]
    return [f"{works[i].get('title', '')} ({works[i].get('platform', '')})" for i in idx[:3]]


def run_style(ctx: dict[str, Any], llm: Any, images: ImageGen, media: Media) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    costs = Costs()
    system = render_guidelines(ctx["guidelines"])
    brief = (ctx.get("series") or {}).get("brief") or {}
    model = brief.get("imageModel") if brief.get("imageModel") in IMAGE_MODELS else None

    # 1. 참고 캡처 → 기준 값
    criteria = None
    refs = [media.get_private(k) for k in (brief.get("styleRefs") or [])[:8]]
    refs = [thumbnail(r, 1280) for r in refs if r]
    if refs:
        _report(ctx, f"참고 캡처 {len(refs)}장에서 기준 값 뽑는 중")
        r = llm.json(system, CRITERIA_TASK, CRITERIA_SCHEMA, images=refs, effort="medium", max_tokens=8000)
        costs.add(r.result.cost_entry())
        criteria = r.data

    # 1-1. 대표가 고른 시장 참고작의 화풍 특징 (작품·작가 이름은 빼고 특징만)
    picked = picked_traits(brief)

    # 2. 화풍 후보와 시험 장면
    _report(ctx, "화풍 후보 3개 쓰는 중")
    task = render_task("style", ctx) + PLAN_TASK
    if criteria:
        task += "\n\n## 대표가 고른 시장 기준 값 (이 완성도를 목표로, 그대로 베끼지 말 것)\n" + _criteria_text(criteria)
    if picked:
        task += "\n\n## 대표가 고른 참고 화풍의 특징 (완성도와 결의 기준으로만 쓰고 그대로 베끼지 말 것)"
        for i, t in enumerate(picked):
            task += f"\n### 참고 화풍 {chr(65 + i)}\n" + _criteria_text(t)
        task += "\n후보 1은 참고 화풍의 결에 가장 가깝게, 후보 2·3은 같은 완성도에서 변주한다."
    r = llm.json(system, task, PLAN_SCHEMA, effort="medium", max_tokens=32000)
    costs.add(r.result.cost_entry())
    cands = r.data["candidates"][:3]
    scenes = r.data["scenes"][:3]

    # 3. 후보 × 장면 샘플 그림
    base = f"series/{ctx['series']['id']}/style/{ctx['artifact_id']}"
    jobs = [(ci, si) for ci in range(len(cands)) for si in range(len(scenes))]

    def draw(job: tuple[int, int]) -> tuple[tuple[int, int, str], list[dict[str, Any]]]:
        ci, si = job
        prompt = (
            f"{base_for(cands[ci].get('medium'))} One single webtoon panel, one continuous image edge to edge, no borders, no split panels. "
            f"{scenes[si]['prompt']} Style: {cands[ci]['style_prompt']} "
            "Korean setting: no Japanese or Chinese architecture, katana, kimono or kanji. No text, letters, speech bubbles or watermark."
        )
        img = images.generate(prompt, seed=1000 + si, aspect_ratio=SCENE_ASPECT[si % 3], model=model)
        key = media.put(f"{base}/c{ci + 1}-s{si + 1}.png", trim_border(img.data))
        return (ci, si, key), [img.cost_entry()]

    results = _map_progress(ctx, 4, draw, jobs, "화풍 샘플 그리는 중")
    for _, local in results:
        costs.extend(local)
    samples: dict[int, dict[int, str]] = {}
    for (ci, si, key), _ in results:
        samples.setdefault(ci, {})[si] = key

    out_cands = [
        {"name": c["name"], "medium": c.get("medium") if c.get("medium") in BASES else "cel", "card": c["card"], "style_prompt": c["style_prompt"], "samples": [samples.get(i, {}).get(s) for s in range(len(scenes))]}
        for i, c in enumerate(cands)
    ]
    md = ["# ④ 화풍 후보 3안", ""]
    if criteria:
        md += ["## 참고 캡처에서 뽑은 기준 값", _criteria_text(criteria), ""]
    for i, c in enumerate(out_cands):
        md += [f"## 후보 {i + 1}. {c['name']}", c["card"], "", f"영어 화풍 문구: {c['style_prompt']}", ""]
    md += ["## 시험 장면"] + [f"{i + 1}. {s['title']}: {s['prompt']}" for i, s in enumerate(scenes)]

    body = {
        "kind": "style",
        "markdown": "\n".join(md),
        "stage": "style",
        "criteria": criteria,
        # 화면 표시용. 작품 이름은 markdown에 넣지 않아요 (다음 단계 에이전트가 읽지 않게)
        "picked": picked_titles(brief) if picked else [],
        "candidates": out_cands,
        "scenes": scenes,
        "model": model,
        "style_masters": [],
        "chosen": None,
    }
    return body, list(costs)
