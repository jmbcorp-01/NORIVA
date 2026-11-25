"""④+ 인물 시트: 작품 전체가 쓰는 설정집(잠근 부품 + 인물 시트)을 만들어요.

새 엔진은 '맞는 그림을 먼저 잠그고, 잠근 것만 조합해서 그린다'예요.
1. 부품 단계: 승인된 ③ 인물 문서와 ③+ 고증 자료로 인물 외모 명세를 고정하고, 그림 모델이 잘 틀리는
   부품(칼·도구, 시대 옷차림, 주인공 머리 모양)을 나눠요. 부품마다 싼 그림 모델로 후보 4장을 그리고
   (실물 사진이 있으면 참고로), AI가 후보마다 다른 시대·나라 모양을 표시해요. 합격·불합격은 정하지 않아요.
2. 대표가 부품마다 맞는 후보를 골라 잠가요. 마음에 드는 게 없으면 그 부품만 다시 그려요.
3. 조합 단계: 모든 부품이 잠겨야 인물 시트를 그려요(관문). 인물 시트는 화풍 마스터(선과 채색만)와
   그 인물의 잠긴 부품 그림만 참고해요. 검사는 잠긴 부품과 같은지(부품별 맞음·다름)와 치명 결함만 봐요.
   잠긴 부품 그림이 글 명세보다 우선이에요.
4. 대표가 승인하면 ⑦ 작화가 모든 회차에서 이 명세와 시트를 그대로 써요.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
import re
import threading
from typing import Any

from . import commons
from .images import IMAGE_MODELS, ImageGen, NoImageError, thumbnail, trim_border
from .media import Media
from .prompts import PERIOD_JUDGE_NOTE, render_guidelines, render_task
from .research import research_text
from .visual import own_art, Costs, StageInputError, _arr, _map_progress, _obj, _report, base_for

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
                    "hair": _STR,
                    "never": _arr(_STR),
                }
            )
        ),
        "props": _arr(
            _obj({"id": _STR, "name": _STR, "owners": _arr(_STR), "description": _STR, "search": _arr(_STR)})
        ),
        "attire": _arr(
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
  얼굴은 이 인물만의 설계값으로 쓴다: 눈 모양과 크기(예: narrow upturned monolid eyes), 눈썹 모양, 코, 입, 턱선과 광대, 피부색, 알아볼 표식(점, 흉터, 주근깨) 하나.
  같은 작품의 인물끼리 얼굴 설계값이 겹치지 않게 하고(특히 같은 나이·성별), '아름다운', '잘생긴' 같은 막연한 말 대신 생김새를 쓴다.
  그림 모델은 막연한 말을 들으면 모든 젊은 인물을 같은 얼굴로 그린다.
- period_notes: 시대 고증을 영어로, **맞는 생김새만** 긍정형으로 쓴다(예: straight single-edged sword with a round ring pommel and a plain grip,
  straight scabbard). 금지할 것의 이름(일본도, 코등이 등)은 여기 쓰지 않고 never에만 쓴다.
- hair: 머리 모양과 머리에 쓰거나 두르는 것만 영어 한두 문장(묶는 위치와 방법, 덮는 것의 모양, 이마에 아무것도 없으면 그렇게).
  그림 모델이 그릴 수 있게 단순하고 분명한 모양으로 쓴다. 동물·요괴는 빈 문자열.
- never: 이 인물에 절대 그리면 안 되는 것 영어 목록, 많아야 8개 (예: curved katana, round tsuba guard, Japanese hakama, Chinese Qing robe, modern clothing).
  그림 모델이 이 인물에서 실제로 틀리기 쉬운 핵심만 고른다. 항목 하나하나가 검사에서 치명 결함이 되므로 비슷한 말을 여러 번 쓰지 않는다.
  검사에서만 쓰고 그림 지시에는 넣지 않는다.
- ③+ 고증 자료가 있으면 그것이 기준이다. period_notes와 appearance의 옷·머리·관모·무기·도구는 그 자료의 영어 문구를 따르고
  (자료에 없는 부품이나 장식, 예를 들어 칼의 손 보호판이나 감은 손잡이 끈을 더하지 않는다),
  같은 계층·성별 인물끼리 머리 모양과 머리 장식이 서로 어긋나지 않게 한다(한 인물에 금지한 이마 띠를 다른 인물에 쓰지 않는다),
  props와 attire는 그 자료의 항목(무기·도구 → props, 옷·머리 → attire)에서 고르며 id와 description을 그 항목 그대로 쓴다.
- props: 그림 모델이 흔히 잘못 그리는 시대 소품 중 주요 인물이 늘 지니는 **모양이 단단한 물건**(칼·창·활 같은 무기, 도구, 장신구), 많아야 4개.
  두건·옷·머리 모양처럼 몸에 걸친 것은 소품이 아니라 appearance에 쓴다.
  id(영문 소문자), name(한국어), owners(지니는 인물 id 목록),
  description(영어, 실제 생김새를 긍정형으로 구체적으로: 길이와 비율, 날·자루·고리·장식의 모양과 재질과 색),
  search(위키미디어 공용에서 이 소품의 실제 유물 사진을 찾을 검색어 3개. 각각 영어 2~4단어로 짧게(긴 문장은 결과가 없다).
  예: "ring pommel sword", "Silla sword", "hwandudaedo"). 없으면 빈 목록.
- attire: 그림 모델이 다른 시대·나라 옷(조선 한복의 고름, 기모노 옷깃, 사무에, 망건)으로 잘못 그리기 쉬운 **시대 의상과 머리 모양 기준**, 많아야 2개
  (예: 이 시대 평민 남자, 이 시대 여자). 사람 인물만 owners에 넣는다.
  id(영문 소문자), name(한국어), owners(이 옷차림을 따르는 인물 id 목록),
  description(영어, 긍정형으로: 저고리 길이와 여밈 방향, 깃 모양, 소매, 허리띠, 바지·치마, 신발, 머리 모양과 머리 장식),
  search(위키미디어 공용에서 그 시대 옷과 머리 모양이 보이는 실물 사진을 찾을 검색어 3개, 영어 2~4단어. 토용·벽화·인물 토우·복원 의상.
  예: "Silla clay figurine", "Goguryeo tomb mural", "Silla dogu"). 시대 의상이 문제 되지 않는 작품이면 빈 목록.
"""

