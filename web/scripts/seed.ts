// 기본 지침, 금지 표현, 소재를 넣어요. 웹 서버가 켜질 때도 자동으로 돌아요.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { databaseConfig } from "../src/db/url";
import { ensureDefaults } from "../src/db/defaults";

const pool = new Pool(databaseConfig());

ensureDefaults(drizzle(pool, { schema }))
  .then((r) => {
    console.log(`지침 ${r.added}개 추가, ${r.updated}개 갱신, 금지 표현 ${r.banned}개, 소재 ${r.sources}개를 넣었어요.`);
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
