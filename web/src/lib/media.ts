/** 그림 파일 키 → 주소. 로컬은 /media 경로(작업 실행기 폴더), AWS는 CloudFront가 S3 media/에서 보여줘요. */
export function mediaUrl(key: string): string {
  if (!key) return "";
  if (/^https?:\/\//.test(key) || key.startsWith("/")) return key;
  return `/media/${key}`;
}
