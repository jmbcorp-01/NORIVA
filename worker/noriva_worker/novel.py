"""웹소설 회차 단계 (docs/07): ⑥ 집필, ⑦ 퇴고·교정.

집필은 글 단계 공통 흐름(초안 → 지침 점검 → 한 번 고쳐 쓰기)을 쓰고, 분량이 기준을 벗어나면 분량만 맞춰 한 번 더 고쳐 써요.
퇴고·교정은 본문을 고친 결과와 고친 곳 목록을 함께 받아요. 금지 소재는 고치지 않고 경고로 올려 대표가 판단해요.
"""

from __future__ import annotations

import re
from typing import Any

from .textcheck import write_checked
from .visual import StageInputError, _arr, _obj, _report

# 한 회 분량 (공백 포함, 줄바꿈과 제목 줄 제외)
TARGET_MIN, TARGET_MAX = 5000, 5500
HARD_MIN, HARD_MAX = 4500, 6500
READ_CHARS_PER_MIN = 650  # 한국어 웹소설 평균 읽기 속도 어림값

_STR = {"type": "string"}

_NOISE = re.compile(r"^\s*(#.*|\*\s*\*\s*\*|-{3,}|={3,})\s*$")


def body_lines(text: str) -> list[str]:
    """제목(#), 장면 구분선을 뺀 본문 줄"""
    return [ln for ln in (text or "").splitlines() if ln.strip() and not _NOISE.match(ln)]


def char_count(text: str) -> int:
    """공백 포함 글자 수 (줄바꿈, 제목 줄, 장면 구분선 제외)"""
    return sum(len(ln.strip()) for ln in body_lines(text))


def stats(text: str) -> dict[str, Any]:
    n = char_count(text)
    no_space = sum(len(re.sub(r"\s", "", ln)) for ln in body_lines(text))
    return {
        "chars": n,
        "chars_no_space": no_space,
        "read_minutes": max(1, round(n / READ_CHARS_PER_MIN)),
        "in_range": HARD_MIN <= n <= HARD_MAX,
    }


LENGTH_NOTE = """

## 직전 원고
{draft}

## 분량 고치기 (이것만 고쳐라)
직전 원고는 공백 포함 {chars}자다(줄바꿈·제목 제외). 한 회는 {lo}~{hi}자여야 한다.
{how} 사건, 장면 순서, 대사의 뜻, 절단은 그대로 두고 완성본 전체를 다시 써라."""


