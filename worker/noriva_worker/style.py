"""④ 화풍: 글로 된 화풍 카드에 더해 실제 샘플 그림을 그려요.

1. 대표가 올린 참고 캡처가 있으면 그림을 보고 화풍 '기준 값'(선, 채색 단계, 비율 등)만 뽑아요.
   캡처는 그림 모델에 보내지 않고, 결과물에도 남기지 않아요 (저작권: 기준 값만 참고).
2. 화풍 후보 3개를 화풍 카드(한국어)와 영어 화풍 문구로 쓰고, 시험 장면 3개를 정해요.
3. 후보 3개 × 장면 3개 = 9장을 그려 대표가 고르게 해요. 고른 그림은 '화풍 마스터'가 되어
   ⑦ 작화의 모든 컷에 화풍 참조 이미지로 들어가요.
4. 그림 모델은 마스터의 옷·머리·소품·장식까지 따라 그려요. 그래서 처음부터 틀리지 않게 그려요.
   - 시험 장면은 화풍(선·채색·연출)을 보는 그림이라, 그림 모델이 잘 틀리는 고증 소품(칼, 관모·머리 장식)은 화면에 넣지 않아요.
     소품과 옷차림은 ④+의 소품·의상 시트가 실물 사진을 보고 따로 맡아요.
   - 그리기 전에 장면 지시를 한 번 더 읽어 위험한 것을 빼고, 옷·머리는 구조까지 긍정형으로 고쳐 써요.
     금지 단어 목록('Avoid: katana…')은 오히려 그 모양을 떠올리게 해서 지시에서 빼요.
   - 그린 뒤 시대 검사는 마지막 안전장치예요. 걸리면 고쳐서 한 번 더 그리고, 남은 것만 표시해요.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .images import IMAGE_MODELS, ImageGen, thumbnail, trim_border
from .media import Media
from .prompts import PERIOD_JUDGE_NOTE, render_guidelines, render_task
from .research import research_text
from .visual import BASES, Costs, JSONModel, _arr, _map_progress, _obj, _report, base_for, own_art

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
  prompt는 영어로, 인물 외모(나이, 얼굴, 체형)와 카메라 각도·거리·조명을 구체적으로. 글자·말풍선은 넣지 않는다.
  고른 시험 그림은 화풍 마스터가 되어 이후 인물 시트와 모든 컷이 그 옷·머리·소품까지 따라 그린다. 그래서 시험 장면은 화풍만 보여 주고 고증 위험을 만들지 않는다.
  - 칼·창 같은 무기, 관모·머리띠·머리 장식은 화면에 넣지 않는다(액션은 맨손, 몸짓, 동물·자연물과의 대결, 효과선으로 보여 준다).
  - 머리 모양은 그 시대에 맞는 단순한 모양 하나를 구조까지 적는다(예: hair gathered into one small low knot at the back of the head, tied with a thin dark cord, no band across the forehead).
  - 옷은 형태를 구조까지 긍정형으로 적는다(길이, 여밈 방향과 방법, 깃 모양, 소매, 허리띠, 바지·치마, 신발). 장식 끈이나 매듭 같은 모호한 말은 쓰지 않는다.
  - 건물은 멀리 작게, 단순한 형태(초가, 낮은 흙담)로. 고증이 어려운 건축은 크게 넣지 않는다.
  - ③+ 고증 자료가 있으면 옷, 머리 모양, 건물, 동물·요괴는 그 자료 항목의 영어 생김새 문구를 그대로 옮긴다. 자료에 없는 고증 요소는 넣지 않는다.
  - 'Avoid:', 'no katana' 같은 금지 단어 목록은 쓰지 않는다. 금지 단어는 이미지 모델이 오히려 그 모양을 떠올리게 한다. 맞는 모습만 쓴다.
"""

SCENE_ASPECT = ["3:4", "9:16", "4:3"]

STYLE_MATCH_PASS = 75  # 기준 그림과 화풍이 이만큼 맞아야 그대로 둬요. 아래면 차이를 고쳐 한 번 더 그려요.

STYLE_MATCH_SCHEMA = _obj(
    {
        "style_match": {"type": "integer"},
        "differences": _arr(_obj({"aspect": _STR, "fix": _STR})),
    }
)

