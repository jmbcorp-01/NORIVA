# 05. 기술 설계서

한 사람이 만들고 운영할 수 있게 AWS 관리형 서비스 위주로 구성하고, 이미 있는 Python 제작 파이프라인을 그대로 살리는 구조예요. 리전은 서울(ap-northeast-2)이에요. 인프라는 코드(AWS CDK)로 저장소에 넣어서, 명령 한 번으로 같은 환경을 다시 만들 수 있게 해요.

## 1. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 웹 (독자 + 관리자) | Next.js (App Router, TypeScript), Tailwind | 한 저장소에서 독자 화면과 관리자 화면을 같이 만들고, 서버 기능(API, 결제 웹훅)도 같은 곳에 |
| 웹 배포 | ECS Fargate 컨테이너 + ALB, 앞에 CloudFront | DB를 인터넷에서 완전히 막아 두려면 웹도 같은 VPC 안에 있어야 해요. Amplify의 서버 기능은 VPC 안에 들어가지 못해서 바꿨어요 |
| DB | Amazon RDS for PostgreSQL (처음엔 db.t4g.micro~small, 자동 백업 7일) | 표준 Postgres라 어디로든 옮길 수 있음 |
| 로그인 | 스튜디오: 대표 계정 하나(이메일+비밀번호, 서명된 쿠키). 독자: Auth.js로 카카오, 네이버, 구글, 애플 (2단계) | Cognito는 네이버 로그인 연동이 번거로워서 쓰지 않음 |
| 이미지 저장·배포 | Amazon S3 + CloudFront | 유료 회차는 CloudFront 서명 URL로 짧게 만료 |
| 작업 큐 | Amazon SQS + DB의 `jobs` 테이블(상태 기록) | 생성 작업을 안정적으로 넘기고, 실패하면 자동 재시도 |
| 제작 서버 | 기존 `production/` Python 패키지 + SQS 작업 실행기 | 이미 만든 plan/decide/produce/letter를 함수로 재사용 |
| 제작 서버 배포 | Amazon ECS Fargate (작은 컨테이너, 작업이 있을 때만 늘림) | 서버 관리 없이 컨테이너만 실행 |
| 예약 공개 | Amazon EventBridge Scheduler | 정해진 시간에 회차 공개, 유료→기다무→무료 전환 실행 |
| 진행 상태 표시 | 관리자 화면이 몇 초마다 상태 조회 (또는 SSE) | 별도 실시간 서비스 없이 단순하게 |
| 비밀 키 | AWS Secrets Manager | Claude, fal, 결제 키를 코드 밖에 |
| 이메일 | Amazon SES | 가입, 결제 영수증 |
| 푸시 알림 | Firebase Cloud Messaging (안드로이드·iOS 모두) | Capacitor 앱과 연동이 쉬움 |
| 인프라 코드 | AWS CDK (TypeScript) | 환경을 코드로 관리 |
| LLM | Claude API | 기획·스토리·콘티·대사·검수 |
| 이미지 생성 | fal.ai (여러 모델을 한 곳에서), LoRA 학습 | 모델 교체가 쉬움 |
| 음성 (선택) | ElevenLabs | 1화 시험에서 사용. 모션·보이스툰은 2단계 이후 |
| 결제 | 앱: App Store·Google Play 인앱결제, 웹: 토스페이먼츠, 통합 관리: RevenueCat | 01번 4.4 |
| 앱 | Capacitor로 iOS·Android 앱 포장 (웹 코드 재사용), 인앱결제 플러그인 | |
| 모니터링 | Amazon CloudWatch (로그, 경보), Sentry (오류), 자체 조회 이벤트 | |

## 2. 시스템 구조

```
독자 앱/브라우저 ──▶ CloudFront ──▶ ALB ──▶ Fargate 웹 (Next.js) ──▶ RDS PostgreSQL
        │                              │   ▲
        └── 회차 이미지 ◀── CloudFront ◀─ S3│
                                       │   │
  RevenueCat(애플·구글)·토스 ── 웹훅 ──▶│   │
                                       │   │ 상태 조회
관리자 스튜디오 ──▶ /api/admin/* ──▶ SQS ─┼──▶ ECS Fargate 제작 서버 (Python)
                                       │      ├─ Claude API
EventBridge Scheduler ── 예약 공개 ───▶│      ├─ fal.ai (이미지, LoRA)
                                              ├─ 검사 도구 (OCR, 손·얼굴 검출)
                                              └─ 결과: 이미지 → S3, 데이터 → RDS
```

