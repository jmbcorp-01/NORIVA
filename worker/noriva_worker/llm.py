"""Claude 호출. 긴 지침은 시스템 프롬프트에 두고 캐시해서, 같은 작품을 여러 번 돌릴 때 비용을 줄여요."""

from __future__ import annotations

from dataclasses import dataclass

import anthropic

# 달러 / 100만 토큰 (claude-opus-5-5 기준, 2026-11)
PRICES = {
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20, "cache_write": 5.00},
}


@dataclass
class LLMResult:
    text: str
    model: str
    usage: dict[str, int]
    cost_usd: float


class RefusedError(Exception):
    pass


def cost_of(model: str, usage: dict[str, int]) -> float:
    p = PRICES.get(model) or PRICES["claude-opus-5-5"]
    return round(
        (
            usage.get("input_tokens", 0) * p["input"]
            + usage.get("output_tokens", 0) * p["output"]
            + usage.get("cache_read_input_tokens", 0) * p["cache_read"]
            + usage.get("cache_creation_input_tokens", 0) * p["cache_write"]
        )
        / 1_000_000,
        4,
    )


class TextModel:
    def __init__(self, model: str, effort: str, client: anthropic.Anthropic | None = None):
        self.model = model
        self.effort = effort
        self.client = client or anthropic.Anthropic()

    def write(self, system: str, task: str) -> LLMResult:
        # 긴 출력(대본, 콘티)이 많아서 스트리밍으로 받고 마지막 메시지만 써요.
        # 정책상 거절되면 서버가 다른 모델로 이어서 처리하도록 fallbacks를 켜 둬요.
        with self.client.beta.messages.stream(
            model=self.model,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": self.effort},
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": task}],
        ) as stream:
            msg = stream.get_final_message()

        if msg.stop_reason == "refusal":
            raise RefusedError("모델이 이 요청을 거절했어요. 지시나 소재 표현을 바꿔 다시 생성해 주세요.")
        text = "".join(b.text for b in msg.content if b.type == "text").strip()
        if msg.stop_reason == "max_tokens":
            text += "\n\n> (출력이 길이 한도에서 잘렸어요. 범위를 나눠 다시 생성해 주세요.)"
        u = msg.usage
        usage = {
            "input_tokens": u.input_tokens or 0,
            "output_tokens": u.output_tokens or 0,
            "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
        }
        return LLMResult(text=text, model=msg.model, usage=usage, cost_usd=cost_of(self.model, usage))
