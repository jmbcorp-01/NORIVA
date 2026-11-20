// 웹 서버가 켜질 때 한 번: 기본 지침·금지 표현·소재가 DB에 없으면 넣어요.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !(process.env.DATABASE_URL || process.env.DB_HOST)) return;
  try {
    const { db } = await import("./db");
    const { ensureDefaults } = await import("./db/defaults");
    const r = await ensureDefaults(db);
    console.log(`defaults: guidelines +${r.added} ~${r.updated}, banned +${r.banned}, sources +${r.sources}`);
  } catch (e) {
    console.error("defaults failed", e);
  }
}
