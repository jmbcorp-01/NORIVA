"""비용 장부에 바로 적기 (CLAUDE.md 1-3).

유료 호출의 결과 객체(그림 한 장, Claude 한 번)가 생기는 순간 장부에 한 줄을 적어요.
작업이 도중에 실패하거나 작업기가 꺼져도 이미 쓴 돈은 장부에 남아요.
작업기는 한 번에 작업 하나만 돌리므로, 작업을 시작할 때 기록 함수를 걸고 끝나면 풀어요.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Callable

log = logging.getLogger("noriva.ledger")

_sink: Callable[[dict[str, Any]], None] | None = None
_lock = threading.Lock()


def set_sink(fn: Callable[[dict[str, Any]], None] | None) -> None:
    global _sink
    _sink = fn


def record(entry: dict[str, Any]) -> bool:
    """장부에 적었으면 True. 기록 함수가 없거나 적기에 실패하면 False (끝날 때 한꺼번에 적어요)."""
    sink = _sink
    if sink is None:
        return False
    try:
        with _lock:
            sink(entry)
        return True
    except Exception:  # noqa: BLE001 - 기록 실패로 그림을 버리지 않아요. 끝날 때 다시 적어요.
        log.exception("비용 장부 기록 실패, 작업이 끝날 때 다시 적어요")
        return False