- 관리자 화면에서 "생성"을 누르면 `jobs`에 기록하고 SQS에 작업을 넣어요. 제작 서버가 꺼내 실행한 뒤 결과를 RDS와 S3에 쓰고, 화면은 상태를 조회해서 진행 상황을 보여줘요
- 독자 뷰어는 공개된 회차의 이미지만 CloudFront에서 읽어요. 유료 회차 이미지는 짧게 만료되는 서명 URL로 줘요
- 말풍선은 이미지에 굽지 않고 데이터로 저장했다가, 공개할 때 언어별로 합성한 최종 이미지를 만들어 S3에 올려요 (뷰어 속도와 무단 복제 방지를 위해)
- 비용 절약: 제작 서버는 공용 서브넷에서 실행해 NAT 게이트웨이(월 약 4~5만 원)를 쓰지 않고, RDS는 외부 접근을 막은 채 같은 VPC에서만 열어요

### 2.1 환경

| 환경 | 용도 |
| --- | --- |
| 개발 | 개발자 PC나 클라우드 개발 환경에서 Docker Postgres로 실행 (AWS 비용 없음) |
| 스테이징 | AWS에 작은 크기로, 출시 전 시험과 스토어 심사용 |
| 운영 | 실제 서비스 |

## 3. DB 설계

주요 테이블만 적었어요. 모든 테이블에 `id`, `created_at`, `updated_at`이 있어요.

### 3.1 회원·결제

| 테이블 | 주요 칼럼 |
| --- | --- |
| `profiles` | user_id(Auth), nickname, birth_year, adult_verified_at, locale, marketing_opt_in |
| `plans` | code(free/pass_monthly/pass_yearly), price, currency, interval, benefits(json) |
| `subscriptions` | user_id, plan_id, status(active/canceled/past_due/grace), store(app_store/play/web), store_original_transaction_id, current_period_end |
| `payments` | user_id, kind(coin/subscription), product_id, amount, currency, store(app_store/play/web), store_transaction_id, status, raw(json) |
| `coin_wallets` | user_id, paid_balance, free_balance |
| `coin_transactions` | user_id, delta_paid, delta_free, reason(charge/unlock/refund/event/expire), ref_id, balance_after |
| `episode_unlocks` | user_id, episode_id, method(free/wait_free/coin/pass/preview), coins_spent |
| `wait_free_timers` | user_id, series_id, next_available_at |

코인은 잔액만 바꾸지 않고 항상 `coin_transactions`에 한 줄을 남겨요 (회계와 환불의 근거).

### 3.2 작품·연재

| 테이블 | 주요 칼럼 |
| --- | --- |
| `series` | slug, title, genre, age_rating, status(planning/production/serializing/hiatus/completed), logline, root_note, cover_url, schedule(요일) |
| `series_sources` | series_id, source_id, role(engine/motif/setting) |
| `episodes` | series_id, number, title, status(draft/review/approved/scheduled/published), publish_at, access_schedule(json: 선공개→유료→기다무→무료 날짜) |
| `episode_assets` | episode_id, locale, image_urls(json), total_height |
| `comments`, `likes`, `bookmarks` | 일반 구조 |
| `view_events` | user_id(또는 익명 id), episode_id, max_panel_index, duration, locale |

### 3.3 소재·지침

| 테이블 | 주요 칼럼 |
| --- | --- |
| `sources` | name, category, era, summary, rules(json), visual_notes, references(json), caution, overlap_works |
| `guidelines` | scope(global/genre/series/episode), scope_ref, agent(planner/story/...), current_version_id |
| `guideline_versions` | guideline_id, version, body(json: role, rules, banned, output_format, examples), note, created_by |
| `art_styles` | series_id, card(json: 04번 1.1), lora_ids, reference_urls, status |
| `banned_terms` | scope, kind(dialogue_ko/dialogue_en/visual), term, replacement_hint |

### 3.4 제작

