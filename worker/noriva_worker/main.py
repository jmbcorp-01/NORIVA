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

from .config import Config
from .handlers import NotConnectedError, run_stage
from .llm import RefusedError, TextModel
from .store import Store

log = logging.getLogger("noriva.worker")
_stop = False


def _handle_stop(*_):
    global _stop
    _stop = True


def process(store: Store, job: dict, writer, cfg: Config) -> None:
    log.info("작업 시작 %s %s (시도 %s)", job["id"], job["type"], job["attempts"])
    try:
        ctx = store.context(job)
        body, cost = run_stage(job["type"], ctx, writer)
        store.finish(job, body, cost)
        log.info("작업 완료 %s 비용 $%s", job["id"], cost["cost_usd"] if cost else 0)
    except (NotConnectedError, RefusedError) as e:
        store.fail(job, str(e), cfg.max_attempts, retryable=False)
    except (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as e:
        again = store.fail(job, f"일시적 오류: {e}", cfg.max_attempts, retryable=True)
        log.warning("일시적 오류 %s, 다시 시도: %s", job["id"], again)
    except anthropic.APIStatusError as e:
        store.fail(job, f"API 오류 {e.status_code}: {e.message}", cfg.max_attempts, retryable=False)
    except Exception as e:  # 마지막 안전망: 작업이 '실행 중'에 묶이지 않게
        log.exception("처리 실패 %s", job["id"])
        store.fail(job, f"{type(e).__name__}: {e}", cfg.max_attempts, retryable=True)


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    store = Store(cfg.database_url)
    writer = TextModel(cfg.model, cfg.effort)
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
                    process(store, job, writer, cfg)
                sqs.delete_message(QueueUrl=cfg.sqs_queue_url, ReceiptHandle=m["ReceiptHandle"])
            # 재시도 대기 중인 작업은 SQS 메시지가 없으므로 DB에서도 확인해요
            job = store.claim_next(worker_id)
            if job:
                process(store, job, writer, cfg)
        else:
            job = store.claim_next(worker_id)
            if job:
                process(store, job, writer, cfg)
            else:
                time.sleep(cfg.poll_seconds)
    log.info("실행기 종료")


if __name__ == "__main__":
    main()
