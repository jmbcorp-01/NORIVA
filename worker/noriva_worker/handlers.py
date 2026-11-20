from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

from .llm import LLMResult
from .prompts import TEXT_STAGES, render_guidelines, render_task
from .sheets import run_sheets
from .style import run_style
from .visual import ArtSettings, run_art, run_lettering, run_review


class Writer(Protocol):
    def write(self, system: str, task: str) -> LLMResult: ...


@dataclass
class Tools:
    """단계 실행에 쓰는 제공자 묶음. 그림 생성기는 작화 단계에서 처음 필요할 때 만들어요(FAL_KEY 없이도 글 단계는 돌게)."""

    writer: Any
    media: Any = None
    image_factory: Callable[[], Any] | None = None
    art: ArtSettings = field(default_factory=ArtSettings)
    _images: Any = None

    def images(self):
        if self._images is None:
            if self.image_factory is None:
                raise RuntimeError("그림 생성기가 설정되지 않았어요")
            self._images = self.image_factory()
        return self._images


def run_stage(stage: str, ctx: dict[str, Any], tools: Tools) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """단계 하나를 실행하고 (결과물 본문, 비용 기록 목록)을 돌려줘요."""
    if stage == "style":
        return run_style(ctx, tools.writer, tools.images(), tools.media)
    if stage == "sheets":
        return run_sheets(ctx, tools.writer, tools.images(), tools.media)
    if stage in TEXT_STAGES:
        r = tools.writer.write(render_guidelines(ctx["guidelines"]), render_task(stage, ctx))
        return {"markdown": r.text, "stage": stage}, [r.cost_entry()]
    if stage == "art":
        return run_art(ctx, tools.writer, tools.images(), tools.media, tools.art)
    if stage == "lettering":
        return run_lettering(ctx, tools.writer, tools.media, tools.art)
    if stage == "review":
        return run_review(ctx, tools.writer, tools.art)
    raise ValueError(f"알 수 없는 단계: {stage}")