STYLE_MATCH_TASK = """# 과제: 화풍이 기준을 따라갔는지 검사

첫 번째 그림은 우리가 새로 그린 화풍 샘플이다. {ref_note}
장면 내용, 인물, 구도는 달라도 된다. 그리는 방식만 비교한다.
- style_match: 0~100. 선(굵기, 강약, 색), 채색 방식과 그림자 단계, 명암 대비, 팔레트(채도·명도), 얼굴 구성(눈 크기와 모양, 코·입 생략 정도, 턱선),
  등신과 체형, 배경 처리, 질감이 기준과 같은 사람이 그린 것처럼 보이면 90 이상, 결이 비슷하면 70~80, 다른 작가처럼 보이면 50 이하.
- differences: 가장 크게 다른 것부터 많아야 5개. aspect는 한국어 짧게(예: 선 굵기), fix는 이미지 모델에 줄 영어 한 문장(맞는 모습만 긍정형으로,
  예: Use thick dark-brown outlines with strong thick-thin variation and only two flat shadow tones).
{criteria}"""

SCENE_REVIEW_SCHEMA = _obj({"scenes": _arr(_obj({"title": _STR, "prompt": _STR, "changes": _STR}))})

SCENE_REVIEW_TASK = """# 과제: 시험 장면 지시 고증 점검 (그리기 전)

아래 시험 장면 3개는 화풍 후보 샘플을 그릴 영어 지시다. 고른 샘플은 화풍 마스터가 되어 이후 모든 인물과 컷이 옷·머리·소품까지 따라 그린다.
그림 모델은 다른 시대·나라 모양(일본도와 코등이, 발목까지 오는 기모노와 오비, 망건과 이마 띠, 그 이전 시대 작품의 고름, 조선 양반가 한옥)으로 잘못 그리기 쉽다.
장면마다 지시를 다시 써라.
- 칼·창 같은 무기와 관모·머리띠·머리 장식이 보이면 화면에서 뺀다(맨손, 몸짓, 효과선으로 같은 감정과 긴장을 살린다).
- 머리 모양과 옷, 건물은 아래 '작품의 시대와 고증'에 고증 자료 항목이 있으면 그 영어 문구를 그대로 쓴다. 없으면 이 시대에 맞는 단순한 모양을 구조까지 긍정형으로 적는다. 모호한 말(headwrap, robe, decorative cord)은 구체적인 형태로 바꾼다.
- 고증이 어려운 건물은 멀리 작게, 단순한 형태로 바꾼다. 지붕은 처마 곡선이 낮고 완만하다고 구체적으로 적는다.
- 화면의 모든 사람(조연·노인·군중 포함)의 옷을 같은 방식으로 적는다: 저고리 길이, 깃이 여며지는 방향과 깃 가장자리 띠, 허리띠로 여밈, 소매 폭, 바지·치마, 신발.
- 'Avoid:' 목록과 'no ...' 같은 금지 단어는 모두 지운다(글자·말풍선 금지만 남긴다).
- 카메라, 구도, 표정, 조명, 팔레트, 장면의 핵심 순간은 그대로 둔다. title은 그대로.
- changes: 무엇을 바꿨는지 한국어 한 문장(바꾼 게 없으면 빈 문자열).

## 작품의 시대와 고증
{era}

## 시험 장면
{scenes}
"""

SAMPLE_CHECK_SCHEMA = _obj(
    {"people": _arr(_obj({"who": _STR, "hair": _STR, "headwear": _STR, "clothing": _STR})),
     "issues": _arr(_obj({"item": _STR, "severity": {"type": "string", "enum": ["critical", "major"]}, "fix": _STR}))}
)

