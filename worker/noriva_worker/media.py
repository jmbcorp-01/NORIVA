"""그림 파일 저장소.

AWS: S3 버킷의 media/ 아래에 저장하고, CloudFront가 /media/* 주소로 보여줘요.
로컬: MEDIA_DIR 폴더에 같은 경로로 저장하고, 스튜디오의 /media/* 경로가 그 폴더를 읽어요.
결과물 본문에는 "series/<id>/..." 같은 키만 남기고, 화면은 /media/<키>로 불러요.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol


class Media(Protocol):
    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str: ...
    def get(self, key: str) -> bytes | None: ...


class LocalMedia:
    def __init__(self, root: str):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError(f"잘못된 미디어 키: {key}")
        return p

    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return key

    def get(self, key: str) -> bytes | None:
        p = self._path(key)
        return p.read_bytes() if p.exists() else None


class S3Media:
    def __init__(self, bucket: str, region: str):
        import boto3

        self.bucket = bucket
        self.s3 = boto3.client("s3", region_name=region)

    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str:
        self.s3.put_object(
            Bucket=self.bucket,
            Key=f"media/{key}",
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        return key

    def get(self, key: str) -> bytes | None:
        try:
            return self.s3.get_object(Bucket=self.bucket, Key=f"media/{key}")["Body"].read()
        except self.s3.exceptions.NoSuchKey:
            return None


def media_from_env() -> Media:
    bucket = os.environ.get("ASSETS_BUCKET")
    if bucket:
        return S3Media(bucket, os.environ.get("AWS_REGION", "ap-northeast-2"))
    return LocalMedia(os.environ.get("MEDIA_DIR", str(Path(__file__).resolve().parents[2] / ".media")))
