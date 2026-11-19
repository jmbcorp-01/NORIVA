"""jobs, artifacts 테이블 읽기·쓰기. 스키마는 web/src/db/schema.ts가 기준이에요."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

STAGE_LABEL_KO = {
    "concept": "기획안",
    "story": "스토리",
    "characters": "인물",
    "style": "화풍",
    "plot": "대본",
    "storyboard": "콘티",
    "art": "작화",
    "lettering": "말풍선",
    "review": "검수",
}


class Store:
    def __init__(self, url: str):
        self.conn = psycopg.connect(url, row_factory=dict_row, autocommit=True)

    # ── 작업 꺼내기 ──

    def has_pending(self) -> bool:
        """대기 중(재시도 예약 포함)이거나 실행 중인 작업이 있는지 봐요. 오래 멈춘 실행 중 작업은 세지 않아요."""
        row = self.conn.execute("select 1 from jobs where status = 'queued' or (status = 'running' and updated_at > now() - interval '2 hours') limit 1").fetchone()
        return row is not None

    def claim_next(self, worker_id: str) -> dict[str, Any] | None:
        """대기 중인 작업 하나를 잠그고 실행 중으로 바꿔요 (여러 실행기가 동시에 돌아도 겹치지 않음)."""
        with self.conn.transaction():
            row = self.conn.execute(
                """
                select * from jobs
                where status = 'queued' and run_after <= now()
                order by created_at
                for update skip locked
                limit 1
                """
            ).fetchone()
            if not row:
                return None
            return self._mark_running(row["id"], worker_id)

    def claim_by_id(self, job_id: str, worker_id: str) -> dict[str, Any] | None:
        with self.conn.transaction():
            row = self.conn.execute(
                "select * from jobs where id = %s and status = 'queued' for update skip locked", (job_id,)
            ).fetchone()
            if not row:
                return None
            return self._mark_running(row["id"], worker_id)

    def _mark_running(self, job_id: str, worker_id: str) -> dict[str, Any]:
        return self.conn.execute(
            """
            update jobs set status = 'running', attempts = attempts + 1, locked_by = %s,
              started_at = now(), updated_at = now()
            where id = %s returning *
            """,
            (worker_id, job_id),
        ).fetchone()

    # ── 결과 기록 ──

    def finish(self, job: dict[str, Any], body: dict[str, Any], costs: list[dict[str, Any]]) -> None:
        with self.conn.transaction():
            if job["artifact_id"]:
                self.conn.execute(
                    "update artifacts set status = 'pending_review', body = %s, updated_at = now() where id = %s and status = 'generating'",
                    (Jsonb(body), job["artifact_id"]),
                )
            self.conn.execute(
                "update jobs set status = 'done', error = null, finished_at = now(), updated_at = now() where id = %s",
                (job["id"],),
            )
            # 같은 제공자·모델 호출은 한 줄로 합쳐요 (작화 한 번에 호출이 수백 번이라)
            merged: dict[tuple[str, str], dict[str, Any]] = {}
            for cost in costs:
                m = merged.setdefault((cost["provider"], cost["model"]), {"units": {}, "cost_usd": 0.0, "calls": 0})
                m["calls"] += 1
                m["cost_usd"] += cost["cost_usd"]
                for k, v in cost["units"].items():
                    m["units"][k] = m["units"].get(k, 0) + v
            for (provider, model), m in merged.items():
                self.conn.execute(
                    """insert into cost_ledger (series_id, episode_id, job_id, provider, model, units, cost_usd)
                       values (%s, %s, %s, %s, %s, %s, %s)""",
                    (job["series_id"], job["episode_id"], job["id"], provider, model, Jsonb({**m["units"], "calls": m["calls"]}), round(m["cost_usd"], 4)),
                )

    def fail(self, job: dict[str, Any], error: str, max_attempts: int, retryable: bool) -> bool:
        """다시 시도할 수 있으면 대기열로 돌려보내고 True. 아니면 실패로 끝내고 False."""
        if retryable and job["attempts"] < max_attempts:
            delay = timedelta(seconds=30 * (2 ** (job["attempts"] - 1)))
            self.conn.execute(
                "update jobs set status = 'queued', error = %s, run_after = now() + %s, updated_at = now() where id = %s",
                (error[:2000], delay, job["id"]),
            )
            return True
        with self.conn.transaction():
            self.conn.execute(
                "update jobs set status = 'failed', error = %s, finished_at = now(), updated_at = now() where id = %s",
                (error[:2000], job["id"]),
            )
            if job["artifact_id"]:
                self.conn.execute(
                    "update artifacts set status = 'failed', body = %s, updated_at = now() where id = %s",
                    (Jsonb({"error": error[:2000]}), job["artifact_id"]),
                )
        return False

    # ── 에이전트에게 줄 맥락 ──

    def context(self, job: dict[str, Any]) -> dict[str, Any]:
        c = self.conn
        series = c.execute("select * from series where id = %s", (job["series_id"],)).fetchone()
        sources = c.execute(
            """select s.* from series_sources ss join sources s on s.id = ss.source_id
               where ss.series_id = %s order by s.name""",
            (job["series_id"],),
        ).fetchall()
        artifact = c.execute("select * from artifacts where id = %s", (job["artifact_id"],)).fetchone()
        episode = None
        if job["episode_id"]:
            episode = c.execute("select * from episodes where id = %s", (job["episode_id"],)).fetchone()

        inputs: list[tuple[str, str]] = []
        input_bodies: dict[str, Any] = {}
        for aid in artifact["input_artifact_ids"]:
            a = c.execute("select stage, body from artifacts where id = %s", (aid,)).fetchone()
            if a:
                input_bodies[a["stage"]] = a["body"]
                inputs.append((STAGE_LABEL_KO.get(a["stage"], a["stage"]), body_text(a["body"])))

        # 회차 단계는 바로 앞 회차들의 승인된 대본 요약을 함께 줘요 (설정 모순 방지)
        if episode and job["type"] == "plot":
            prev = c.execute(
                """select e.number, a.body from artifacts a join episodes e on e.id = a.episode_id
                   where a.series_id = %s and a.stage = 'plot' and a.status in ('approved','edited')
                     and e.number < %s order by e.number desc, a.created_at desc limit 3""",
                (job["series_id"], episode["number"]),
            ).fetchall()
            for p in reversed(prev):
                inputs.append((f"{p['number']}화 대본 (이전 회차)", body_text(p["body"])[:6000]))

        versions = c.execute(
            """select g.scope, v.version, v.body from guideline_versions v join guidelines g on g.id = v.guideline_id
               where v.id = any(%s::uuid[])""",
            (artifact["guideline_version_ids"],),
        ).fetchall()
        order = {"global": 0, "genre": 1, "series": 2, "episode": 3}
        versions.sort(key=lambda v: order[v["scope"]])

        previous = None
        previous_body = None
        payload = job["payload"] or {}
        if payload.get("base_artifact_id"):
            prev_row = c.execute("select body from artifacts where id = %s", (payload["base_artifact_id"],)).fetchone()
        elif artifact["attempt"] > 1:
            prev_row = c.execute(
                """select body from artifacts where series_id = %s and stage = %s
                   and episode_id is not distinct from %s and attempt = %s order by created_at desc limit 1""",
                (job["series_id"], job["type"], job["episode_id"], artifact["attempt"] - 1),
            ).fetchone()
        else:
            prev_row = None
        if prev_row:
            previous_body = prev_row["body"]
            previous = body_text(prev_row["body"])

        banned = []
        if job["type"] in ("lettering", "review"):
            banned = c.execute("select kind, term from banned_terms where active").fetchall()

        return {
            "series": series,
            "sources": sources,
            "episode": episode,
            "inputs": inputs,
            "guidelines": versions,
            "instruction": payload.get("instruction") or artifact["owner_note"],
            "previous_attempt": previous,
            "previous_body": previous_body,
            "input_bodies": input_bodies,
            "payload": payload,
            "artifact_id": str(artifact["id"]),
            "attempt": artifact["attempt"],
            "banned_terms": banned,
        }


def body_text(body: dict[str, Any]) -> str:
    if isinstance(body, dict) and isinstance(body.get("markdown"), str):
        return body["markdown"]
    return json.dumps(body, ensure_ascii=False, indent=2)