SAMPLE_CHECK_TASK = """# 과제: 화풍 샘플의 시대 검사

첨부한 그림은 화풍 후보 샘플이다. 대표가 고르면 '화풍 마스터'가 되어, 이후 모든 인물 시트와 컷이 선과 채색뿐 아니라
이 그림의 옷·머리 모양·소품·장식까지 따라 그린다. 그래서 이 작품의 시대·나라와 맞지 않는 것이 보이면 모두 적어라.
- people: 먼저 그림 속 사람마다(얼굴 클로즈업이어도) 보이는 그대로 한국어로 적는다. 판단하지 말고 본 것만 쓴다.
  hair: 머리를 묶은 위치와 모양, 상투가 드러났는지. headwear: 이마나 머리에 두르거나 쓴 것(띠, 끈, 천, 관, 없으면 "없음"). clothing: 깃과 여밈, 소매, 띠.
- 그다음 people의 묘사를 아래 고증 기준(③+ 고증 자료가 있으면 그 머리 모양·관모·옷 항목)과 하나씩 비교한다.
  이마를 가로지르는 띠나 끈, 기준에 없는 머리 장식, 기준과 다른 상투 모양은 클로즈업에서도 반드시 critical로 적는다.
- critical: 다른 시대·나라의 복식(그 이전 시대 작품의 고름, 발목까지 오는 기모노와 오비, 하카마, 사무에, 청나라 옷), 머리 모양·머리 장식(망건, 이마 띠, 드러난 상투, 변발),
  무기(코등이 있는 칼, 일본도, 휜 칼), 건축(도리이, 일본·중국식 지붕), 글자·워터마크.
- major: 떠다니는 조각, 반짝임, 리본 같은 장식 효과(모든 컷에 옮겨 그려져요), 장면 지시와 다른 시대 소품.
- item: 보이는 것(한국어, 짧게), fix: 이미지 모델에 줄 영어 한 문장. 맞는 모습을 긍정형으로 쓴다.
- 문제가 없으면 빈 목록. 그림 솜씨나 구도는 보지 않는다.
- {judge}

## 작품의 시대와 고증
{era}

## 이 장면의 지시
{scene}
"""


_AVOID = re.compile(r"\s*\b(Avoid|Do not include|Must not include)\s*:[^\n]*$", re.I | re.S)


def _strip_avoid(prompt: str) -> str:
    """장면 지시 끝의 금지 단어 목록을 지워요. 금지 단어는 그림 모델이 오히려 그 모양을 떠올리게 해요."""
    return _AVOID.sub("", prompt or "").strip()


