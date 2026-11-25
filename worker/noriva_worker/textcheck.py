"""글 단계(①②③⑤⑥) 스스로 점검하고 고쳐 쓰기.

초안을 쓴 뒤, 이 단계에 들어간 지침 규칙마다 지켰는지 점검표를 만들어요.
주요(major) 규칙을 어긴 게 있으면 걸린 규칙만 알려 주고 한 번 고쳐 쓴 뒤 다시 점검해요.
대표는 카드에서 규칙별 통과/미통과를 보고, 빨간 줄부터 읽으면 돼요.
"""

from __future__ import annotations

from typing import Any

from .visual import _arr, _obj, _report

_STR = {"type": "string"}

CHECK_SCHEMA = _obj(
    {
        "items": _arr(
            _obj(
                {
                    "code": _STR,
                    "ok": {"type": "boolean"},
                    "severity": {"type": "string", "enum": ["major", "minor"]},
                    "note": _STR,
                }
            )
        ),
        "summary": _STR,
    }
)

CHECK_TASK = """# 과제: 결과물 지침 점검

아래 결과물이 시스템 프롬프트의 지침 규칙을 지켰는지 규칙 코드별로 점검하라.
- 이 결과물에 해당하는 규칙만 적는다(다른 단계용 규칙은 뺀다). 많아야 25개, 중요한 규칙부터.
- ok: 지켰으면 true. note: 근거를 한 문장으로(어긴 경우 어디가 어떻게, 지킨 경우 짧게).
- severity: 어기면 작품 품질에 큰 영향이 있으면 major, 아니면 minor.
- 금지 표현 목록에 있는 말이 쓰였으면 해당 규칙 코드나 'BANNED'로 적는다.
- summary: 대표에게 보여줄 한 문장.

{extra}
## 결과물
{draft}
"""

# 단계마다 지침과 별도로 늘 점검하는 이야기 연결 규칙. 콘티가 대본을 놓치거나 컷끼리 끊기면 작화에서 돈을 써도 이야기가 이어지지 않아요.
STAGE_RULES = {
    "storyboard": [
        ("SB-1", "승인된 대본(아래 '승인된 앞 단계')의 모든 사건과 대사가 빠지거나 바뀌지 않고 같은 순서로 콘티에 들어 있다. 어기면 빠진 대사를 note에 적는다."),
        ("SB-2", "장면마다 연속성표(장소 배치, 시간·광원, 인물 위치와 화면 방향, 옷·머리·소품, 상태가 바뀌는 소품)가 있고, 컷이 그것과 모순되지 않는다."),
        ("SB-3", "마주 보는 인물의 좌우가 장면 안에서 바뀌지 않고(180도 규칙), 원인 컷 없이 결과 컷만 나오지 않으며, 컷마다 앞 컷에서 이어지는 것이 적혀 있다."),
    ],
    "plot": [
        ("PL-1", "이전 회차 요약·떡밥 장부·인물 설정과 모순되는 사실이 없다."),
        ("PL-2", "장면마다 장소와 시간이 분명하고, 장면이 바뀔 때 독자가 어디로 왔는지 알 수 있다."),
    ],
}


REVISE_NOTE = """

## 직전 초안
{draft}

## 지침 점검에서 걸린 규칙 (이것만 고쳐라)
{failed}

위 초안을 바탕으로 걸린 규칙을 모두 고친 완성본 전체를 다시 써라. 걸리지 않은 부분과 승인된 앞 단계의 내용은 바꾸지 마라."""


def _extra(stage: str, ctx: dict[str, Any]) -> str:
    rules = STAGE_RULES.get(stage)
    if not rules:
        return ""
    out = ["", "## 이 단계에서 늘 점검하는 규칙 (모두 major, 반드시 items에 넣는다)"] + [f"- {c} {t}" for c, t in rules]
    for label, text in ctx.get("inputs") or []:
        out += ["", f"## 승인된 앞 단계: {label}", text]
    return "\n".join(out) + "\n"


def _check(llm: Any, system: str, draft: str, stage: str = "", ctx: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    task = CHECK_TASK.format(draft=draft, extra=_extra(stage, ctx or {}))
    r = llm.json(system, task, CHECK_SCHEMA, effort="medium", max_tokens=12000)
    data = r.data
    # 이야기 연결 규칙은 지침에 없어도 늘 주요(major)로 봐요
    codes = {c for c, _ in STAGE_RULES.get(stage, [])}
    for i in data.get("items") or []:
        if i.get("code") in codes:
            i["severity"] = "major"
    return data, r.result.cost_entry()


def write_checked(stage: str, ctx: dict[str, Any], writer: Any, system: str, task: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """초안 → 점검 → (주요 규칙 위반이 있으면) 한 번 고쳐 쓰기 → 다시 점검."""
    costs: list[dict[str, Any]] = []
    r = writer.write(system, task)
    costs.append(r.cost_entry())
    draft = r.text
    body: dict[str, Any] = {"markdown": draft, "stage": stage}
    if not hasattr(writer, "json") or not (ctx.get("guidelines") or stage in STAGE_RULES):
        return body, costs

    _report(ctx, "지침으로 스스로 점검 중")
    check, cost = _check(writer, system, draft, stage, ctx)
    costs.append(cost)
    failed = [i for i in check["items"] if not i["ok"] and i["severity"] == "major"]
    first_failed = [i["code"] for i in failed]
    revised = False
    if failed:
        _report(ctx, f"걸린 규칙 {len(failed)}개 고쳐 쓰는 중")
        lines = "\n".join(f"- {i['code']}: {i['note']}" for i in failed)
        r2 = writer.write(system, task + REVISE_NOTE.format(draft=draft, failed=lines))
        costs.append(r2.cost_entry())
        if r2.text.strip():
            draft = r2.text
            revised = True
            check, cost = _check(writer, system, draft, stage, ctx)
            costs.append(cost)
    body["markdown"] = draft
    body["checks"] = {
        "items": check["items"],
        "summary": check.get("summary", ""),
        "revised": revised,
        "first_failed": first_failed,
    }
    return body, costs
