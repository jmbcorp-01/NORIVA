# NORIVA

한국의 역사, 설화, 민속을 뿌리로 한 웹툰을 AI 에이전트와 함께 만들어 한국어·영어로 연재하는 1인 웹툰 플랫폼이에요.

| 폴더 | 내용 |
| --- | --- |
| [`docs/`](docs/README.md) | 기획서, 콘텐츠·스토리 지침, 에이전트 파이프라인, 작화·품질 지침, 기술 설계, 브랜드, AWS 배포 안내 |
| [`web/`](web/README.md) | Next.js 앱: 관리자 스튜디오 (독자 앱은 2단계) |
| [`worker/`](worker/README.md) | 제작 서버: 큐의 작업을 꺼내 Claude 등 에이전트를 실행 |
| [`infra/`](docs/aws-deploy.md) | AWS 인프라 코드 (CDK, 서울 리전) |
