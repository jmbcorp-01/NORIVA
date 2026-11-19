import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * 로컬 개발용 그림 주소. 작업 실행기가 MEDIA_DIR(기본: 저장소의 .media)에 저장한 파일을 보여줘요.
 * AWS에서는 CloudFront가 /media/*를 S3로 바로 보내서 이 경로까지 오지 않아요.
 */
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR ?? path.join(process.cwd(), "..", ".media"));
  const file = path.resolve(/*turbopackIgnore: true*/ root, ...key);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(root + path.sep) || !type) return new NextResponse("not found", { status: 404 });
  try {
    const data = await readFile(file);
    return new NextResponse(new Uint8Array(data), {
      headers: { "content-type": type, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
