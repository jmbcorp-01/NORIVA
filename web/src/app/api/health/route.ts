// 로드밸런서 상태 확인용. DB까지 확인하지 않아서 DB 점검 중에도 웹이 재시작되지 않아요.
export function GET() {
  return Response.json({ ok: true });
}
