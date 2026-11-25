# 독자 로그인 등록 안내

독자 로그인은 카카오, 네이버, Google, Apple 네 가지예요. 대표님이 각 회사 개발자 센터에 NORIVA를 등록하고, 받은 키를 AWS 비밀 값(Secrets Manager)에 넣으면 로그인 화면에 버튼이 나타나요. **키가 없는 로그인 수단은 화면에 나오지 않으니**, 한 곳씩 차례로 등록해도 돼요.

> 키(Client Secret, .p8 파일)는 채팅이나 저장소에 올리지 말고 AWS 비밀 값에만 넣어 주세요. 넣는 방법은 [aws-deploy.md](aws-deploy.md)의 "5. 비밀 값 채우기"와 같아요.

## 먼저 정할 것: 서비스 주소

모든 등록에 서비스 주소가 들어가요. 예를 들어 `https://k-noriva.com`라면 돌아오는 주소(Redirect URI, Callback URL)는 아래처럼 정해져요.

| 로그인 | 돌아오는 주소 |
| --- | --- |
| 카카오 | `https://k-noriva.com/auth/kakao/callback` |
| 네이버 | `https://k-noriva.com/auth/naver/callback` |
| Google | `https://k-noriva.com/auth/google/callback` |
| Apple | `https://k-noriva.com/auth/apple/callback` |

서비스 주소는 도메인을 붙여 배포하면 자동으로 정해져요([aws-deploy.md](aws-deploy.md)의 "3. 도메인 사기", "4. 배포"). 그래서 **도메인을 사고 한 번 배포한 뒤에** 아래 등록을 하는 순서가 좋아요. Apple은 `localhost`나 CloudFront 임시 주소를 받지 않아요.

로컬 개발에서는 카카오, 네이버, Google에 `http://localhost:3000/auth/<수단>/callback`을 추가로 등록하면 내 컴퓨터에서도 시험할 수 있어요.

## 1. 카카오 (developers.kakao.com)

1. 카카오 계정으로 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**. 앱 이름 `NORIVA`, 회사명은 사업자 상호.
2. **앱 키**의 **REST API 키**를 복사해요 → `KAKAO_CLIENT_ID`
3. **플랫폼 → Web**에 서비스 주소(`https://k-noriva.com`)를 등록해요.
4. **카카오 로그인**을 **활성화**하고, **Redirect URI**에 `https://k-noriva.com/auth/kakao/callback`을 넣어요.
5. **동의항목**: 닉네임을 "필수 동의"로 켜요. 이메일(카카오계정)은 **비즈 앱**으로 전환해야 받을 수 있어요. 앱 설정에서 사업자 정보로 비즈 앱 전환을 신청하고, 이메일을 "선택 동의"로 켜요.
6. (권장) **보안 → Client Secret**에서 코드를 만들고 "사용함"으로 바꿔요 → `KAKAO_CLIENT_SECRET`

## 2. 네이버 (developers.naver.com)

1. **Application → 애플리케이션 등록**. 사용 API는 **네이버 로그인**.
2. **제공 정보**: 별명(필수), 이메일 주소(선택).
3. **로그인 오픈 API 서비스 환경**: PC 웹과 모바일 웹을 추가하고, 서비스 URL에 `https://k-noriva.com`, Callback URL에 `https://k-noriva.com/auth/naver/callback`.
4. 등록 후 **Client ID** → `NAVER_CLIENT_ID`, **Client Secret** → `NAVER_CLIENT_SECRET`
5. 처음에는 "개발 중" 상태라 등록한 멤버만 로그인돼요. 출시 전에 **검수 요청**을 해야 모든 사람이 쓸 수 있어요. 검수에는 서비스 화면 캡처와 로그인 버튼 위치가 필요해서, 웹을 배포한 뒤에 신청해요.

## 3. Google (console.cloud.google.com)

1. 새 프로젝트 `NORIVA`를 만들어요.
2. **Google 인증 플랫폼(OAuth 동의 화면)**: 앱 이름, 지원 이메일, 로고, 홈페이지·개인정보 처리방침 주소를 넣고, 대상은 **외부**로 정해요. 범위는 `openid`, `email`, `profile`만 써요(추가 심사가 필요 없는 기본 범위).
3. **클라이언트 → 클라이언트 만들기**: 유형은 **웹 애플리케이션**, 승인된 리디렉션 URI에 `https://k-noriva.com/auth/google/callback`.
4. **클라이언트 ID** → `GOOGLE_CLIENT_ID`, **클라이언트 보안 비밀번호** → `GOOGLE_CLIENT_SECRET`
5. 앱 상태를 **프로덕션으로 게시**해요. 테스트 상태로 두면 등록한 테스트 사용자만 로그인돼요.

## 4. Apple (developer.apple.com → Certificates, Identifiers & Profiles)

iOS 앱에 카카오·네이버·Google 로그인을 넣으면 **Apple 로그인도 함께 제공해야** 앱 심사를 통과해요(App Store 심사 지침 4.8). 그래서 Apple은 꼭 등록해요.

1. **Identifiers → App IDs**: 앱의 번들 ID(예: `app.noriva.reader`)로 App ID를 만들고 **Sign in with Apple**을 켜요. (3단계 앱 출시 때도 같은 App ID를 써요.)
2. **Identifiers → Services IDs**: 웹 로그인용 ID(예: `app.noriva.web`)를 만들고 **Sign in with Apple**을 켠 뒤 **Configure**:
   - Primary App ID: 위에서 만든 App ID
   - Domains: `k-noriva.com`
   - Return URLs: `https://k-noriva.com/auth/apple/callback`
   - 이 Services ID 값 → `APPLE_CLIENT_ID`
3. **Keys → +**: 이름을 정하고 **Sign in with Apple**을 켠 뒤 Primary App ID를 고르고 만들어요. **.p8 파일은 한 번만 내려받을 수 있어요.** 안전한 곳에 보관해요.
   - Key ID → `APPLE_KEY_ID`
   - .p8 파일 내용 전체(`-----BEGIN PRIVATE KEY-----`부터 끝까지) → `APPLE_PRIVATE_KEY` (줄바꿈은 `\n`으로 바꿔 한 줄로 넣어도 돼요)
4. 화면 오른쪽 위의 **Team ID** → `APPLE_TEAM_ID`

## 넣을 비밀 값 정리

| 이름 | 어디서 |
| --- | --- |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` | 카카오 REST API 키, Client Secret(선택) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 Client ID, Secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google 웹 클라이언트 |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Services ID, Team ID, Key ID, .p8 내용 |

비밀 값을 바꾼 뒤에는 ECS의 Web 서비스를 "새 배포 강제"로 다시 시작해야 반영돼요.

## 회원 정보 처리 원칙

- 받는 정보는 제공자 고유 번호, 닉네임(이름), 확인된 이메일뿐이에요. 전화번호, 생년월일, 성별은 받지 않아요.
- 같은 이메일이라도 다른 로그인 수단은 자동으로 합치지 않아요 (계정 가로채기 방지).
- **내 정보 → 회원 탈퇴**에서 바로 탈퇴할 수 있고, 관심 작품과 읽은 기록이 함께 지워져요 (앱스토어 계정 삭제 요건). 결제가 붙는 3단계에서는 법정 보관 기간이 있는 결제 기록만 따로 남겨요.
- 개인정보 처리방침에 위탁·수집 항목(제공자별 위 정보)을 적어야 해요. 법무 준비 항목은 01번 기획서 9절을 따라요.
