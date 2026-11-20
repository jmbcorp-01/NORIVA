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

## 결과물
{draft}
"""

REVISE_NOTE = """

## 직전 초안
{draft}

## 지침 점검에서 걸린 규칙 (이것만 고쳐라)
{failed}

위 초안을 바탕으로 걸린 규칙을 모두 고친 완성본 전체를 다시 써라. 걸리지 않은 부분과 승인된 앞 단계의 내용은 바꾸지 마라."""


def _check(llm: Any, system: str, draft: str) -> tuple[dict[str, Any], dict[str, Any]]:
    r = llm.json(system, CHECK_TASK.format(draft=draft), CHECK_SCHEMA, effort="medium", max_tokens=12000)
    return r.data, r.result.cost_entry()


def write_checked(stage: str, ctx: dict[str, Any], writer: Any, system: str, task: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """초안 → 점검 → (주요 규칙 위반이 있으면) 한 번 고쳐 쓰기 → 다시 점검."""
    costs: list[dict[str, Any]] = []
    r = writer.write(system, task)
    costs.append(r.cost_entry())
    draft = r.text
    body: dict[str, Any] = {"markdown": draft, "stage": stage}
    if not hasattr(writer, "json") or not ctx.get("guidelines"):
        return body, costs

    _report(ctx, "지침으로 스스로 점검 중")
    check, cost = _check(writer, system, draft)
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
            check, cost = _check(writer, system, draft)
            costs.append(cost)
    body["markdown"] = draft
    body["checks"] = {
        "items": check["items"],
        "summary": check.get("summary", ""),
        "revised": revised,
        "first_failed": first_failed,
    }
    return body, costs