| 테이블 | 주요 칼럼 |
| --- | --- |
| `bibles` | series_id, version, body(json: 세계 규칙, 인물, 떡밥 장부) |
| `characters` | series_id, key, name, profile(json), sheet_version_id, lora_id |
| `character_sheets` | character_id, version, image_urls(json), art_style_id |
| `pipeline_runs` | series_id, episode_id(작품 단계면 null), stage, status |
| `artifacts` | run_id, stage, kind(proposal/synopsis/script/storyboard/panel_image/layout/qa_report), body(json), file_url, input_hash, guideline_version_ids(json), status(generating/pending_review/approved/rejected/edited/stale), parent_artifact_ids(json) |
| `panels` | episode_id, index, storyboard(json), chosen_image_id, layout(json: 말풍선·효과음), defects(json), score |
| `panel_images` | panel_id, attempt, model, prompt, seed, url, checks(json), score |
| `reviews` | artifact_id, reviewer(agent/owner), rubric_version, scores(json), comments(json) |
| `jobs` | type, payload(json), status(queued/running/done/failed), attempts, run_after, locked_by, error |
| `cost_ledger` | run_id, provider, model, units, cost_usd |
| `decision_ledger` | artifact_id, actor, action(choose/edit/approve/reject/override), before(json), after(json) |

`artifacts.input_hash`는 입력 결과물들의 버전으로 만든 지문이에요. 앞 단계가 바뀌어 지문이 달라지면 뒤 결과물을 `stale`로 표시해요 (03번 4절).

## 4. 화면 목록

### 4.1 독자

| 경로 | 화면 |
| --- | --- |
| `/` | 홈 |
| `/explore` | 탐색 (장르, 뿌리, 요일) |
| `/series/[slug]` | 작품 상세 |
| `/series/[slug]/[ep]` | 뷰어 |
| `/coins` | 코인 충전 |
| `/pass` | 구독 |
| `/library` | 내 서재 |
| `/me` | 내 정보, 결제 내역, 알림 설정 |
| `/login` | 로그인 |
| `/legal/*` | 약관, 개인정보, 환불 규정, 사업자 정보 |

### 4.2 관리자 (`/studio`, 대표 계정만)

| 경로 | 화면 |
| --- | --- |
| `/studio` | 대시보드 (매출, 회원, 조회, 대기 승인, 비용) |
| `/studio/sources` | 소재 라이브러리 |
| `/studio/guidelines` | 지침 관리 (계층, 버전, 시험 실행) |
| `/studio/series/new` | 새 작품: 장르·소재 선택 → 기획안 |
| `/studio/series/[id]` | 작품 홈: 단계별 진행, 설정집, 떡밥 장부 |
| `/studio/series/[id]/characters` | 인물과 캐릭터 시트 |
| `/studio/series/[id]/style` | 화풍 카드와 시험 컷 |
| `/studio/series/[id]/episodes/[n]` | 회차 제작 보드 (대본 → 콘티 → 작화 → 말풍선 → 검수) |
| `/studio/series/[id]/episodes/[n]/panels/[i]` | 컷 편집기 |
| `/studio/schedule` | 연재 일정 |
| `/studio/members`, `/studio/payments` | 회원, 결제, 환불 |
| `/studio/costs` | 제작 비용 |

## 5. 보안

- 관리자 경로는 대표 계정 역할(`role = owner`)만 접근하고, 관리자 로그인은 2단계 인증 필수
- 모든 API에서 로그인한 사용자 본인의 결제·코인 정보만 읽게 서버에서 확인. RDS는 인터넷에서 직접 접근 불가
- AWS 루트 계정은 잠그고 작업용 IAM 사용자(또는 IAM Identity Center)와 MFA 사용, 월 예산 경보(AWS Budgets) 설정
- API 키(Claude, fal, 토스 비밀키)는 Secrets Manager에만. 저장소에 넣지 않음
- 결제 확정은 반드시 서버에서 검증한 뒤 코인 지급 (인앱결제는 스토어 영수증 검증, 웹은 토스 승인 API). 웹훅은 서명 확인. 환불 알림(애플·구글 환불)이 오면 코인 회수
- 유료 회차 이미지는 서명 URL, 짧은 만료

## 6. 1인 개발 로드맵