def _era_text(ctx: dict[str, Any]) -> str:
    """검사와 장면 점검에 쓰는 시대 기준. ③+ 고증 자료가 있으면 그것이 기준이에요."""
    research = research_text((ctx.get("input_bodies") or {}).get("research"))
    if research:
        return "③+ 고증 자료 (대표 승인):\n" + research
    out = []
    for src in ctx.get("sources") or []:
        line = f"- {src.get('name', '')} ({src.get('era', '')})"
        if src.get("caution"):
            line += f" 고증 주의: {src['caution']}"
        if src.get("visual_notes"):
            line += f" 시각 요소: {src['visual_notes']}"
        out.append(line)
    return "\n".join(out) or "- (뿌리 소재 없음: 작품 문서의 시대를 따른다)"


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

    # 1. 참고 캡처·대표 그림 → 기준 값
    criteria = None
    refs = [media.get_private(k) for k in (brief.get("styleRefs") or [])[:8]]
    refs = [thumbnail(r, 1280) for r in refs if r]
    # 대표가 직접 그린 그림: 기준 값을 뽑는 데 더해, 그림 모델에 참고 그림으로 직접 보내 그 결대로 그려요.
    own = own_art(brief, media)
    if refs or own:
        _report(ctx, f"기준 그림 {len(refs) + len(own)}장에서 기준 값 뽑는 중")
        r = llm.json(system, CRITERIA_TASK, CRITERIA_SCHEMA, images=[thumbnail(o, 1280) for o in own] + refs, effort="medium", max_tokens=8000)
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
    if own:
        task += (
            "\n\n## 대표가 직접 그린 그림이 있다 (가장 우선)\n샘플은 대표 그림을 참고 그림으로 직접 보고 그린다. 세 후보 모두 대표 그림의 선·채색·얼굴 구성을 따르고, "
            "후보 1은 대표 그림과 같은 사람이 그린 것처럼 가장 충실하게, 후보 2·3은 같은 결에서 배경·명암·연출만 다듬는다. "
            "style_prompt에는 대표 그림에서 보이는 선 굵기, 채색 단계, 얼굴 구성을 구체적으로 적는다."
        )
    r = llm.json(system, task, PLAN_SCHEMA, effort="medium", max_tokens=32000)
    costs.add(r.result.cost_entry())
    cands = r.data["candidates"][:3]
    scenes = r.data["scenes"][:3]

    # 3. 후보 × 장면 샘플 그림
    base = f"series/{ctx['series']['id']}/style/{ctx['artifact_id']}"
    jobs = [(ci, si) for ci in range(len(cands)) for si in range(len(scenes))]

    era = _era_text(ctx)
    # 그리기 전에 장면 지시를 고증 눈으로 다시 써요. 틀린 그림을 그린 뒤 버리는 것보다 훨씬 싸요.
    _report(ctx, "시험 장면 지시 고증 점검 중")
    rv = llm.json(
        system,
        SCENE_REVIEW_TASK.format(era=era, scenes="\n".join(json.dumps(s, ensure_ascii=False) for s in scenes)),
        SCENE_REVIEW_SCHEMA,
        effort="medium",
        max_tokens=16000,
    )
    costs.add(rv.result.cost_entry())
    reviewed = rv.data.get("scenes") or []
    for i, s in enumerate(scenes):
        new = reviewed[i] if i < len(reviewed) else {}
        if (new.get("prompt") or "").strip():
            s["prompt"] = new["prompt"].strip()
        s["prompt"] = _strip_avoid(s["prompt"])
        s["changes"] = (new.get("changes") or "").strip()

    def check(data: bytes, si: int, local: list[dict[str, Any]]) -> list[dict[str, Any]]:
        r = llm.json(
            system,
            SAMPLE_CHECK_TASK.format(era=era, scene=scenes[si]["prompt"], judge=PERIOD_JUDGE_NOTE),
            SAMPLE_CHECK_SCHEMA,
            images=[thumbnail(data, 1024)],
            effort="medium",
            max_tokens=8000,
        )
        local.append(r.result.cost_entry())
        return [i for i in r.data.get("issues") or [] if i.get("item")]

    def weight(issues: list[dict[str, Any]]) -> int:
        return sum(3 if i.get("severity") == "critical" else 1 for i in issues)

    # 화풍 일치 검사의 기준: 대표 그림 > 참고 캡처. 그림이 없으면 뽑아 둔 기준 값 글로만 비교해요.
    match_refs = [thumbnail(o, 768) for o in own[:3]] + [thumbnail(r, 768) for r in refs[: max(0, 3 - len(own))]]
    criteria_lines = _criteria_text(criteria) if criteria else ""
    if picked and not criteria_lines:
        criteria_lines = _criteria_text(picked[0])

    def style_match(data: bytes, local: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]] | None:
        if not match_refs and not criteria_lines:
            return None
        ref_note = (
            f"그 뒤의 {len(match_refs)}장은 이 작품이 따라야 할 기준 그림이다"
            + (" (앞쪽은 대표가 직접 그린 그림)." if own else " (대표가 고른 시장 웹툰 캡처. 완성도와 결의 기준).")
            if match_refs
            else "기준 그림은 없고 아래 기준 값 글이 기준이다."
        )
        r = llm.json(
            system,
            STYLE_MATCH_TASK.format(ref_note=ref_note, criteria=f"\n## 기준 값\n{criteria_lines}\n" if criteria_lines else ""),
            STYLE_MATCH_SCHEMA,
            images=[thumbnail(data, 1024)] + match_refs,
            effort="medium",
            max_tokens=6000,
        )
        local.append(r.result.cost_entry())
        score = max(0, min(100, int(r.data.get("style_match") or 0)))
        return score, [d for d in r.data.get("differences") or [] if (d.get("fix") or "").strip()]

    own_note = (
        f"Reference images 1-{len(own)} are the creator's own artwork for this series: reproduce their exact line quality, line color, "
        "coloring and shading steps, palette, proportions and face construction (eye shape and size, nose, mouth, jaw) so the new picture "
        "looks drawn by the same artist. Draw the new scene described here, not their characters or composition."
        if own
        else ""
    )

    def draw(job: tuple[int, int]) -> tuple[tuple[int, int, str, list[dict[str, Any]], int | None], list[dict[str, Any]]]:
        ci, si = job
        prompt = (
            f"{base_for(cands[ci].get('medium'))} One single webtoon panel, one continuous full-bleed image edge to edge. "
            f"{scenes[si]['prompt']} Style: {_strip_avoid(cands[ci]['style_prompt'])} {own_note} "
            "Signs and papers are blank; the picture contains no lettering, speech bubbles or watermark."
        )
        # 기준을 따라가야 하는 후보: 대표 그림이 있으면 모두, 참고 캡처·참고작만 있으면 '가장 가깝게'인 후보 1
        follow = bool(own) or ci == 0
        local: list[dict[str, Any]] = []
        tries: list[dict[str, Any]] = []
        for k in range(2):
            p = prompt
            if tries:
                last = tries[-1]
                fixes = " ".join(i["fix"].strip() for i in last["issues"] if (i.get("fix") or "").strip())
                p += f" Draw these details correctly: {fixes}" if fixes else ""
                if last["diffs"]:
                    p += " Match the reference style more closely: " + " ".join(d["fix"].strip() for d in last["diffs"][:5])
            img = images.generate(p, seed=1000 + si + 100 * k, aspect_ratio=SCENE_ASPECT[si % 3], model=model, references=own or None)
            local.append(img.cost_entry())
            data = trim_border(img.data)
            found = check(data, si, local)
            sm = style_match(data, local) if follow else None
            tries.append({"data": data, "issues": found, "match": sm[0] if sm else None, "diffs": sm[1] if sm else []})
            if not found and (sm is None or sm[0] >= STYLE_MATCH_PASS):
                break
        best = min(tries, key=lambda t: (weight(t["issues"]), -(t["match"] if t["match"] is not None else 100)))
        data, issues, match = best["data"], best["issues"], best["match"]
        key = media.put(f"{base}/c{ci + 1}-s{si + 1}.png", data)
        return (ci, si, key, [{"item": i["item"], "severity": i.get("severity", "major")} for i in issues], match), local

    results = _map_progress(ctx, 4, draw, jobs, "화풍 샘플 그리는 중")
    for _, local in results:
        costs.extend(local)
    samples: dict[int, dict[int, str]] = {}
    issues: dict[int, dict[int, list[dict[str, Any]]]] = {}
    matches: dict[int, dict[int, int | None]] = {}
    for (ci, si, key, found, match), _ in results:
        samples.setdefault(ci, {})[si] = key
        issues.setdefault(ci, {})[si] = found
        matches.setdefault(ci, {})[si] = match

    out_cands = [
        {"name": c["name"], "medium": c.get("medium") if c.get("medium") in BASES else "cel", "card": c["card"], "style_prompt": c["style_prompt"],
         "samples": [samples.get(i, {}).get(s) for s in range(len(scenes))],
         "sample_issues": [issues.get(i, {}).get(s) or [] for s in range(len(scenes))],
         # 기준 그림(대표 그림·참고 캡처)과 화풍이 얼마나 맞는지 0~100. 검사하지 않은 후보는 None
         "sample_match": [matches.get(i, {}).get(s) for s in range(len(scenes))]}
        for i, c in enumerate(cands)
    ]
    md = ["# ④ 화풍 후보 3안", ""]
    if criteria:
        md += ["## 참고 캡처에서 뽑은 기준 값", _criteria_text(criteria), ""]
    for i, c in enumerate(out_cands):
        md += [f"## 후보 {i + 1}. {c['name']}", c["card"], "", f"영어 화풍 문구: {c['style_prompt']}", ""]
    md += ["## 시험 장면"] + [f"{i + 1}. {s['title']}: {s['prompt']}" + (f" (고증 점검: {s['changes']})" if s.get("changes") else "") for i, s in enumerate(scenes)]

    body = {
        "kind": "style",
        "markdown": "\n".join(md),
        "stage": "style",
        "criteria": criteria,
        "own_art": len(own),
        # 화면 표시용. 작품 이름은 markdown에 넣지 않아요 (다음 단계 에이전트가 읽지 않게)
        "picked": picked_titles(brief) if picked else [],
        "candidates": out_cands,
        "scenes": scenes,
        "model": model,
        "style_masters": [],
        "chosen": None,
    }
    return body, list(costs)
