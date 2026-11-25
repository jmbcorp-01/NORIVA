// 컨테이너가 시작할 때 DB 구조를 최신으로 맞춰요 (drizzle/ 폴더의 마이그레이션).
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const env = process.env;
const ssl = env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;
const config = env.DB_HOST
  ? { host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, ssl }
  : { connectionString: env.DATABASE_URL, ssl };
const pool = new pg.Pool(config);
await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await pool.end();
console.log("migrations applied");
