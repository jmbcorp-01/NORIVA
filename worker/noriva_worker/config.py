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
    image_model: str
    image_price: float
    art_candidates: int
    art_pass_score: int
    art_max_panels: int
    art_parallel: int
    idle_minutes: float
    ecs_cluster: str
    ecs_service: str
    art_test_panels: int = 5

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
            # 그림 모델: 인물 시트를 참조로 줄 수 있는 모델이어야 해요 (fal의 "<모델>/edit" 경로)
            image_model=os.environ.get("NORIVA_IMAGE_MODEL", "fal-ai/nano-banana"),
            image_price=float(os.environ.get("NORIVA_IMAGE_PRICE", "0.04")),
            art_candidates=int(os.environ.get("NORIVA_ART_CANDIDATES", "2")),
            art_pass_score=int(os.environ.get("NORIVA_ART_PASS_SCORE", "80")),
            art_max_panels=int(os.environ.get("NORIVA_ART_MAX_PANELS", "80")),
            art_parallel=int(os.environ.get("NORIVA_ART_PARALLEL", "4")),
            art_test_panels=int(os.environ.get("NORIVA_ART_TEST_PANELS", "5")),
            # AWS: 할 일이 없는 상태가 이만큼 이어지면 작업 서버를 0대로 줄이고 끝나요 (0이면 끄지 않음)
            idle_minutes=float(os.environ.get("WORKER_IDLE_MINUTES", "0")),
            ecs_cluster=os.environ.get("ECS_CLUSTER", ""),
            ecs_service=os.environ.get("ECS_SERVICE", ""),
        )
