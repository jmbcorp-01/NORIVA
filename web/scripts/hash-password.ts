// 사용법: npm run hash-password -- '비밀번호'
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error("10자 이상의 비밀번호를 넣어 주세요: npm run hash-password -- '비밀번호'");
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 12);
// .env 파일에서 $가 변수로 해석되지 않게 base64로 감싸요
console.log(`STUDIO_OWNER_PASSWORD_HASH=b64:${Buffer.from(hash).toString("base64")}`);
