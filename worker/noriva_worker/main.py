"""작업 실행기.

로컬: jobs 테이블을 몇 초마다 확인해요.
AWS: SQS에서 작업 id를 받아 같은 jobs 행을 잠그고 실행해요 (SQS_QUEUE_URL이 있을 때).
"""

from __future__ import annotations

import json
import logging
import os
import signal
import socket
import time

import anthropic
import httpx

from .config import Config
from .handlers import Tools, run_stage
from . import ledger
from .images import FalImage, ImageNotConfiguredError, NoImageError
from .llm import RefusedError, TextModel, TruncatedError
from .media import media_from_env
from .scout import run_scout, run_source_fill
from .series_meta import run_episode_meta, run_series_meta
from .cover import run_cover
from .style_scout import run_style_scout
from .store import Store
from .visual import ArtSettings, StageInputError

log = logging.getLogger("noriva.worker")
_stop = False


def _handle_stop(*_):
    global _stop
    _stop = True


def tools_from_config(cfg: Config) -> Tools:
    return Tools(
        writer=TextModel(cfg.model, cfg.effort),
        media=media_from_env(),
        image_factory=lambda: FalImage(cfg.image_model, cfg.image_price),
        art=ArtSettings(
            candidates=cfg.art_candidates,
            pass_score=cfg.art_pass_score,
            max_panels=cfg.art_max_panels,
            parallel=cfg.art_parallel,
            test_panels=cfg.art_test_panels,
        ),
    )


def process(store: Store, job: dict, tools: Tools, cfg: Config) -> None:
    log.info("작업 시작 %s %s (시도 %s)", job["id"], job["type"], job["attempts"])
    def report(step: str, done: int | None = None, total: int | None = None) -> None:
        store.set_progress(job["id"], step, done, total)

    ledger.set_sink(lambda cost: store.record_cost(job, cost))
    try:
        _process(store, job, tools, cfg, report)
    finally:
        ledger.set_sink(None)


