import os
from urllib.parse import quote


def database_url(env=os.environ) -> str:
    """로컬은 DATABASE_URL, AWS는 RDS 비밀 값에서 나눠 받은 DB_* 값을 써요."""
    if env.get("DB_HOST"):
        user = quote(env.get("DB_USER", ""), safe="")
        pw = quote(env.get("DB_PASSWORD", ""), safe="")
        url = f"postgresql://{user}:{pw}@{env['DB_HOST']}:{env.get('DB_PORT', '5432')}/{env.get('DB_NAME', 'noriva')}"
    else:
        url = env.get("DATABASE_URL", "postgres://postgres@localhost:5432/noriva")
    if env.get("DB_SSL") == "true":
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url
