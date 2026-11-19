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

## 3. 도메인 사기 (Route 53)
1. AWS 콘솔 → **Route 53 → 도메인 → 도메인 등록**에서 도메인(예: `k-noriva.com`)을 사요. 자동 갱신을 켜 둬요.
2. 등록이 끝나면 같은 이름의 **호스팅 영역**이 자동으로 만들어져요. 따로 할 일은 없어요.
3. 다른 곳(가비아 등)에서 산 도메인이라면 Route 53에 호스팅 영역을 만들고, 산 곳의 네임서버를 호스팅 영역의 NS 4개로 바꿔요.

도메인 없이도 배포는 돼요. 그때는 CloudFront 임시 주소로만 접속돼요(Apple 로그인은 안 돼요).

## 4. 배포
```bash
npx cdk bootstrap aws://<계정번호>/us-east-1        # 인증서용 버지니아 리전 준비 (도메인을 쓸 때 한 번만)
npx cdk deploy --all -c stage=staging   # 시험 환경 (도메인 k-noriva.com은 cdk.json에 들어 있어요)
npx cdk deploy --all -c stage=prod      # 운영 환경 (나중에)
```
- `Noriva-staging-Cert`(버지니아, CloudFront용 인증서)와 `Noriva-staging`(서울) 두 묶음이 만들어져요. 인증서 확인 레코드와 `k-noriva.com`, `www.k-noriva.com` 주소 레코드도 Route 53에 자동으로 들어가요. `www`로 들어오면 `k-noriva.com`으로 넘어가요.
- 서비스 주소(`APP_URL`)는 도메인이 있으면 `https://k-noriva.com`, 없으면 CloudFront 주소로 자동 설정돼요.
- 처음 배포는 인증서 확인과 CloudFront 생성 때문에 20~40분 걸릴 수 있어요.
- 웹과 제작 서버 컨테이너는 Docker로 빌드되므로 배포하는 컴퓨터에 Docker가 켜져 있어야 해요.
- NORIVA의 자원은 모두 이 묶음(CloudFormation 스택) 안에 새로 만들어져서, 같은 계정의 다른 프로젝트와 섞이지 않아요. 서울 리전 VPC 한도(기본 5개)만 확인해요.

## 5. 비밀 값 채우기
배포가 끝나면 출력에 `AppSecretName`이 나와요. Secrets Manager에서 그 비밀을 열어 값을 채워요.

| 키 | 값 |
| --- | --- |
| `STUDIO_OWNER_EMAIL` | 스튜디오 로그인 이메일 |
| `STUDIO_OWNER_PASSWORD_HASH` | `cd web && npm run hash-password -- '비밀번호'` 출력의 `b64:`부터 끝까지 |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `FAL_KEY` | fal.ai 키 (작화 단계, 회차당 대략 60컷 x 후보 1~2장) |
| `SESSION_SECRET` | 자동 생성됨, 그대로 두기 |
| `KAKAO_*`, `NAVER_*`, `GOOGLE_*`, `APPLE_*` | 독자 로그인. 등록 방법은 [login-setup.md](login-setup.md). 비워 두면 그 로그인 버튼이 안 나와요 |

값을 바꾼 뒤 ECS 서비스(Web, Worker)를 "새 배포 강제"로 다시 시작하면 적용돼요.

## 6. 접속
출력의 `Url`(도메인이 있으면 `https://k-noriva.com`) 뒤에 `/studio`를 붙여 로그인해요. `CloudFrontUrl`은 도메인 연결이 끝나기 전 확인용 주소예요.

## 구성과 비용 (staging 기준, 월)

| 자원 | 설명 | 대략 비용 |
| --- | --- | --- |
| RDS PostgreSQL t4g.micro | 격리 서브넷, 외부 접근 불가, 백업 7일 | $15~20 |
| ECS Fargate 웹 (0.5 vCPU, 1GB, ARM) | Next.js | $15 |
| ECS Fargate 제작 서버 (0.5 vCPU, 1GB, ARM) | SQS 작업 실행. 작업이 있을 때만 켜져요 | 작업 시간만큼 (하루 2시간이면 약 $1~2) |
| ALB | CloudFront에서 온 요청만 받음 | $18~20 |
| CloudFront, S3, SQS, Secrets, CloudWatch | | $5~10 |

합계 약 $55~65 (약 8~9만 원). NAT 게이트웨이(월 $35 이상)는 쓰지 않아요.

제작 서버 자동 켜고 끄기: 스튜디오에서 작업을 넣으면 웹이 제작 서버를 1대로 켜요(시작까지 1~2분). 대기 중이거나 실행 중인 작업이 없는 상태가 15분 이어지면 제작 서버가 스스로 0대로 줄여요. 깨우기가 실패해도 대기열에 작업이 3분 넘게 남으면 CloudWatch 경보가 다시 켜요.
