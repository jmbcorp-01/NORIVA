"""Claude 호출. 긴 지침은 시스템 프롬프트에 두고 캐시해서, 같은 작품을 여러 번 돌릴 때 비용을 줄여요."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

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

    def cost_entry(self) -> dict[str, Any]:
        return {"provider": "anthropic", "model": self.model, "units": self.usage, "cost_usd": self.cost_usd}


@dataclass
class JSONResult:
    data: dict[str, Any]
    result: LLMResult


@dataclass
class ResearchResult:
    """웹 검색으로 조사한 글과 근거 링크."""

    text: str
    links: list[dict[str, str]]
    searches: int
    results: list[LLMResult]

    def cost_entries(self) -> list[dict[str, Any]]:
        entries = [r.cost_entry() for r in self.results]
        if self.searches:
            entries.append(
                {
                    "provider": "anthropic",
                    "model": "web_search",
                    "units": {"searches": self.searches},
                    "cost_usd": round(self.searches * WEB_SEARCH_PRICE, 4),
                }
            )
        return entries


# 웹 검색 1회 요금 (1,000회에 10달러)
WEB_SEARCH_PRICE = 0.01


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
        return self._call(system, [{"type": "text", "text": task}], None, self.effort, 64000)

    def json(
        self,
        system: str,
        task: str,
        schema: dict[str, Any],
        images: list[bytes] | None = None,
        effort: str | None = None,
        max_tokens: int = 32000,
    ) -> JSONResult:
        """정해진 JSON 모양으로 답을 받아요 (작화 컷 목록, 검사 점수, 말풍선 위치처럼 코드가 읽는 결과)."""
        content: list[dict[str, Any]] = [
            {"type": "image", "source": {"type": "base64", "media_type": _media_type(img), "data": base64.standard_b64encode(img).decode()}}
            for img in images or []
        ]
        content.append({"type": "text", "text": task})
        r = self._call(system, content, schema, effort or self.effort, max_tokens)
        try:
            data = json.loads(r.text)
        except json.JSONDecodeError as e:
            raise TruncatedError(f"JSON 결과가 잘렸거나 깨졌어요: {e}") from e
        return JSONResult(data=data, result=r)

    def research(self, system: str, task: str, max_searches: int = 15, max_rounds: int = 6) -> ResearchResult:
        """웹 검색을 켜고 조사 글을 받아요. 인용한 페이지 주소를 모아 근거 링크로 돌려줘요.

        서버 쪽 검색이 길어지면 pause_turn으로 멈추는데, 받은 내용을 그대로 붙여 다시 보내면 이어서 해요.
        """
        messages: list[dict[str, Any]] = [{"role": "user", "content": task}]
        results: list[LLMResult] = []
        texts: list[str] = []
        links: dict[str, str] = {}
        searches = 0
        for _ in range(max_rounds):
            with self.client.beta.messages.stream(
                model=self.model,
                max_tokens=32000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                thinking={"type": "adaptive"},
                output_config={"effort": self.effort},
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}],
                messages=messages,
            ) as stream:
                msg = stream.get_final_message()
            if msg.stop_reason == "refusal":
                raise RefusedError("모델이 조사 요청을 거절했어요. 조사 방향을 바꿔 다시 실행해 주세요.")
            usage = _usage(msg.usage)
            results.append(LLMResult(text="", model=msg.model, usage=usage, cost_usd=cost_of(self.model, usage)))
            stu = getattr(msg.usage, "server_tool_use", None)
            searches += (getattr(stu, "web_search_requests", 0) or 0) if stu else 0
            for b in msg.content:
                if b.type != "text":
                    continue
                texts.append(b.text)
                for c in getattr(b, "citations", None) or []:
                    url = getattr(c, "url", None)
                    if url and url not in links:
                        links[url] = getattr(c, "title", None) or url
            if msg.stop_reason != "pause_turn":
                break
            # 멈춘 지점까지 받은 내용을 assistant 차례에 이어 붙여 다시 보내요 (계속하라는 말은 덧붙이지 않아요)
            kept = [b for b in msg.content if b.type != "fallback"]
            if messages[-1]["role"] == "assistant":
                messages[-1] = {"role": "assistant", "content": [*messages[-1]["content"], *kept]}
            else:
                messages.append({"role": "assistant", "content": kept})
        text = "".join(texts).strip()
        if not text:
            raise TruncatedError("조사 결과가 비어 있어요. 다시 실행해 주세요.")
        return ResearchResult(
            text=text,
            links=[{"title": t, "url": u} for u, t in links.items()],
            searches=searches,
            results=results,
        )

    def _call(
        self, system: str, content: list[dict[str, Any]], schema: dict[str, Any] | None, effort: str, max_tokens: int
    ) -> LLMResult:
        # 긴 출력(대본, 콘티)이 많아서 스트리밍으로 받고 마지막 메시지만 써요.
        # 정책상 거절되면 서버가 다른 모델로 이어서 처리하도록 fallbacks를 켜 둬요.
        output_config: dict[str, Any] = {"effort": effort}
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        with self.client.beta.messages.stream(
            model=self.model,
            max_tokens=max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config=output_config,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
        ) as stream:
            msg = stream.get_final_message()

        if msg.stop_reason == "refusal":
            raise RefusedError("모델이 이 요청을 거절했어요. 지시나 소재 표현을 바꿔 다시 생성해 주세요.")
        text = "".join(b.text for b in msg.content if b.type == "text").strip()
        if msg.stop_reason == "max_tokens":
            if schema is not None:
                raise TruncatedError("결과가 길이 한도에서 잘렸어요. 컷 수를 줄이거나 나눠서 다시 생성해 주세요.")
            text += "\n\n> (출력이 길이 한도에서 잘렸어요. 범위를 나눠 다시 생성해 주세요.)"
        usage = _usage(msg.usage)
        return LLMResult(text=text, model=msg.model, usage=usage, cost_usd=cost_of(self.model, usage))


class TruncatedError(Exception):
    pass


def _usage(u: Any) -> dict[str, int]:
    return {
        "input_tokens": u.input_tokens or 0,
        "output_tokens": u.output_tokens or 0,
        "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
    }


def _media_type(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"
