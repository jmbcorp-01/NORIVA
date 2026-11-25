import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 독자에게 보이는 그림 파일 (작화 컷 등). AWS는 S3 media/ 아래(CloudFront가 /media/* 로 보여줘요),
 * 로컬은 작업 실행기와 같은 MEDIA_DIR 폴더에 같은 경로로 둬요. 키는 늘 새로 만들어서 덮어쓰지 않아요.
 */
const localRoot = () => path.resolve(process.env.MEDIA_DIR ?? path.join(process.cwd(), "..", ".media"));

export async function putPublic(key: string, data: Uint8Array, contentType: string) {
  const bucket = process.env.ASSETS_BUCKET;
  if (bucket) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: `media/${key}`, Body: data, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
    );
    return;
  }
  const file = path.resolve(localRoot(), key);
  if (!file.startsWith(localRoot() + path.sep) || file.startsWith(path.join(localRoot(), "_private") + path.sep)) throw new Error("bad key");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}
