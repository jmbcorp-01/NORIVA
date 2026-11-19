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
from .images import FalImage, ImageNotConfiguredError
from .llm import RefusedError, TextModel, TruncatedError
from .media import media_from_env
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
        ),
    )


def process(store: Store, job: dict, tools: Tools, cfg: Config) -> None:
    log.info("작업 시작 %s %s (시도 %s)", job["id"], job["type"], job["attempts"])
    try:
        ctx = store.context(job)
        body, costs = run_stage(job["type"], ctx, tools)
        store.finish(job, body, costs)
        log.info("작업 완료 %s 비용 $%.4f", job["id"], sum(c["cost_usd"] for c in costs))
    except (RefusedError, TruncatedError, StageInputError, ImageNotConfiguredError) as e:
        store.fail(job, str(e), cfg.max_attempts, retryable=False)
    except (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as e:
        again = store.fail(job, f"일시적 오류: {e}", cfg.max_attempts, retryable=True)
        log.warning("일시적 오류 %s, 다시 시도: %s", job["id"], again)
    except anthropic.APIStatusError as e:
        store.fail(job, f"API 오류 {e.status_code}: {e.message}", cfg.max_attempts, retryable=False)
    except httpx.HTTPStatusError as e:
        retry = e.response.status_code >= 500 or e.response.status_code == 429
        store.fail(job, f"그림 API 오류 {e.response.status_code}: {e.response.text[:300]}", cfg.max_attempts, retryable=retry)
    except httpx.TransportError as e:
        store.fail(job, f"그림 API 연결 오류: {e}", cfg.max_attempts, retryable=True)
    except Exception as e:  # 마지막 안전망: 작업이 '실행 중'에 묶이지 않게
        log.exception("처리 실패 %s", job["id"])
        store.fail(job, f"{type(e).__name__}: {e}", cfg.max_attempts, retryable=True)


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

    while not _stop:
        if sqs:
            res = sqs.receive_message(QueueUrl=cfg.sqs_queue_url, MaxNumberOfMessages=1, WaitTimeSeconds=20)
            for m in res.get("Messages", []):
                job_id = json.loads(m["Body"]).get("jobId")
                job = store.claim_by_id(job_id, worker_id) if job_id else None
                if job:
                    process(store, job, tools, cfg)
                sqs.delete_message(QueueUrl=cfg.sqs_queue_url, ReceiptHandle=m["ReceiptHandle"])
            # 재시도 대기 중인 작업은 SQS 메시지가 없으므로 DB에서도 확인해요
            job = store.claim_next(worker_id)
            if job:
                process(store, job, tools, cfg)
        else:
            job = store.claim_next(worker_id)
            if job:
                process(store, job, tools, cfg)
            else:
                time.sleep(cfg.poll_seconds)
    log.info("실행기 종료")


if __name__ == "__main__":
    main()