CHECK_SCHEMA = _obj(
    {
        "defects": _arr(
            _obj({"code": _STR, "severity": {"type": "string", "enum": ["critical", "major", "minor"]}, "note": _STR})
        ),
    }
)

SHEET_CHECK_SCHEMA = _obj(
    {
        "parts": _arr(_obj({"id": _STR, "matches": {"type": "boolean"}, "severity": {"type": "string", "enum": ["critical", "major", "minor"]}, "note": _STR})),
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
- 대표가 잠근 부품 그림(칼·도구, 옷차림, 머리 모양)이 함께 있으면 그것이 기준이다. 글 명세와 부품 그림이 다르면 그림이 우선이고, 그 차이는 결함이 아니다.
  parts에 부품마다 시트 속 모양이 잠긴 부품 그림과 같은지(matches)와 다르면 어디가 다른지(note, 한국어 한 문장)를 적는다.
  다르면 severity를 정한다: 실루엣·구조가 다름(머리를 감싸거나 이마를 가로지르는 것이 생김, 칼날·칼집 모양, 손잡이와 칼날 사이 보호판의 모양·크기, 옷 길이·여밈 방향)은 critical,
  눈에 띄는 장식·색 차이는 major, 버클·끈 끝·소매 띠 폭 같은 작은 부속 차이는 minor.
  전신 정면·측면·뒷모습을 모두 본다. 얼굴 클로즈업만 맞고 전신 그림이 다르면 다른 것이다.
  잠긴 부품이 다루는 물건(그 칼, 그 옷, 그 머리 모양)의 차이는 parts에만 적고 defects에 다시 적지 않는다. 'never' 항목이라도 부품에 속하면 parts에만 적는다.
- 그다음 명세의 period_notes와 appearance 중 부품이 다루지 않는 것(얼굴, 나이, 체형, 색, 흉터 같은 고정 특징)을 그림과 맞춰 본다.
- 소품 시트가 함께 있으면 인물이 지닌 소품이 소품 시트와 같은 물건인지 본다. 다르면 치명이다.
- 치명(critical): 명세의 'never'에 있는 것이 보임, 시대·나라가 다른 무기나 복식(일본도, 코등이, 하카마, 기모노, 중국 청나라 옷 등), 글자·워터마크, 얼굴·손 해부학 붕괴.
  (아래 칼·머리 규칙은 그 물건의 잠긴 부품 그림이 없을 때만 쓴다. 잠긴 그림에 있는 모양은 결함이 아니다.)
  칼은 특히 엄격하게 본다: 명세가 코등이 없는 칼인데 손잡이와 칼날 사이에 둥근·네모 코등이가 있음, 일본도식으로 끈을 마름모로 감은 손잡이,
  휜 칼날이나 휜 칼집, 명세에 있는 고리자루(ring pommel)가 없음 — 이 중 하나라도 보이면 치명이다.
  명세와 다른 머리 모양(예: 높이 올린 쪽머리가 명세인데 낮게 묶음)도 이 인물의 기준을 바꾸므로 치명으로 적는다.
- 주요(major): 외모 명세와 다름(머리 모양·색, 의상 형태·길이·색, 고정 소품, 신발, 나이, 체형), 정면·측면·뒷모습이 서로 다른 사람처럼 보임, 고른 화풍과 다름.
- 경미(minor): 그 밖에 고치면 좋은 것.
- 글자, 제목, 라벨, 회차 번호가 그려져 있으면 치명이다. 화풍 마스터의 장식(떠다니는 조각, 반짝임)을 옮겨 그린 것은 주요다.
code에는 규칙 코드를 적는다(외모 불일치 K-1, 고증 H-1~H-8, 화풍 V-7, AI 결함 AI-xx). 같은 문제는 한 번만 적는다.
""" + PERIOD_JUDGE_NOTE + """

## 인물
{spec}
{note}{research}"""

SHEET_PASS = 80
# 점수는 결함 개수로 계산해요: 치명 하나면 불합격, 주요 둘까지는 합격선(80)
WEIGHT = {"critical": 30, "major": 10, "minor": 3}


def score_of(defects: list[dict[str, Any]]) -> int:
    return max(0, 100 - sum(WEIGHT.get(d.get("severity", "minor"), 3) for d in defects))


FIX_BATCH = 3  # 명세 고치기를 한 번에 넣는 인물 수
PART_MODEL = "fal-ai/nano-banana"  # 부품 후보는 작고 싸게 그려요. 대표가 고른 것만 기준이 돼요.
PART_VARIANTS = 4

PART_REVIEW_SCHEMA = _obj(
    {
        "variants": _arr(_obj({"index": {"type": "integer"}, "issues": _arr(_obj({"item": _STR, "severity": {"type": "string", "enum": ["critical", "major"]}}))})),
        "recommended": {"type": "integer"},
    }
)

PART_REVIEW_TASK = """# 과제: 부품 후보 살펴보기

첨부한 그림 앞의 {n}장은 아래 부품의 후보다(순서대로 index 0부터). {photo_note}
대표가 이 중 하나를 골라 잠그면, 이 작품의 모든 인물 시트와 컷이 이 모양을 그대로 따라 그린다.
후보마다 고증 자료·설명과 다른 점을 적어 대표가 고르는 것을 돕는다. 합격·불합격은 정하지 않는다.
- critical: 다른 시대·나라의 모양(코등이 있는 칼, 일본도식 마름모 손잡이 감기, 휜 칼날, 그 시대 이전의 고름,
  기모노 옷깃과 오비, 하카마, 자료에 없는 이마 띠·머리 장식), 글자·라벨.
- major: 설명과 다른 길이·비율·구조.
- 사소한 것은 적지 않는다. 문제가 없으면 빈 목록. item은 한국어로 짧게.
- recommended: 가장 맞는 후보 index.
""" + PERIOD_JUDGE_NOTE + """

## 작품 시대와 고증
{research}

## 부품
{part}
"""
RETRY_BUDGET_USD = 12.0  # ④+ 한 번 실행에서 '다시 그리기'에 쓸 수 있는 돈. 첫 그림은 늘 그리고, 넘으면 더 다시 그리지 않아요.

LINT_SCHEMA = _obj(
    {
        "characters": _arr(_obj({"id": _STR, "appearance": _STR, "period_notes": _STR, "never": _arr(_STR), "changes": _STR})),
        "props": _arr(_obj({"id": _STR, "description": _STR, "changes": _STR})),
    }
)

LINT_TASK = """# 과제: 그리기 전 명세 글 검사

아래 인물 명세와 소품·의상 명세를 그대로 이미지 모델에 넣어 시트를 그린다. 그림 한 장은 비싸고, 명세가 틀리면 몇 번을 다시 그려도 검사에서 떨어진다.
그리기 전에 글만 보고 서로 어긋나는 곳을 찾아 고쳐라.
1. 명세와 ③+ 고증 자료가 다름: 자료에 없는 부품·장식을 더함(예: 자료에 없는 손 보호판, 감은 손잡이 끈), 자료와 다른 머리 모양·관모·옷 구조.
2. appearance나 period_notes가 그 인물의 never에 있는 것을 묘사함(예: never에 이마 띠가 있는데 appearance에 forehead band).
3. 같은 계층·성별 인물끼리 머리 모양·머리 장식 규칙이 어긋남(한 인물에 금지한 것을 다른 인물이 함). 고증 자료를 따르는 쪽으로 맞춘다.
4. 이미지 모델이 다른 시대·나라 모양을 떠올리기 쉬운 모호한 말(robe, headwrap, guard, wrapped hilt)이 구조 설명 없이 쓰임. 맞는 구조를 긍정형으로 구체적으로 쓴다.
5. never가 8개를 넘거나 같은 말이 겹침. 핵심만 8개 이내로 남긴다.
고칠 것이 있는 인물·소품만 돌려준다. 고친 필드는 전체 새 문장으로 쓰고, 고치지 않는 필드는 빈 문자열(never는 빈 목록)로 둔다.
appearance는 70단어 이내. changes는 무엇을 왜 고쳤는지 한국어 한 문장. 고칠 것이 없으면 빈 목록.

## ③+ 고증 자료
{research}

## 인물 명세
{specs}

## 소품·의상 명세
{props}
"""
NEVER_MAX = 8  # 금지 목록이 길면 항목마다 치명 결함이 되어 점수가 0으로 떨어져요. 핵심만 남겨요.

MASTER_SCHEMA = _obj(
    {
        "people": _arr(_obj({"who": _STR, "hair": _STR, "headwear": _STR, "clothing": _STR})),
        "violations": _arr(_obj({"item": _STR, "character_ids": _arr(_STR), "note": _STR, "fix": _STR})),
    }
)

MASTER_TASK = """# 과제: 화풍 마스터의 소품 검사

첨부한 그림은 이 작품의 화풍 마스터다. 인물 시트를 그릴 때 선과 채색의 기준으로 참고 그림에 넣는다.
그런데 그림 모델은 참고 그림의 칼·옷·머리 모양까지 따라 그린다. 마스터에 아래 인물들의 '그리면 안 되는 것'이나
시대·나라가 다른 무기·복식(일본도와 코등이, 하카마, 기모노, 변발 등)이 보이면 모두 적어라.
""" + PERIOD_JUDGE_NOTE + """
머리 모양·머리 장식(망건, 이마 띠, 드러난 상투), 다른 시대 옷(고름, 일본식 옷깃)도 소품과 똑같이 본다.
- people: 먼저 그림 속 사람마다(얼굴만 보여도) 보이는 그대로 한국어로 적는다. 판단하지 말고 본 것만 쓴다.
  hair: 머리를 묶은 위치와 모양, 상투가 드러났는지. headwear: 이마나 머리에 두르거나 쓴 것(띠, 끈, 천, 관, 없으면 "없음"). clothing: 깃과 여밈, 소매, 띠.
- 그다음 people의 묘사를 ③+ 고증 자료의 머리 모양·관모·옷 항목과 하나씩 비교한다. 자료와 다른 것은 모두 violations에 적는다.
  특히 이마를 가로지르는 띠나 끈, 자료에 없는 머리 장식, 자료와 다른 상투 모양은 얼굴 클로즈업에서도 반드시 적는다.
- item: 보이는 것(한국어), character_ids: 그 소품을 따라 그리면 안 되는 인물 id, note: 어디에 어떻게 보이는지 한 문장.
- fix: 그림 편집 모델에 줄 영어 한 문장. 지우기만 하면 빈자리가 어색한 것(머리 모양, 옷)은 무엇으로 바꿀지 긍정형으로 쓴다
  (예: "Replace the forehead band and exposed topknot with hair tied in a simple low knot with a plain cloth tie").
- 없으면 빈 목록.

## 인물
{specs}
{research}"""

PHOTO_SCHEMA = _obj(
    {"photos": _arr(_obj({"index": {"type": "integer"}, "prop_ids": _arr(_STR), "real_photo": {"type": "boolean"}, "note": _STR}))}
)

PHOTO_TASK = """# 과제: 고증 참고 사진 확인

첨부한 그림 {n}장은 고증 참고 사진 후보다(순서대로 index 0부터). 사진마다 확인하라.
- prop_ids: 이 사진이 아래 소품·의상 중 어느 것의 실제 생김새를 분명하게 보여 주는지(없으면 빈 목록). 시대나 나라가 다르면 넣지 않는다.
- real_photo: 박물관·유물·실물 사진이면 true. 그 시대의 토용·벽화 사진과 박물관의 복원 의상 사진도 true다. AI로 만든 그림(구석의 별·반짝임 표시, 깨진 글자, 비현실적인 구조, 사진 같지만 고증과 맞지 않는 모양)이거나
  삽화·게임 그림이면 false. 확신이 없으면 false.
- note: 대표에게 보여줄 한 문장(예: "오른쪽 아래에 AI 생성 표시가 있고 칼날이 휘어 있어요").

## 소품·의상
{props}
"""

CLEAN_PROMPT = (
    "Edit reference image 1. Remove these things completely: {items}. {fixes} "
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


PART_KIND_KO = {"object": "소품", "attire": "옷차림", "hair": "머리 모양"}

NO_TEXT = (
    "Do not write any text anywhere in the image: no title, no names, no view labels, no captions, no numbers, no watermark. "
    "No floating particles, sparkles, shards, leaves or decorative effects."
)


def _prop_refs_text(props: list[dict[str, Any]], start: int) -> list[str]:
    return [
        (
            f"Reference image {start + i} is the approved hairstyle and headwear for this character ({p['description']}): "
            "copy exactly this hair construction and headwear, or the bare head if none is shown, in every view; the face follows the character description."
            if p.get("kind") == "hair"
            else f"Reference image {start + i} is the approved period costume design ({p['description']}): "
            "dress this character in exactly this cut of clothing (length, collar, closure, sleeves, belt, trousers or skirt, shoes); "
            + ("ignore the face, hair and headwear of the figure in this image, the hair follows the hairstyle reference; "
               if any(q.get("kind") == "hair" for q in props) else "copy its hairstyle construction too; ")
            + "colors and personal details follow the character description."
            if p.get("kind") == "attire"
            else f"Reference image {start + i} is the approved prop design for {p['name']} ({p['description']}): "
            "wherever this object appears, draw exactly this object with the same shape, fittings and colors."
        )
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
        "The hair and headwear on the small heads of the full-body views are exactly the same as in the head close-ups."
        if any(p.get("kind") == "hair" for p in props) else "",
        f"Style: {style}",
        "Pure flat white background with no texture.",
        NO_TEXT,
        f"Director's note: {note}" if note else "",
    ]
    return " ".join(p for p in parts if p)


def _prop_prompt(base: str, style: str, p: dict[str, Any], n_photos: int) -> str:
    if p.get("kind") == "hair":
        parts = [
            base,
            f"Hairstyle and headwear reference sheet for a Korean webtoon character: {p['description']}",
            "One adult head and shoulders with a calm neutral face and a plain collar, shown in front view, side view, back view "
            "and three-quarter view side by side, all with exactly the same hair and headwear.",
            f"Reference image(s) 1-{n_photos} are museum photos of this era's hairstyles (figurines or murals): copy the hair construction "
            "only, and redraw it cleanly in the style below." if n_photos else "",
            f"Style: {style}",
            "Pure flat white background with no texture.",
            NO_TEXT,
        ]
        return " ".join(x for x in parts if x)
    if p.get("kind") == "attire":
        parts = [
            base,
            f"Period costume reference sheet for a Korean webtoon: {p['description']}",
            "One plain adult figure with a simple neutral face, full body, front view and back view side by side, "
            "plus one close-up of the collar and closure and one close-up of the hairstyle from the side.",
            f"Reference image(s) 1-{n_photos} are museum photos of this era's real clothing and hairstyles (figurines, murals or reconstructions): "
            "copy the cut of the clothes, the collar, closure, sleeves, belt and hairstyle construction; ignore their material, cracks, colors and pose, "
            "and redraw them cleanly in the style below." if n_photos else "",
            f"Style: {style}",
            "Pure flat white background with no texture.",
            NO_TEXT,
        ]
        return " ".join(x for x in parts if x)
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


def _crit(defects: list[dict[str, Any]]) -> int:
    return sum(1 for d in defects if d.get("severity") == "critical")


def _stalled(tries: list[dict[str, Any]]) -> bool:
    """고쳐 그렸는데도 치명 결함이 줄지 않고 점수도 오르지 않으면, 같은 지시로 더 그려도 돈만 들어요."""
    if len(tries) < 2:
        return False
    a, b = tries[-2], tries[-1]
    return _crit(b["defects"]) >= _crit(a["defects"]) and b["score"] <= a["score"]


class _Budget:
    """여러 그림을 동시에 그려도 '다시 그리기' 비용을 한곳에서 세요."""

    def __init__(self, limit: float) -> None:
        self.limit, self.spent, self._lock = limit, 0.0, threading.Lock()

    def spend(self, entry: dict[str, Any]) -> None:
        with self._lock:
            self.spent += float(entry.get("cost_usd") or 0)

    def ok(self) -> bool:
        with self._lock:
            return self.limit <= 0 or self.spent < self.limit


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


def _fix_text(defects: list[dict[str, Any]], props: list[dict[str, Any]]) -> str:
    """다시 그릴 때 줄 고칠 점. 잠긴 부품과 다른 곳은 금지어를 쓰지 않고 '그 참고 그림과 똑같이'로 말해요
    (그림 모델은 지시에 나온 물건 이름을 오히려 그려 넣어요)."""
    idx = {p["id"]: i + 2 for i, p in enumerate(props)}
    out = []
    for d in defects:
        pid = d.get("part")
        if d.get("severity") == "minor" or pid not in idx:
            continue
        kind = next((p.get("kind") for p in props if p["id"] == pid), "object")
        what = {"hair": "the hair and headwear on every head, including the small heads of the full-body front, side and back views; "
                        "the forehead and hairline look exactly as in that reference",
                "attire": "the clothing cut, closure, belt and shoes in every view"}.get(kind, "this object's shape, size and fittings wherever it appears")
        out.append(f"Make {what} identical to reference image {idx[pid]}.")
    rest = _issue_lines([d for d in defects if not d.get("part")])
    if rest:
        out.append(f"Also fix: {rest}")
    return " ".join(out)


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


def _counts(defects: list[dict[str, Any]]) -> dict[str, int]:
    """점수만 보면 그림 솜씨 점수로 읽혀요. 명세·고증을 몇 개 어겼는지 함께 남겨요."""
    return {s: sum(1 for d in defects if d.get("severity") == s) for s in ("critical", "major")}


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
    # 부품 단계(parts): 부품 후보를 그려 대표가 고르게 해요. 조합 단계(compose): 잠근 부품으로 인물 시트를 그려요.
    mode = payload.get("mode") or ("compose" if only else "parts")
    redo_parts = [str(x) for x in payload.get("parts") or []]
    reuse = prev.get("kind") == "sheets" and bool(only or mode == "compose" or redo_parts)

    style_body = (ctx.get("input_bodies") or {}).get("style") or {}
    chosen = style_body.get("chosen")
    cands = style_body.get("candidates") or []
    if not (isinstance(chosen, int) and 0 <= chosen < len(cands)):
        raise StageInputError("④ 화풍에서 후보를 골라 승인해야 인물 시트를 그릴 수 있어요.")
    style = cands[chosen]["style_prompt"]
    medium = cands[chosen].get("medium")
    base = base_for(medium)
    masters = [m for m in (media.get(k) for k in (style_body.get("style_masters") or [])[:2]) if m]
    own = own_art(brief, media, 1)
    history = [h for h in (media.get_private(k) for k in (brief.get("historyRefs") or [])[:3]) if h]
    history = [thumbnail(h, 1280) for h in history]
    research_body = (ctx.get("input_bodies") or {}).get("research") or {}
    research = research_text(research_body)
    research_items = {it["id"]: it for it in research_body.get("items") or []} if research_body.get("kind") == "research" else {}

    # 1. 고정 명세: 고른 인물만 다시 그릴 때는 이전 명세를 쓰고, 대표 지시가 있으면 그 인물 명세에 반영해요
    #    (반영하지 않으면 ⑦ 작화가 예전 명세로 다시 그려요)
    edits: dict[str, str] = {}
    rule_suggestions: list[str] = []
    props: list[dict[str, Any]] = []
    if reuse:
        chars = [dict(c) for c in prev["characters"]]
        props = [dict(p) for p in (prev.get("parts") if prev.get("parts") is not None else prev.get("props")) or []]
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
                        # 대표 지시로 새로 막은 것을 앞에 두고, 전체는 핵심만 남겨요
                        c["never"] = list(dict.fromkeys([*u["never"], *(c.get("never") or [])]))[:NEVER_MAX + 2]
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
            c["never"] = [str(x) for x in c.get("never") or [] if str(x).strip()][:NEVER_MAX]
        props = []
        people = {c["id"] for c in chars if c.get("kind", "person") == "person"}
        for kind, items, n in (("object", r.data.get("props") or [], 4), ("attire", r.data.get("attire") or [], 2)):
            for p in items[:n]:
                owners = [_slug(o) for o in p.get("owners") or [] if _slug(o) in (people if kind == "attire" else seen)]
                if owners and (p.get("description") or "").strip():
                    pid = _slug(p.get("id", "")) or f"{kind}{len(props) + 1}"
                    while any(x["id"] == pid for x in props):
                        pid += "x"
                    props.append({"id": pid, "name": p.get("name", ""), "owners": owners, "kind": kind,
                                  "description": p["description"].strip(), "search": [str(x) for x in p.get("search") or []][:3]})
        # 주인공은 머리 모양도 부품으로 따로 골라 잠가요(이마 띠·상투처럼 그림 모델이 잘 틀려요)
        for c in chars:
            if c.get("role") == "main" and c.get("kind", "person") == "person" and (c.get("hair") or "").strip():
                props.append({"id": f"{c['id']}_hair", "name": f"{c.get('name', c['id'])} 머리 모양", "owners": [c["id"]], "kind": "hair",
                              "description": c["hair"].strip(), "search": []})

    out_base = f"series/{ctx['series']['id']}/sheets/{ctx['artifact_id']}"
    todo = [c for c in chars if not only or c["id"] in only]

    # 그리기 전에 명세 글을 먼저 검사해요. 명세끼리 어긋나면 몇 번을 다시 그려도 떨어져요. 그림 한 장보다 훨씬 싸요.
    spec_fixes: list[dict[str, str]] = []
    lint_props = [p for p in props if not only or set(p["owners"]) & {c["id"] for c in todo}]
    if not reuse and (research or any(c.get("never") for c in todo)):
        _report(ctx, "그리기 전 명세 글 검사 중")
        r = llm.json(
            system,
            LINT_TASK.format(
                research=research or "(없음)",
                specs="\n".join(_spec_json(c) for c in todo),
                props="\n".join(json.dumps({k: p.get(k) for k in ("id", "kind", "name", "owners", "description")}, ensure_ascii=False) for p in lint_props) or "(없음)",
            ),
            LINT_SCHEMA,
            effort="medium",
            max_tokens=32000,
        )
        costs.add(r.result.cost_entry())
        by_id = {c["id"]: c for c in todo}
        for u in r.data.get("characters") or []:
            c = by_id.get(_slug(u.get("id", "")))
            if not c:
                continue
            changed = False
            for k in ("appearance", "period_notes"):
                if (u.get(k) or "").strip() and u[k].strip() != c.get(k):
                    c[k] = u[k].strip()
                    changed = True
            if u.get("never"):
                c["never"] = [str(x) for x in u["never"] if str(x).strip()][:NEVER_MAX]
                changed = True
            if changed:
                spec_fixes.append({"id": c["id"], "name": c.get("name", ""), "changes": (u.get("changes") or "").strip()})
        pby = {p["id"]: p for p in lint_props}
        for u in r.data.get("props") or []:
            p = pby.get(_slug(u.get("id", "")))
            if p and (u.get("description") or "").strip() and u["description"].strip() != p["description"]:
                p["description"] = u["description"].strip()
                p.pop("passed", None)  # 명세가 바뀌었으니 다시 그려요
                spec_fixes.append({"id": p["id"], "name": p.get("name", ""), "changes": (u.get("changes") or "").strip()})
    budget = _Budget(float(brief.get("sheetRetryBudgetUsd") or RETRY_BUDGET_USD))

    if mode == "parts":
        # ── 부품 단계: 부품마다 후보 4장을 싸게 그려, 대표가 맞는 것을 골라 잠그게 해요 ──
        prop_todo = [p for p in props if not redo_parts or p["id"] in redo_parts]
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
        search_log: list[dict[str, Any]] = []
        # ③+ 고증 자료에서 확인한 실물 사진이 있으면 그것을 먼저 써요 (다시 찾지 않아요)
        for p in prop_todo:
            its = [research_items[p["id"]]] if p["id"] in research_items else (
                [x for x in research_items.values() if x.get("category") in ("hair", "headwear")] if p.get("kind") == "hair" else [])
            if photos_for.get(p["id"]) or not its:
                continue
            for ph in [ph for it in its for ph in it.get("photos") or []][:2]:
                data = media.get(ph["image"])
                if data:
                    photos_for.setdefault(p["id"], []).append(thumbnail(data, 1024))
                    found_photos.append({"prop": p["id"], **{k: ph.get(k, "") for k in ("image", "title", "page", "license", "artist")}})
        for p in prop_todo:
            if photos_for.get(p["id"]) or p.get("kind") == "hair":
                continue
            queries = p.get("search") or [p["description"].split(",")[0]]
            _report(ctx, f"{p['name']} 실물 사진 찾는 중")
            cands = []
            for c in commons.search_commons(queries, limit=6):
                data = commons.fetch(c["url"])
                if data:
                    cands.append((c, thumbnail(data, 1024)))
            log = {"prop": p["id"], "queries": queries, "candidates": len(cands), "accepted": 0, "notes": []}
            search_log.append(log)
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
                    log["accepted"] += 1
                elif ph.get("note") and len(log["notes"]) < 3:
                    log["notes"].append(ph["note"])


        def draw_variants(p: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
            local: list[dict[str, Any]] = []
            refs = [thumbnail(h, 1024) for h in photos_for.get(p["id"], [])[:2]]
            note = f" Director's note: {instruction}" if instruction and redo_parts else ""
            prompt = _prop_prompt(base, style, p, len(refs)) + note
            plain = _prop_prompt(base, style, p, 0) + note  # 실물 사진 없이 그릴 때
            variants = []
            failed = 0
            for k in range(PART_VARIANTS):
                seed = 11 + k + 100 * (ctx.get("attempt") or 1)
                try:
                    img = images.generate(prompt, seed=seed, aspect_ratio="4:3", references=refs or None, model=PART_MODEL)
                except NoImageError:
                    # 실물 사진 때문에 안전 필터에 걸리는 일이 있어요. 사진 없이 한 번 더 그려 보고, 그래도 안 되면 이 후보만 빼요.
                    try:
                        img = images.generate(plain, seed=seed + 50, aspect_ratio="4:3", model=PART_MODEL) if refs else None
                    except NoImageError:
                        img = None
                    if img is None:
                        failed += 1
                        continue
                local.append(img.cost_entry())
                data = trim_border(img.data)
                variants.append({"image": media.put(f"{out_base}/part-{p['id']}-{k + 1}.png", data), "data": data, "issues": []})
            if not variants:
                out = {**p, "variants": [], "recommended": 0, "photos": len(refs), "locked": None,
                       "error": "그림 모델이 이 부품을 그리지 못했어요. 생김새 설명을 바꿔 적고 이 부품만 다시 그려 주세요."}
                for k2 in ("image", "passed", "score", "defects", "as_ref", "stopped", "tries"):
                    out.pop(k2, None)
                return out, local
            r = llm.json(
                system,
                PART_REVIEW_TASK.format(
                    n=len(variants),
                    photo_note=f"뒤의 {len(refs)}장은 그 시대의 실물 사진이다. 모양은 이 사진을 기준으로 본다." if refs else "실물 사진은 없다. 고증 자료와 설명으로 본다.",
                    research=research or "(없음)",
                    part=json.dumps({k2: p.get(k2) for k2 in ("id", "kind", "name", "description")}, ensure_ascii=False),
                ),
                PART_REVIEW_SCHEMA,
                images=[thumbnail(v["data"], 768) for v in variants] + refs,
                effort="medium",
                max_tokens=8000,
            )
            local.append(r.result.cost_entry())
            for v in r.data.get("variants") or []:
                i = v.get("index")
                if isinstance(i, int) and 0 <= i < len(variants):
                    variants[i]["issues"] = [x for x in v.get("issues") or [] if x.get("item")]
            rec = r.data.get("recommended")
            out = {**p, "variants": [{"image": v["image"], "issues": v["issues"]} for v in variants],
                   "recommended": rec if isinstance(rec, int) and 0 <= rec < len(variants) else 0,
                   "photos": len(refs), "locked": None}
            if failed:
                out["error"] = f"후보 {failed}장은 그림 모델이 그리지 못해서 {len(variants)}장만 보여요."
            else:
                out.pop("error", None)
            for k2 in ("image", "passed", "score", "defects", "as_ref", "stopped", "tries"):
                out.pop(k2, None)
            return out, local

        if prop_todo:
            done = _map_progress(ctx, 4, draw_variants, prop_todo, "부품 후보 그리는 중")
            new_parts = {p["id"]: p for p, _ in done}
            for _, local in done:
                costs.extend(local)
            props = [new_parts.get(p["id"], p) for p in props]
        md = ["# ④+ 설정집: 부품 고르기", "", "부품마다 후보 4장을 그렸어요. 맞는 후보를 골라 잠그면, 잠근 부품으로 인물 시트를 그려요.", ""]
        for p in props:
            md += [f"## {PART_KIND_KO.get(p.get('kind', ''), '부품')}: {p['name']} ({p['id']})", f"- 누구: {', '.join(p['owners'])}", f"- 생김새: {p['description']}", ""]
        body = {
            "kind": "sheets",
            "stage": "sheets",
            "phase": "parts",
            "markdown": "\n".join(md),
            "characters": chars,
            "parts": props,
            "props": [],
            "style_prompt": style,
            "medium": medium,
            "model": model,
            "spec_fixes": spec_fixes,
            "photo_notes": photo_notes,
            "found_photos": found_photos,
            "search_log": search_log,
            "redrawn_parts": [p["id"] for p in prop_todo] if redo_parts else [],
            "summary": {"characters": len(chars), "passed": 0, "parts": len(props), "parts_locked": 0},
        }
        return body, list(costs)

    # ── 조합 단계: 모든 부품이 잠겨야 그려요(관문) ──
    missing = [p.get("name") or p["id"] for p in props if not p.get("locked")]
    if missing:
        raise StageInputError("잠그지 않은 부품이 있어요: " + ", ".join(missing) + ". ④+ 화면에서 부품마다 후보를 골라 잠가 주세요.")
    parts = props
    props = [{**p, "image": p["locked"], "passed": True, "as_ref": True} for p in parts]

    # 2. 화풍 마스터에 금지 소품(일본도 등)이나 장식 효과가 있으면, 마스터에서 그것만 지운 '깨끗한 마스터'를 만들어 모든 인물에 써요.
    #    지우고도 남아 있으면 그 소품과 엮인 인물만 마스터를 빼요.
    master_warnings: list[dict[str, Any]] = []
    no_master: set[str] = set()
    master_keys = [str(k) for k in (style_body.get("style_masters") or [])[:2]]
    # 깨끗한 마스터는 지금 고른 화풍 마스터와 같은 그림에서 만든 것만 다시 써요(화풍을 다시 고르면 새로 만들어요)
    same_master = prev.get("clean_from") == master_keys and prev.get("clean_research") == research_body.get("era")
    clean_keys: list[str] = list(prev.get("clean_masters") or []) if only and same_master else []
    ids = {c["id"] for c in todo}

    def screen(imgs: list[bytes]) -> list[dict[str, Any]]:
        r = llm.json(
            system,
            MASTER_TASK.format(specs="\n".join(_spec_json(c) for c in todo), research=f"\n## ③+ 고증 자료\n{research}\n" if research else ""),
            MASTER_SCHEMA,
            images=[thumbnail(m, 1024) for m in imgs],
            effort="medium",
            max_tokens=16000,
        )
        costs.add(r.result.cost_entry())
        return [
            {"item": v.get("item", ""), "note": v.get("note", ""), "fix": v.get("fix", ""),
             "characters": [_slug(x) for x in v.get("character_ids") or [] if _slug(x) in ids]}
            for v in r.data.get("violations") or []
        ]

    if clean_keys and all(media.get(k) for k in clean_keys):
        masters = [m for m in (media.get(k) for k in clean_keys) if m]
        # 다시 그리기: 지난번 마스터 검사 결과를 그대로 이어 써요
        master_warnings = [dict(v) for v in prev.get("master_warnings") or []]
        for v in master_warnings:
            no_master.update(x for x in v.get("characters") or [] if x in ids)
    elif masters:
        # 원본 마스터를 먼저 검사해요. 문제가 없으면 손대지 않아요(고쳐 그리다 오히려 새 문제를 만들 수 있어요).
        _report(ctx, "화풍 마스터의 소품 검사 중")
        raw, raw_found = masters, screen(masters)
        found = raw_found
        cleaned_any = False
        # 걸린 것만 지우거나 고쳐 그려요. 고친 뒤에 더 나빠지면 원본으로 돌아가요.
        for rnd in range(2):
            if not found:
                break
            _report(ctx, "화풍 마스터에서 금지 소품과 장식 지우는 중" + (" (두 번째)" if rnd else ""))
            items = "; ".join(v["item"] for v in found)
            fixes = " ".join(v["fix"].strip() for v in found if (v.get("fix") or "").strip())
            cleaned = []
            for i, m in enumerate(masters):
                img = images.generate(CLEAN_PROMPT.format(items=items, fixes=fixes), seed=3 + i + 10 * rnd, aspect_ratio="3:4", references=[m], model=model)
                costs.add(img.cost_entry())
                cleaned.append(trim_border(img.data))
            new_found = screen(cleaned)
            if len(new_found) >= len(found):
                break  # 고쳐도 줄지 않으면 더 고치지 않아요
            masters, found, cleaned_any = cleaned, new_found, True
        if cleaned_any:
            clean_keys = [media.put(f"{out_base}/master-clean-{i + 1}.png", m) for i, m in enumerate(masters)]
        else:
            masters, found = raw, raw_found
        # 그래도 남은 문제와 엮인 인물은 마스터 없이 그려요. 문제가 남은 그림은 참고 그림으로 넣지 않아요.
        for v in found:
            master_warnings.append(v)
            no_master.update(v["characters"])
    def ok(x: dict[str, Any]) -> bool:
        return x["score"] >= SHEET_PASS and not any(d["severity"] == "critical" for d in x["defects"])

    # 3. 잠긴 부품만 인물 시트의 참고 그림으로 써요.
    prop_imgs = {p["id"]: thumbnail(img, 1024) for p in props if (img := media.get(p["image"]))}

    def props_of(c: dict[str, Any]) -> list[dict[str, Any]]:
        mine = [p for p in props if c["id"] in p["owners"] and p["id"] in prop_imgs]
        # 머리 모양 1장 + 옷차림 1장 + 소품 2장까지
        return ([p for p in mine if p.get("kind") == "hair"][:1] + [p for p in mine if p.get("kind") == "attire"][:1]
                + [p for p in mine if p.get("kind") not in ("hair", "attire")][:2])

    def check(c: dict[str, Any], data: bytes, local: list[dict[str, Any]]) -> dict[str, Any]:
        mine = props_of(c)
        notes = []
        if masters:
            notes.append(f"두 번째부터 {len(masters)}장은 고른 화풍 마스터다. 선과 채색이 이 화풍과 같은지 본다(마스터의 인물·소품·장식은 기준이 아니다).")
        if mine:
            a = len(masters) + 2
            notes.append(f"{a}번째부터 {len(mine)}장은 대표가 잠근 부품 그림이다: "
                         + ", ".join(f"{p['id']}({p['name']})" for p in mine) + ". 이 순서대로 parts에 적는다.")
        r = llm.json(
            system,
            CHECK_TASK.format(
                master_note=" ".join(notes),
                spec=_spec_json(c),
                note=f"\n## 대표의 지시 (이것도 지켰는지 본다)\n{instruction}\n" if only and instruction else "",
                research=f"\n## ③+ 고증 자료 (이 시대 기준, 대표 승인)\n{research}\n" if research else "",
            ),
            SHEET_CHECK_SCHEMA,
            images=[thumbnail(data)] + [thumbnail(m, 640) for m in masters] + [thumbnail(prop_imgs[p["id"]], 640) for p in mine],
            effort="medium",
            max_tokens=16000,
        )
        local.append(r.result.cost_entry())
        names = {p["id"]: p["name"] for p in mine}
        verdict = {_slug(x.get("id", "")): x for x in r.data.get("parts") or []}
        part_checks = []
        for pid, nm in names.items():
            v = verdict.get(pid, {})
            x = {"id": pid, "name": nm, "matches": bool(v.get("matches", True)), "note": v.get("note", "")}
            if not x["matches"]:
                x["severity"] = v.get("severity") if v.get("severity") in WEIGHT else "critical"
            part_checks.append(x)
        # 잠긴 부품과 다르면 그 차이의 크기대로 깎아요. 모양·구조가 다르면 치명, 작은 부속 차이는 경미.
        defects = [*r.data["defects"], *({"code": "P-1", "severity": x["severity"], "note": f"{x['name']}: 잠긴 부품과 다름. {x['note']}".strip(), "part": x["id"]}
                                         for x in part_checks if not x["matches"])]
        return {"score": score_of(defects), "defects": defects, "part_checks": part_checks}

    def draw(c: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        local: list[dict[str, Any]] = []
        note = instruction if only else ""
        mine = props_of(c)
        n_masters = 0 if c["id"] in no_master else len(masters)
        # 대표가 직접 그린 그림이 있으면 화풍 기준으로 가장 앞에 넣어요 (선·채색·얼굴 구성을 따라 그려요)
        n_style = n_masters + len(own[:1])
        refs = own[:1] + masters[:n_masters] + [prop_imgs[p["id"]] for p in mine]
        tries: list[dict[str, Any]] = []
        # 대표가 고칠 곳을 지시했으면 첫 번째는 이전 시트를 그대로 두고 그 부분만 고쳐요. 두 번째는 새 명세로 새로 그려요.
        old = media.get(c["sheet"]) if edits.get(c["id"]) and c.get("sheet") else None
        stop = ""
        prop_refs = [prop_imgs[p["id"]] for p in mine]
        for k in range(3 if c.get("role") == "main" else 2):
            if tries and not budget.ok():
                stop = "budget"
                break
            seed = 1 + k + 10 * (ctx.get("attempt") or 1)
            prev_best = max(tries, key=lambda t: t["score"]) if tries else None
            fix = _fix_text(prev_best["defects"], mine) if prev_best else ""
            if k == 0 and old:
                img = images.generate(_edit_prompt(c, edits[c["id"]], mine), seed=seed, aspect_ratio="4:3", references=[old, *prop_refs], model=model)
            elif prev_best and fix and not (old and k == 1):
                # (대표 지시로 이전 시트를 고친 첫 그림이 떨어지면, 두 번째는 새 명세로 새로 그려요)
                # 다시 그리지 않고 지금까지 가장 나은 시트에서 걸린 곳만 고쳐요. 맞게 그린 얼굴·옷은 그대로 남아요.
                img = images.generate(_edit_prompt(c, fix, mine), seed=seed, aspect_ratio="4:3",
                                      references=[prev_best["data"], *prop_refs], model=model)
            else:
                img = images.generate(_sheet_prompt(base, style, c, n_style, mine, note), seed=seed, aspect_ratio="4:3", references=refs or None, model=model)
            local.append(img.cost_entry())
            if tries:
                budget.spend(img.cost_entry())
            data = trim_border(img.data)
            key = media.put(f"{out_base}/{c['id']}-{k + 1}.png", data)
            tries.append({"image": key, "data": data, **check(c, data, local)})
            if ok(tries[-1]):
                break
            if _stalled(tries):
                stop = "stalled"
                break
        best = max(tries, key=lambda t: (ok(t), t["score"]))
        return {
            **c,
            "sheet": best["image"],
            "score": best["score"],
            "defects": best["defects"],
            "passed": ok(best),
            "part_checks": best.get("part_checks") or [],
            "stopped": stop if not ok(best) else "",
            "candidates": [{"image": t["image"], "score": t["score"], **_counts(t["defects"]), "defects": t["defects"]} for t in tries],
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
        md += [f"## 잠근 {PART_KIND_KO.get(p.get('kind', ''), '부품')}: {p['name']} ({p['id']})", f"- 누구: {', '.join(p['owners'])}", f"- 생김새: {p['description']}", ""]
    body = {
        "kind": "sheets",
        "stage": "sheets",
        "phase": "sheets",
        "markdown": "\n".join(md),
        "characters": final,
        "parts": parts,
        "style_prompt": style,
        "medium": medium,
        "model": model,
        "redrawn": [c["id"] for c in todo] if only else [],
        "rule_suggestions": rule_suggestions,
        "master_warnings": master_warnings,
        "props": props,
        "clean_masters": clean_keys,
        "clean_from": master_keys,
        "spec_fixes": spec_fixes,
        "retry_spent_usd": round(budget.spent, 2),
        "clean_research": research_body.get("era"),
        "summary": {"characters": len(final), "passed": sum(1 for c in final if c.get("passed")),
                    "parts": len(parts), "parts_locked": len(parts)},
    }
    return body, list(costs)