| 단계 | 기간(안) | 결과 |
| --- | --- | --- |
| 0. 품질 잡기 | 2주 | 이 지침으로 Salt & Incense 1화 다시 제작, 화풍 확정, 고정 시험 세트와 채점표 검증, 회차당 비용 1만 원 이하 목표 |
| 1. 관리자 스튜디오 MVP | 4~6주 | AWS 기본 인프라(CDK: RDS, S3, CloudFront, SQS, Fargate 웹·제작 서버) 구성, 언어별 대사·말풍선 편집 포함, 로그인, 소재 라이브러리, 지침 관리, 작품·회차 제작 보드, 작업 큐와 제작 서버 연결, 컷 편집기(재생성·후보 선택·말풍선 수정) |
| 2. 독자 웹 + 회원 | 4~5주 | 홈, 탐색, 작품 상세, 뷰어, 로그인, 관심·댓글, 조회 이벤트. 한국어·영어 화면과 언어 전환(next-intl 등). 무료 오픈 베타 (3작품 × 10화 비축) |
| 3. 앱 출시와 결제 | 4~5주 | iOS·Android 앱 포장, 인앱결제(코인·패스), 회차 구매, 기다무, 환불 처리, 스토어 심사. 사업자 등록·통신판매업·개발자 계정은 준비 완료, 스토어 판매자 정산 정보와 앱 등록만 남음 |
| 4. 확장 | 이후 | 웹 결제(토스), 다른 언어(일본어, 스페인어 등), 모션·보이스툰, 추천, 이벤트, 외부 어시스턴트 계정 |

0단계는 대표가 지금 바로 할 수 있는 일이고, 1단계와 동시에 진행할 수 있어요. 애플 개발자 등록과 판매자 정보 심사, 첫 앱 심사에 시간이 걸리니 2단계 시작할 때 계정을 만들어 두는 게 좋아요.

## 7. 월 운영비 (초기 추정)

| 항목 | 월 비용 |
| --- | --- |
| RDS PostgreSQL (t4g.micro~small, 단일 AZ) | $15~35 |
| ECS Fargate 제작 서버 (작업 있을 때만) | $5~20 |
| ECS Fargate 웹 + ALB | $30~35 |
| S3 + CloudFront | 초기 수천 원~수만 원 (이미지 전송량 비례, CloudFront 월 1TB 무료) |
| SQS, EventBridge, Secrets Manager, CloudWatch | $5 안팎 |
| 제작비 (Claude + 이미지 + 영어판 대사·레터링) | 회차당 1만 원 목표 (영어판은 그림을 공유해서 회차당 1천 원 안팎 추가) × 월 24화(3작품 주 2회) ≈ 24만 원 |
| 도메인, 이메일 | 월 수천 원 |
| 결제 수수료 | 인앱결제는 매출의 15% (소규모 사업자 기준), 웹 결제는 약 3% |
| 개발자 계정 | 보유 중 (애플 연 99달러 갱신) |

AWS 인프라는 초기 월 $70~100(약 10~14만 원)으로 잡았어요 (자세한 내역은 [aws-deploy.md](aws-deploy.md)). 손익분기는 인앱 수수료 15%를 빼고 대략 패스 구독자 80~100명 수준이에요 (제작비와 고정비 약 40만 원 기준).

## 8. 기존 코드에서 옮겨올 것

`claude/project-thread-8mf8zv` 브랜치의 `production/`을 이 구조로 가져오며 바꿀 점이에요.

- 명령줄 단계(plan/decide/produce/letter)를 `jobs` 작업 유형으로 감싸기
- `runs/` 폴더의 JSON 결과를 `artifacts`, `panels`, `panel_images` 테이블로 옮기기
- `ledger.jsonl`을 `cost_ledger`, `decision_ledger`로
- `runs/`의 이미지 파일을 S3로, 명령줄 실행을 SQS 작업 실행기로 감싸서 Fargate 컨테이너 이미지로 빌드
- 에이전트 시스템 프롬프트(코드 안 문자열)를 `guideline_versions`에서 읽도록 바꾸기
- 지금은 영어 대본을 먼저 쓰는 구조라, 한국어 원고를 먼저 쓰고 영어 대사 에이전트가 따로 다시 쓰는 구조로 바꾸기 (02번 D-6)
