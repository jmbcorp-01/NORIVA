// 로컬은 DATABASE_URL, AWS는 RDS 비밀 값에서 나눠 받은 DB_* 값을 써요.
export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const ssl = env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  if (env.DB_HOST) {
    return {
      host: env.DB_HOST,
      port: Number(env.DB_PORT ?? 5432),
      database: env.DB_NAME ?? "noriva",
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl,
    };
  }
  return { connectionString: env.DATABASE_URL ?? "postgres://postgres@localhost:5432/noriva", ssl };
}