def _process(store: Store, job: dict, tools: Tools, cfg: Config, report) -> None:
    try:
        if job["type"] == "scout":
            report("웹에서 시장 조사 중")
            mreport, candidates, costs = run_scout(store.scout_context(job), tools.writer)
            store.finish_scout(job, mreport, candidates, costs)
        elif job["type"] == "source_fill":
            source = store.source_for_fill(job)
            if source is None:
                raise StageInputError("채울 소재를 찾지 못했어요 (지워졌을 수 있어요)")
            report("원전·고증 자료 조사 중")
            values, costs = run_source_fill(source, tools.writer)
            filled = store.finish_source_fill(job, source, values, costs)
            log.info("소재 채움 %s: %s", source["name"], ", ".join(filled) or "채울 빈 칸 없음")
        elif job["type"] == "series_meta":
            mctx = store.series_meta_context(job)
            if mctx is None:
                raise StageInputError("작품을 찾지 못했어요 (지워졌을 수 있어요)")
            if not mctx["inputs"]:
                raise StageInputError("승인한 기획안이 없어요. ① 기획안을 먼저 승인해 주세요.")
            values, costs = run_series_meta(mctx, tools.writer)
            filled = store.finish_series_meta(job, mctx["series"], values, costs)
            log.info("연재 설정 채움 %s: %s", job["series_id"], ", ".join(filled) or "채울 빈 칸 없음")
        elif job["type"] == "style_scout":
            mctx = store.series_meta_context(job)
            if mctx is None:
                raise StageInputError("작품을 찾지 못했어요 (지워졌을 수 있어요)")
            if not mctx["inputs"]:
                raise StageInputError("승인한 기획안이 없어요. ① 기획안을 먼저 승인해 주세요.")
            report("웹에서 어울리는 웹툰 찾는 중")
            works, costs = run_style_scout(mctx, tools.writer)
            store.finish_style_scout(job, works, costs)
            log.info("화풍 참고작 %s: %d편", job["series_id"], len(works))
        elif job["type"] == "cover":
            cctx = store.cover_context(job, tools.media)
            if cctx is None:
                raise StageInputError("작품을 찾지 못했어요 (지워졌을 수 있어요)")
            if not cctx["inputs"]:
                raise StageInputError("승인한 기획안이 없어요. ① 기획안을 먼저 승인해 주세요.")
            count = cctx["count"]
            report("표지 그리는 중", len(cctx["saved"].get("images") or []), count)
            image = tools.images()

            def save(state):
                store.save_cover(job, state)
                report("표지 그리는 중", len(state["images"]), count)

            state, costs = run_cover(cctx, tools.writer, image, tools.media, cctx["saved"], save, count)
            store.finish_cover(job, state, costs)
            log.info("표지 후보 %s: %d장", job["series_id"], len(state["images"]))
        elif job["type"] == "episode_meta":
            ectx = store.episode_meta_context(job)
            if ectx is None:
                raise StageInputError("회차를 찾지 못했어요 (지워졌을 수 있어요)")
            if not ectx["story"]:
                raise StageInputError("승인한 스토리가 없어요. ② 스토리를 먼저 승인해 주세요.")
            values, costs = run_episode_meta(ectx, tools.writer)
            filled = store.finish_episode_meta(job, ectx["episode"], values, costs)
            log.info("회차 정보 채움 %s화: %s", ectx["number"], ", ".join(filled) or "채울 빈 칸 없음")
        else:
            ctx = store.context(job)
            ctx["progress"] = report
            report("에이전트가 쓰는 중")
            body, costs = run_stage(job["type"], ctx, tools)
            store.finish(job, body, costs)
        log.info("작업 완료 %s 비용 $%.4f", job["id"], sum(c["cost_usd"] for c in costs))
    except (RefusedError, TruncatedError, StageInputError, ImageNotConfiguredError, NoImageError) as e:
        store.fail(job, str(e), cfg.max_attempts, retryable=False, partial=getattr(e, "partial_body", None))
    except (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as e:
        again = store.fail(job, f"일시적 오류: {e}", cfg.max_attempts, retryable=True, partial=getattr(e, "partial_body", None))
        log.warning("일시적 오류 %s, 다시 시도: %s", job["id"], again)
    except anthropic.APIStatusError as e:
        msg = f"API 오류 {e.status_code}: {e.message}"
        if "credit balance" in str(e.message).lower():
            msg = "Anthropic API 크레딧이 부족해요. Anthropic 콘솔의 Plans & Billing에서 충전한 뒤 '이어서 그리기'를 누르면 멈춘 곳 다음부터 이어 가요."
        store.fail(job, msg, cfg.max_attempts, retryable=False, partial=getattr(e, "partial_body", None))
    except httpx.HTTPStatusError as e:
        retry = e.response.status_code >= 500 or e.response.status_code == 429
        store.fail(job, f"그림 API 오류 {e.response.status_code}: {e.response.text[:1000]}", cfg.max_attempts, retryable=retry, partial=getattr(e, "partial_body", None))
    except httpx.TransportError as e:
        store.fail(job, f"그림 API 연결 오류: {e}", cfg.max_attempts, retryable=True, partial=getattr(e, "partial_body", None))
    except Exception as e:  # 마지막 안전망: 작업이 '실행 중'에 묶이지 않게
        log.exception("처리 실패 %s", job["id"])
        store.fail(job, f"{type(e).__name__}: {e}", cfg.max_attempts, retryable=True, partial=getattr(e, "partial_body", None))


def claim_from_message(store: Store, raw: str, worker_id: str) -> dict | None:
    """SQS 메시지로 작업을 잡아요. 웹이 넣은 {"jobId"} 또는 주간 예약이 넣은 {"kind": "scout"}."""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("읽을 수 없는 메시지를 버려요: %s", raw[:200])
        return None
    if msg.get("jobId"):
        return store.claim_by_id(msg["jobId"], worker_id)
    if msg.get("kind") == "scout":
        # 자동 실행은 대표가 켰을 때만 돌아요. 꺼져 있으면 돈을 쓰지 않고 메시지만 버려요.
        if not store.scout_auto_enabled():
            log.info("소재 발굴 자동 실행이 꺼져 있어 건너뛰어요")
            return None
        # 예약이 두 번 오거나 재전송돼도 한 주에 한 번만 돌아요
        job = store.create_scout(msg.get("trigger") or "weekly", msg.get("focus") or "", skip_if_recent_days=5)
        if job is None:
            log.info("이번 주 소재 발굴은 이미 돌았어요")
            return None
        return store.claim_by_id(str(job["id"]), worker_id)
    return None


class IdleTimer:
    """마지막으로 일한 뒤 얼마나 지났는지 재요."""

    def __init__(self, minutes: float, clock=time.monotonic):
        self.limit = minutes * 60
        self.clock = clock
        self.last = clock()

    def worked(self) -> None:
        self.last = self.clock()

    def expired(self) -> bool:
        return self.limit > 0 and self.clock() - self.last >= self.limit


def scale_to_zero(cfg: Config) -> bool:
    """작업 서버 서비스를 0대로 줄여요. 웹이 다음 작업을 넣을 때 다시 1대로 켜요."""
    if not (cfg.ecs_cluster and cfg.ecs_service):
        return False
    import boto3

    boto3.client("ecs", region_name=cfg.aws_region).update_service(
        cluster=cfg.ecs_cluster, service=cfg.ecs_service, desiredCount=0
    )
    return True


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    store = Store(cfg.database_url)
    tools = tools_from_config(cfg)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)

    sqs = None
    if cfg.sqs_queue_url:
        import boto3

        sqs = boto3.client("sqs", region_name=cfg.aws_region)
    log.info("실행기 시작 (%s, 큐: %s)", worker_id, "SQS" if sqs else "DB")
    idle = IdleTimer(cfg.idle_minutes if sqs else 0)

    while not _stop:
        if sqs:
            res = sqs.receive_message(QueueUrl=cfg.sqs_queue_url, MaxNumberOfMessages=1, WaitTimeSeconds=20)
            for m in res.get("Messages", []):
                idle.worked()
                job = claim_from_message(store, m["Body"], worker_id)
                if job:
                    process(store, job, tools, cfg)
                sqs.delete_message(QueueUrl=cfg.sqs_queue_url, ReceiptHandle=m["ReceiptHandle"])
                idle.worked()
            # 작업 서버가 꺼져 '실행 중'에 묶인 작업을 되살려요
            for r in store.reclaim_stale(cfg.max_attempts):
                log.warning("멈춘 작업 되살림 %s (다시 대기열: %s)", r["id"], r["requeued"])
            # 재시도 대기 중인 작업은 SQS 메시지가 없으므로 DB에서도 확인해요
            job = store.claim_next(worker_id)
            if job:
                process(store, job, tools, cfg)
                idle.worked()
            elif store.has_pending():
                idle.worked()  # 재시도 예약이 남아 있으면 꺼지지 않아요
            elif idle.expired():
                log.info("%s분 동안 할 일이 없어 작업 서버를 끕니다", cfg.idle_minutes)
                try:
                    if scale_to_zero(cfg):
                        break
                except Exception:
                    log.exception("작업 서버 끄기 실패, 계속 대기해요")
                idle.worked()
        else:
            job = store.claim_next(worker_id)
            if job:
                process(store, job, tools, cfg)
            else:
                time.sleep(cfg.poll_seconds)
    log.info("실행기 종료")


if __name__ == "__main__":
    main()
