# AWS 배포 안내 (처음 한 번)

인프라는 `infra/`에 코드(AWS CDK)로 있어요. 대표님은 아래 1~3만 하시면 되고, 4부터는 제가 안내하거나 대신 실행해요.

## 1. 작업용 권한 만들기
1. AWS 콘솔에 루트 계정으로 로그인 → **IAM Identity Center**를 켜요 (서울 리전).
2. 사용자 하나를 만들고 `AdministratorAccess` 권한 세트를 연결해요. 루트 계정은 이후 쓰지 않고, MFA를 켜 둬요.
3. **AWS Budgets**에서 월 예산(예: 15만 원)과 80% 도달 알림을 만들어요.

## 2. 처음 한 번 준비 (로컬 컴퓨터)
```bash
aws configure sso          # 1에서 만든 사용자로 로그인
cd infra && npm ci
npx cdk bootstrap          # 계정에 CDK 준비 자원 생성 (한 번만)
```

## 3. 배포
```bash
npx cdk deploy -c stage=staging   # 시험 환경
npx cdk deploy -c stage=prod      # 운영 환경 (나중에)
```
웹과 제작 서버 컨테이너는 Docker로 빌드되므로 배포하는 컴퓨터에 Docker가 켜져 있어야 해요.

## 4. 비밀 값 채우기
배포가 끝나면 출력에 `AppSecretName`이 나와요. Secrets Manager에서 그 비밀을 열어 값을 채워요.

| 키 | 값 |
| --- | --- |
| `STUDIO_OWNER_EMAIL` | 스튜디오 로그인 이메일 |
| `STUDIO_OWNER_PASSWORD_HASH` | `cd web && npm run hash-password -- '비밀번호'` 출력의 `b64:`부터 끝까지 |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `FAL_KEY` | fal.ai 키 (작화 단계, 회차당 대략 60컷 x 후보 1~2장) |
| `SESSION_SECRET` | 자동 생성됨, 그대로 두기 |
| `APP_URL`, `KAKAO_*`, `NAVER_*`, `GOOGLE_*`, `APPLE_*` | 독자 로그인. 등록 방법은 [login-setup.md](login-setup.md). 비워 두면 그 로그인 버튼이 안 나와요 |

값을 바꾼 뒤 ECS 서비스(Web, Worker)를 "새 배포 강제"로 다시 시작하면 적용돼요.

## 5. 접속
출력의 `Url`(CloudFront 주소) 뒤에 `/studio`를 붙여 로그인해요. 도메인(예: noriva.kr)은 Route 53과 ACM 인증서를 연결하는 작업을 다음에 추가해요.

## 구성과 비용 (staging 기준, 월)

| 자원 | 설명 | 대략 비용 |
| --- | --- | --- |
| RDS PostgreSQL t4g.micro | 격리 서브넷, 외부 접근 불가, 백업 7일 | $15~20 |
| ECS Fargate 웹 (0.5 vCPU, 1GB, ARM) | Next.js | $15 |
| ECS Fargate 제작 서버 (0.5 vCPU, 1GB, ARM) | SQS 작업 실행 | $15 |
| ALB | CloudFront에서 온 요청만 받음 | $18~20 |
| CloudFront, S3, SQS, Secrets, CloudWatch | | $5~10 |

합계 약 $70~80 (약 10~11만 원). NAT 게이트웨이(월 $35 이상)는 쓰지 않아요. 제작 서버는 작업이 없을 때 0대로 줄이는 자동 조절을 다음에 추가할 수 있어요.
