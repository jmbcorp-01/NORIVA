from __future__ import annotations

from typing import Any, Protocol

from .llm import LLMResult
from .prompts import TEXT_STAGES, render_guidelines, render_task


class Writer(Protocol):
    def write(self, system: str, task: str) -> LLMResult: ...


class NotConnectedError(Exception):
    """아직 연결하지 않은 단계 (작화, 말풍선, 검수)."""


def run_stage(stage: str, ctx: dict[str, Any], writer: Writer) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """단계 하나를 실행하고 (결과물 본문, 비용 기록)을 돌려줘요."""
    if stage in TEXT_STAGES:
        system = render_guidelines(ctx["guidelines"])
        task = render_task(stage, ctx)
        r = writer.write(system, task)
        body = {"markdown": r.text, "stage": stage}
        cost = {"provider": "anthropic", "model": r.model, "units": r.usage, "cost_usd": r.cost_usd}
        return body, cost
    raise NotConnectedError(
        "작화·말풍선·검수 단계는 기존 제작 파이프라인(production/)을 이 실행기에 옮기는 다음 작업에서 연결돼요."
    )
