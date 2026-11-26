"""jobs, artifacts 테이블 읽기·쓰기. 스키마는 web/src/db/schema.ts가 기준이에요."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

STAGE_LABEL_KO = {
    "concept": "기획안",
    "story": "스토리",
    "characters": "인물",
    "research": "고증 자료",
    "style": "화풍",
    "sheets": "인물 시트",
    "plot": "대본",
    "storyboard": "콘티",
    "art": "작화",
    "lettering": "말풍선",
    "review": "검수",
    "manuscript": "집필 원고",
    "copyedit": "퇴고본",
}


class Store:
    def __init__(self, url: str):
        self.conn = psycopg.connect(url, row_factory=dict_row, autocommit=True)

    # ── 작업 꺼내기 ──

    def has_pending(self) -> bool:
        """대기 중(재시도 예약 포함)이거나 실행 중인 작업이 있는지 봐요. 오래 멈춘 실행 중 작업은 세지 않아요."""
        row = self.conn.execute("select 1 from jobs where status = 'queued' or (status = 'running' and updated_at > now() - interval '2 hours') limit 1").fetchone()
        return row is not None

    def reclaim_stale(self, max_attempts: int, minutes: int = 30) -> list[dict[str, Any]]:
        """작업 서버가 꺼져서(메모리 초과, 배포 교체) '실행 중'에 묶인 작업을 되살려요.
        진행 기록이 오래 멈춘 작업만 봐요. 시도 횟수가 남았으면 다시 대기열에, 아니면 실패로 끝내요."""
        rows = self.conn.execute(
            "select * from jobs where status = 'running' and updated_at < now() - %s",
            (timedelta(minutes=minutes),),
        ).fetchall()
        out = []
        for job in rows:
            again = self.fail(job, f"작업 서버가 도중에 멈췄어요 ({minutes}분 넘게 진행 없음). 다시 시작해요.", max_attempts, retryable=True)
            out.append({"id": job["id"], "requeued": again})
        return out

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
              started_at = now(), updated_at = now(), progress = null
            where id = %s returning *
            """,
            (worker_id, job_id),
        ).fetchone()

    # ── 진행 상황 ──

    def set_progress(self, job_id: str, step: str, done: int | None = None, total: int | None = None) -> None:
        """화면에 보여 줄 진행 상황을 남겨요. 실패해도 작업은 계속해요."""
        p: dict[str, Any] = {"step": step, "at": datetime.now(timezone.utc).isoformat()}
        if done is not None:
            p["done"] = done
        if total is not None:
            p["total"] = total
        try:
            self.conn.execute("update jobs set progress = %s, updated_at = now() where id = %s and status = 'running'", (Jsonb(p), job_id))
        except Exception:  # noqa: BLE001 - 진행 표시는 부가 기능
            pass

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
            # 호출하자마자 장부에 적은 비용(recorded)은 다시 적지 않아요.
            # 남은 것(예전 이어 그리기 기록 등)만 같은 제공자·모델끼리 한 줄로 합쳐 적어요.
            merged: dict[tuple[str, str], dict[str, Any]] = {}
            for cost in costs:
                if cost.get("recorded"):
                    continue
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

    def record_cost(self, job: dict[str, Any], cost: dict[str, Any]) -> None:
        """유료 호출 한 번의 비용을 바로 장부에 적어요. 작업이 실패해도 남아요."""
        self.conn.execute(
            """insert into cost_ledger (series_id, episode_id, job_id, provider, model, units, cost_usd)
               values (%s, %s, %s, %s, %s, %s, %s)""",
            (job["series_id"], job["episode_id"], job["id"], cost["provider"], cost["model"], Jsonb({**cost["units"], "calls": 1}), round(cost["cost_usd"], 4)),
        )

    def fail(self, job: dict[str, Any], error: str, max_attempts: int, retryable: bool, partial: dict[str, Any] | None = None) -> bool:
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
                    (Jsonb({**(partial or {}), "error": error[:2000], "job_id": str(job["id"])}), job["artifact_id"]),
                )
            if job["type"] == "scout":
                self.conn.execute(
                    "update scout_runs set status = 'failed', error = %s, updated_at = now() where job_id = %s",
                    (error[:2000], job["id"]),
                )
        return False

    # ── 소재 발굴 ──

    def scout_auto_enabled(self) -> bool:
        """소재 발굴 자동 실행이 켜져 있는지. 대표가 '소재 발굴' 화면에서 켜야만 켜져요 (기본 꺼짐)."""
        row = self.conn.execute("select value from studio_settings where key = 'scout_auto'").fetchone()
        return bool(row) and row["value"] == "on"

    def create_scout(self, trigger: str, focus: str = "", skip_if_recent_days: int = 0) -> dict[str, Any] | None:
        """소재 발굴 작업과 실행 기록을 만들어요. 최근에 이미 돌았으면(주간 예약 중복) 만들지 않아요."""
        with self.conn.transaction():
            if skip_if_recent_days:
                recent = self.conn.execute(
                    "select 1 from scout_runs where trigger = %s and status <> 'failed' and created_at > now() - %s limit 1",
                    (trigger, timedelta(days=skip_if_recent_days)),
                ).fetchone()
                if recent:
                    return None
            job = self.conn.execute(
                "insert into jobs (type, payload) values ('scout', %s) returning *", (Jsonb({"focus": focus}),)
            ).fetchone()
            run = self.conn.execute(
                "insert into scout_runs (job_id, trigger, focus) values (%s, %s, %s) returning id",
                (job["id"], trigger, focus),
            ).fetchone()
            payload = {"focus": focus, "run_id": str(run["id"])}
            return self.conn.execute(
                "update jobs set payload = %s where id = %s returning *", (Jsonb(payload), job["id"])
            ).fetchone()

    def scout_context(self, job: dict[str, Any]) -> dict[str, Any]:
        c = self.conn
        payload = job["payload"] or {}
        run = c.execute("select * from scout_runs where job_id = %s", (job["id"],)).fetchone()
        sources = [r["name"] for r in c.execute("select name from sources order by name").fetchall()]
        pending = [
            r["name"]
            for r in c.execute(
                "select body->>'name' as name from source_candidates where status = 'pending' order by created_at desc limit 40"
            ).fetchall()
        ]
        dismissed = c.execute(
            """select body->>'name' as name, dismiss_reason as reason from source_candidates
               where status = 'dismissed' order by updated_at desc limit 30"""
        ).fetchall()
        adopted = [
            r["name"]
            for r in c.execute(
                "select body->>'name' as name from source_candidates where status = 'adopted' order by updated_at desc limit 20"
            ).fetchall()
        ]
        titles = [r["title"] for r in c.execute("select title from series order by created_at desc limit 30").fetchall()]
        last = c.execute(
            "select report from scout_runs where status = 'done' and report is not null order by created_at desc limit 1"
        ).fetchone()
        return {
            "run_id": str(run["id"]) if run else payload.get("run_id"),
            "focus": payload.get("focus") or (run["focus"] if run else ""),
            # 라이브러리와 아직 검토 안 한 후보 모두와 겹치지 않게 해요
            "existing_sources": sources + pending,
            "dismissed": [dict(d) for d in dismissed],
            "adopted": adopted,
            "series_titles": titles,
            "last_summary": (last["report"] or {}).get("summary", "") if last else "",
            "count": int(payload.get("count") or 8),
        }

    def finish_scout(self, job: dict[str, Any], report: dict[str, Any], candidates: list[dict[str, Any]], costs: list[dict[str, Any]]) -> None:
        with self.conn.transaction():
            run = self.conn.execute(
                "update scout_runs set status = 'done', report = %s, error = null, updated_at = now() where job_id = %s returning id",
                (Jsonb(report), job["id"]),
            ).fetchone()
            if run is None:  # 실행 기록 없이 들어온 작업이면 새로 만들어요
                run = self.conn.execute(
                    "insert into scout_runs (job_id, status, report) values (%s, 'done', %s) returning id",
                    (job["id"], Jsonb(report)),
                ).fetchone()
            for cand in candidates:
                self.conn.execute(
                    "insert into source_candidates (run_id, body) values (%s, %s)", (run["id"], Jsonb(cand))
                )
            self.finish(job, {}, costs)

    def source_for_fill(self, job: dict[str, Any]) -> dict[str, Any] | None:
        sid = (job["payload"] or {}).get("source_id")
        if not sid:
            return None
        return self.conn.execute("select * from sources where id = %s", (sid,)).fetchone()

    def finish_source_fill(self, job: dict[str, Any], source: dict[str, Any], values: dict[str, Any], costs: list[dict[str, Any]]) -> list[str]:
        """비어 있는 칸만 채워요. 대표가 쓴 내용은 덮지 않아요. 채운 칸 이름을 돌려줘요."""
        filled: list[str] = []
        sets: list[str] = []
        params: list[Any] = []
        for col in ("era", "summary", "visual_notes", "caution"):
            if not (source.get(col) or "").strip() and values.get(col):
                sets.append(f"\"{col}\" = %s")
                params.append(values[col])
                filled.append(col)
        for col in ("rules", "references", "overlap_works"):
            if not source.get(col) and values.get(col):
                sets.append(f"\"{col}\" = %s")
                params.append(Jsonb(values[col]))
                filled.append(col)
        # 분류는 새 항목을 만들 때 대표가 골랐으면 그대로 둬요 (payload.category_unknown일 때만 바꿈)
        if (job["payload"] or {}).get("category_unknown") and values.get("category"):
            sets.append("category = %s")
            params.append(values["category"])
            filled.append("category")
        with self.conn.transaction():
            if sets:
                self.conn.execute(
                    f"update sources set {', '.join(sets)}, updated_at = now() where id = %s", (*params, source["id"])
                )
            self.finish(job, {}, costs)
        return filled

    # ── 연재 설정 채우기 ──

    def series_meta_context(self, job: dict[str, Any]) -> dict[str, Any] | None:
        c = self.conn
        series = c.execute("select * from series where id = %s", (job["series_id"],)).fetchone()
        if not series:
            return None
        sources = c.execute(
            """select s.name, s.summary from series_sources ss join sources s on s.id = ss.source_id
               where ss.series_id = %s order by s.name""",
            (job["series_id"],),
        ).fetchall()
        inputs: list[tuple[str, str]] = []
        for stage in ("concept", "story", "characters"):
            a = c.execute(
                """select body from artifacts where series_id = %s and episode_id is null and stage = %s
                   and status in ('approved','edited') order by updated_at desc limit 1""",
                (job["series_id"], stage),
            ).fetchone()
            if a:
                inputs.append((STAGE_LABEL_KO[stage], body_text(a["body"])))
        return {"series": series, "sources": sources, "inputs": inputs}

    def finish_series_meta(self, job: dict[str, Any], series: dict[str, Any], values: dict[str, str], costs: list[dict[str, Any]]) -> list[str]:
        """비어 있는 칸만 채워요 (제목은 '제목 미정'도 빈 칸으로 봐요)."""
        cols = {"title": "title", "titleEn": "title_en", "logline": "logline", "loglineEn": "logline_en", "rootNote": "root_note", "rootNoteEn": "root_note_en"}
        sets, params, filled = [], [], []
        for key, col in cols.items():
            cur = (series.get(col) or "").strip()
            empty = not cur or (col == "title" and cur == "제목 미정")
            if empty and values.get(key):
                sets.append(f'"{col}" = %s')
                params.append(values[key])
                filled.append(col)
        with self.conn.transaction():
            if sets:
                self.conn.execute(
                    f"update series set {', '.join(sets)}, updated_at = now() where id = %s", (*params, series["id"])
                )
            self.finish(job, {}, costs)
        return filled

    def finish_style_scout(self, job: dict[str, Any], works: list[dict[str, Any]], costs: list[dict[str, Any]]) -> None:
        """찾은 참고작을 작품 설정(brief.styleSuggestions)에 넣어요. 새로 찾으면 전에 고른 것은 풀어요."""
        data = {"at": datetime.now(timezone.utc).isoformat(), "works": works}
        with self.conn.transaction():
            self.conn.execute(
                """update series set brief = (brief - 'styleChoice') || jsonb_build_object('styleSuggestions', %s::jsonb),
                   updated_at = now() where id = %s""",
                (json.dumps(data, ensure_ascii=False), job["series_id"]),
            )
            self.finish(job, {}, costs)

    # ── 표지 만들기 ──

    def cover_context(self, job: dict[str, Any]) -> dict[str, Any] | None:
        """연재 설정과 같은 승인 자료에, 대표의 요청과 지난 시도에서 저장한 결과(saved)를 더해요."""
        ctx = self.series_meta_context(job)
        if ctx is None:
            return None
        p = job.get("payload") or {}
        ctx["instruction"] = (p.get("instruction") or "").strip()
        ctx["count"] = p.get("count")
        ctx["saved"] = p.get("saved") or {}
        return ctx

    def save_job_result(self, job: dict[str, Any], part: dict[str, Any]) -> None:
        """돈을 쓴 결과를 바로 작업 기록(payload.saved)에 남겨요. 다시 시작하면 이어서 해요 (CLAUDE.md 1-1)."""
        row = self.conn.execute(
            """update jobs set payload = jsonb_set(payload, '{saved}', coalesce(payload->'saved', '{}'::jsonb) || %s::jsonb),
               updated_at = now() where id = %s returning payload""",
            (json.dumps(part, ensure_ascii=False), job["id"]),
        ).fetchone()
        if row:
            job["payload"] = row["payload"]

    def finish_cover(self, job: dict[str, Any], result: dict[str, Any], costs: list[dict[str, Any]]) -> bool:
        """새 표지 후보를 작품 설정(brief.aiCovers)의 앞에 넣어요. 표지가 아직 없으면 첫 장을 표지로 써요.
        표지를 바꿨으면 True."""
        keys = result["keys"]
        with self.conn.transaction():
            s = self.conn.execute("select cover_url, brief from series where id = %s for update", (job["series_id"],)).fetchone()
            old = list((s["brief"] or {}).get("aiCovers") or [])
            covers = (keys + [k for k in old if k not in keys])[:12]
            set_cover = not (s["cover_url"] or "").strip()
            self.conn.execute(
                """update series set brief = brief || jsonb_build_object('aiCovers', %s::jsonb),
                   cover_url = case when %s then %s else cover_url end, updated_at = now() where id = %s""",
                (json.dumps(covers), set_cover, keys[0], job["series_id"]),
            )
            note = f"AI가 표지 후보 {len(keys)}장을 그렸어요" + (f": {result['summary']}" if result.get("summary") else "")
            if result.get("skipped"):
                note += f" (안전 필터로 {result['skipped']}장 빠짐)"
            if set_cover:
                note += ". 표지가 없어서 첫 장을 표지로 썼어요"
            self.conn.execute(
                """insert into decision_ledger (series_id, actor, action, before, after, note)
                   values (%s, 'NORIVA AI', 'cover_ai', %s, %s, %s)""",
                (job["series_id"], Jsonb({"coverUrl": s["cover_url"]}), Jsonb({"candidates": keys, "coverUrl": keys[0] if set_cover else s["cover_url"]}), note),
            )
            self.finish(job, {}, costs)
        return set_cover

    def episode_meta_context(self, job: dict[str, Any]) -> dict[str, Any] | None:
        c = self.conn
        ep = c.execute("select * from episodes where id = %s", (job["episode_id"],)).fetchone()
        series = c.execute("select title from series where id = %s", (job["series_id"],)).fetchone()
        if not ep or not series:
            return None
        story = c.execute(
            """select body from artifacts where series_id = %s and episode_id is null and stage = 'story'
               and status in ('approved','edited') order by updated_at desc limit 1""",
            (job["series_id"],),
        ).fetchone()
        return {"episode": ep, "number": ep["number"], "series_title": series["title"], "story": body_text(story["body"]) if story else ""}

    def finish_episode_meta(self, job: dict[str, Any], ep: dict[str, Any], values: dict[str, str], costs: list[dict[str, Any]]) -> list[str]:
        """비어 있는 칸만 채워요."""
        cols = {"title": "title", "titleEn": "title_en", "logline": "logline"}
        sets, params, filled = [], [], []
        for key, col in cols.items():
            if not (ep.get(col) or "").strip() and values.get(key):
                sets.append(f'"{col}" = %s')
                params.append(values[key])
                filled.append(col)
        with self.conn.transaction():
            if sets:
                self.conn.execute(f"update episodes set {', '.join(sets)}, updated_at = now() where id = %s", (*params, ep["id"]))
            self.finish(job, {}, costs)
        return filled

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

        # 웹소설 ⑥ 집필·⑦ 퇴고: 지난 회 본문 끝부분을 줘서 이어지게 해요 (퇴고본이 있으면 퇴고본, 없으면 집필 원고)
        if episode and job["type"] in ("manuscript", "copyedit"):
            prev = c.execute(
                """select e.number, a.stage, a.body from artifacts a join episodes e on e.id = a.episode_id
                   where a.series_id = %s and a.stage in ('copyedit','manuscript') and a.status in ('approved','edited')
                     and e.number < %s order by e.number desc, (a.stage = 'copyedit') desc, a.created_at desc limit 1""",
                (job["series_id"], episode["number"]),
            ).fetchone()
            if prev:
                text = body_text(prev["body"])
                inputs.append((f"{prev['number']}화 본문 끝부분 (지난 회)", text[-3000:]))

        # ④+ 인물 시트: 다른 작품의 주요 인물 외모를 함께 줘서 작품끼리 얼굴이 겹치지 않게 해요
        other_faces: list[dict[str, Any]] = []
        if job["type"] == "sheets":
            rows = c.execute(
                """select distinct on (a.series_id) s.title, a.body from artifacts a join series s on s.id = a.series_id
                   where a.stage = 'sheets' and a.status in ('approved','edited') and a.series_id <> %s
                   order by a.series_id, a.created_at desc limit 20""",
                (job["series_id"],),
            ).fetchall()
            for r in rows:
                for ch in (r["body"] or {}).get("characters") or []:
                    if ch.get("kind", "person") == "person" and ch.get("role", "main") in ("main", "supporting") and ch.get("appearance"):
                        other_faces.append({"series": r["title"], "name": ch.get("name", ""), "appearance": ch["appearance"]})
            other_faces = other_faces[:24]

        # ⑦ 작화 검사기 눈 맞추기: 대표가 작화 결과에서 '좋아요'·'AI 같아요'로 판정한 컷 (모든 작품, 최근 것부터)
        judge_examples: list[dict[str, Any]] = []
        if job["type"] == "art":
            judge_examples = [
                r["p"]
                for r in c.execute(
                    """select p from artifacts a, jsonb_array_elements(case when jsonb_typeof(a.body->'panels') = 'array'
                       then a.body->'panels' else '[]'::jsonb end) p
                       where a.stage = 'art' and p ? 'owner_verdict' order by a.updated_at desc limit 30"""
                ).fetchall()
            ]

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
        if job["type"] in ("lettering", "review", "copyedit"):
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
            "other_faces": other_faces,
            "judge_examples": judge_examples,
        }


def body_text(body: dict[str, Any]) -> str:
    if isinstance(body, dict) and isinstance(body.get("markdown"), str):
        return body["markdown"]
    return json.dumps(body, ensure_ascii=False, indent=2)