def run_manuscript(ctx: dict[str, Any], writer: Any, system: str, task: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    body, costs = write_checked("manuscript", ctx, writer, system, task)
    st = stats(body["markdown"])
    body["length_fixed"] = False
    if not st["in_range"]:
        _report(ctx, f"분량 맞추는 중 ({st['chars']}자)")
        how = (
            "장면 안의 감각 묘사, 인물의 반응, 대사 사이의 행동을 늘려라. 새 사건은 넣지 마라."
            if st["chars"] < HARD_MIN
            else "반복 설명과 늘어지는 묘사를 줄여라. 장면은 빼지 마라."
        )
        r = writer.write(system, task + LENGTH_NOTE.format(draft=body["markdown"], chars=st["chars"], lo=TARGET_MIN, hi=TARGET_MAX, how=how))
        costs.append(r.cost_entry())
        if r.text.strip():
            fixed = stats(r.text)
            # 고친 쪽이 기준에 더 가까울 때만 바꿔요
            if abs(fixed["chars"] - (TARGET_MIN + TARGET_MAX) / 2) < abs(st["chars"] - (TARGET_MIN + TARGET_MAX) / 2):
                body["markdown"] = r.text
                body["length_fixed"] = True
                st = fixed
    body["stats"] = st
    return body, costs


CHANGE_KINDS = ["spelling", "style", "length", "repetition", "continuity", "other"]
WARNING_KINDS = ["banned", "sensitivity", "continuity", "length"]

COPYEDIT_SCHEMA = _obj(
    {
        "revised": _STR,
        "changes": _arr(_obj({"before": _STR, "after": _STR, "reason": _STR, "kind": {"type": "string", "enum": CHANGE_KINDS}})),
        "warnings": _arr(_obj({"kind": {"type": "string", "enum": WARNING_KINDS}, "quote": _STR, "note": _STR})),
        "summary": _STR,
    }
)

COPYEDIT_TASK = """# 과제: ⑦ 퇴고·교정

아래 '원고'를 퇴고·교정하라. 작가의 문체, 줄거리, 사건 순서, 대사의 뜻은 바꾸지 않는다. 틀린 것과 읽기 불편한 것만 최소한으로 고친다.

검사할 것
1. 맞춤법, 띄어쓰기, 문장 부호 (대사 속 의도된 구어·사투리는 그대로)
2. 문체: 번역투, AI 문체, 단조로운 끝맺음, 너무 긴 문단(모바일 기준 1~4문장)
3. 분량: 공백 포함 {lo}~{hi}자 (지금 {chars}자). 교정으로 크게 늘리거나 줄이지 않는다
4. 반복: 가까이에서 되풀이되는 단어·어미·문장 구조
5. 설정 충돌: 인물 이름·호칭·존댓말·나이·시간 순서·세계 규칙이 '승인된 앞 단계'와 앞 회차에 맞는지
6. 금지 소재(B-1~B-5)와 민감 사항(X-1~X-6): 고치지 말고 warnings에 원문 그대로 인용해 올린다
{banned}
출력
- revised: 고친 본문 전체 (첫 줄 회차 제목 포함, 원고와 같은 형식)
- changes: 고친 곳마다 before(원문 그대로 한 문장 이내), after, reason(한 문장), kind. 많아야 60개, 중요한 것부터
- warnings: 대표가 판단해야 할 것 (금지 소재, 민감 사항, 고칠 수 없는 설정 충돌, 분량)
- summary: 대표에게 보여줄 한두 문장

## 원고
{draft}
{inputs}{instruction}"""


def run_copyedit(ctx: dict[str, Any], writer: Any, system: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    src = (ctx.get("input_bodies") or {}).get("manuscript") or {}
    draft = src.get("markdown") if isinstance(src, dict) else None
    if not isinstance(draft, str) or not draft.strip():
        raise StageInputError("승인된 ⑥ 집필 원고가 없어요. ⑥ 집필을 먼저 승인해 주세요.")
    before = stats(draft)
    banned = [t["term"] for t in ctx.get("banned_terms") or [] if t.get("kind") == "dialogue_ko"]
    inputs = "".join(f"\n## 승인된 앞 단계: {label}\n{text}\n" for label, text in ctx.get("inputs") or [] if label != "집필 원고")
    task = COPYEDIT_TASK.format(
        lo=TARGET_MIN,
        hi=TARGET_MAX,
        chars=before["chars"],
        banned=("7. 금지 표현: " + "; ".join(banned) + "\n") if banned else "",
        draft=draft,
        inputs=inputs,
        instruction=f"\n## 대표의 추가 지시 (가장 우선)\n{ctx['instruction']}\n" if ctx.get("instruction") else "",
    )
    _report(ctx, "퇴고·교정 중")
    r = writer.json(system, task, COPYEDIT_SCHEMA, max_tokens=32000)
    data = r.data
    revised = (data.get("revised") or "").strip() or draft
    after = stats(revised)
    warnings = list(data.get("warnings") or [])
    if not after["in_range"]:
        warnings.append({"kind": "length", "quote": "", "note": f"분량이 {after['chars']}자예요. 기준은 {HARD_MIN}~{HARD_MAX}자예요. ⑥ 집필을 다시 생성하는 걸 권해요."})
    body = {
        "stage": "copyedit",
        "kind": "copyedit",
        "markdown": revised,
        "original": draft,
        "changes": data.get("changes") or [],
        "warnings": warnings,
        "summary": data.get("summary") or "",
        "stats": after,
        "stats_before": before,
    }
    return body, [r.result.cost_entry()]
