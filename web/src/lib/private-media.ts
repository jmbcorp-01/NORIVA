import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 공개하지 않는 파일 (대표가 올린 참고 웹툰 캡처). CloudFront가 보여주는 media/ 가 아니라
 * S3 private/ 아래에 두고, 스튜디오의 /studio/private-media 경로로 대표만 볼 수 있어요.
 * 로컬은 작업 실행기와 같은 MEDIA_DIR의 _private/ 아래에 둬요.
 */
const localRoot = () => path.resolve(process.env.MEDIA_DIR ?? path.join(process.cwd(), "..", ".media"), "_private");

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

export async function putPrivate(key: string, data: Uint8Array, contentType: string) {
  const bucket = process.env.ASSETS_BUCKET;
  if (bucket) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: bucket, Key: `private/${key}`, Body: data, ContentType: contentType }));
    return;
  }
  const file = path.resolve(localRoot(), key);
  if (!file.startsWith(localRoot() + path.sep)) throw new Error("bad key");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function getPrivate(key: string): Promise<Uint8Array | null> {
  const bucket = process.env.ASSETS_BUCKET;
  try {
    if (bucket) {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const r = await (await s3()).send(new GetObjectCommand({ Bucket: bucket, Key: `private/${key}` }));
      return r.Body ? await r.Body.transformToByteArray() : null;
    }
    const file = path.resolve(localRoot(), key);
    if (!file.startsWith(localRoot() + path.sep)) return null;
    return new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
}
