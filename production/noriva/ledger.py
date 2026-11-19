"""Append-only record of every step: who did what, with which inputs, at what cost.

This log is the evidence of human creative contribution (choices and edits) and
the source for per-episode cost reports.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


class Ledger:
    def __init__(self, run_dir: Path):
        self.path = run_dir / "ledger.jsonl"
        run_dir.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        stage: str,
        actor: str,
        action: str,
        detail: dict[str, Any] | None = None,
        cost_usd: float = 0.0,
    ) -> None:
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stage": stage,
            "actor": actor,  # "agent:<name>" or "owner"
            "action": action,
            "cost_usd": round(cost_usd, 6),
            "detail": detail or {},
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def entries(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text(encoding="utf-8").splitlines() if line]

    def cost_by_stage(self) -> dict[str, float]:
        totals: dict[str, float] = {}
        for e in self.entries():
            totals[e["stage"]] = totals.get(e["stage"], 0.0) + e["cost_usd"]
        return {k: round(v, 4) for k, v in totals.items()}

    def total_cost(self) -> float:
        return round(sum(self.cost_by_stage().values()), 4)
