import os
from dataclasses import dataclass

from .dburl import database_url


@dataclass(frozen=True)
class Config:
    database_url: str
    sqs_queue_url: str
    aws_region: str
    model: str
    effort: str
    max_attempts: int
    poll_seconds: float

    @staticmethod
    def from_env() -> "Config":
        return Config(
            database_url=database_url(),
            sqs_queue_url=os.environ.get("SQS_QUEUE_URL", ""),
            aws_region=os.environ.get("AWS_REGION", "ap-northeast-2"),
            model=os.environ.get("NORIVA_TEXT_MODEL", "claude-opus-5-5"),
            effort=os.environ.get("NORIVA_TEXT_EFFORT", "high"),
            max_attempts=int(os.environ.get("NORIVA_MAX_ATTEMPTS", "3")),
            poll_seconds=float(os.environ.get("NORIVA_POLL_SECONDS", "3")),
        )
