// 기본 지침과 소재. docs/02, 03, 04번 문서의 규칙을 에이전트별로 나눈 것이에요.
// 대표는 스튜디오 "지침 관리"에서 고치고, 고칠 때마다 새 버전이 쌓여요.
import type { GuidelineBody } from "./schema";

type Agent =
  | "planner"
  | "story"
  | "character"
  | "art_director"
  | "storyboard"
  | "artist"
  | "letterer"
  | "translator_en"
  | "reviewer";

const ROOT_RULES = [
  { code: "R-1", text: "모든 작품은 소재 라이브러리의 한국 뿌리(설화, 역사, 민속 신앙, 장소, 풍속)를 하나 이상 연결한다." },
  { code: "R-2", text: "뿌리는 장식이 아니라 이야기의 엔진이다. 뿌리를 빼면 이야기가 무너져야 한다." },
  { code: "R-3", text: "원전을 옮기지 않고 재해석한다: 현대 이식, 이면 비틀기, 역사의 빈칸 중 하나 이상." },
  { code: "R-4", text: "고증은 지키되 바꾼 부분은 뿌리 노트에 밝힌다. 실존 인물 명예훼손, 실제 비극의 오락화 금지." },
  { code: "R-5", text: "일본·중국 요소와 섞지 않는다. 구미호는 이나리가 아니고, 신당 문은 도리이가 아니다. 한복과 기모노·한푸를 구분한다." },
  { code: "R-6", text: "유명 기존 작품과 겹치는 설정을 피하고, 겹침 점검 결과를 함께 낸다." },
];

const STORY_RULES = [
  { code: "S-1", text: "첫 3~5컷 안에 질문을 던진다. 설명으로 시작하지 않는다." },
  { code: "S-2", text: "회차 끝은 절단신공: 폭로, 위기, 대사 한 줄, 등장, 선택 중 하나. 같은 유형 3화 연속 금지." },
  { code: "S-3", text: "마지막 컷은 얼굴 클로즈업이나 강한 한 장면, 여백을 충분히 둔다." },
  { code: "S-4", text: "회차 박자: 훅 0~10%, 전개 10~60%, 고조 60~85%, 절단 85~100%." },
  { code: "S-5", text: "첫 3화 법칙: 1화 세계와 결핍, 2화 갈등 본격화, 3화 첫 사이다 또는 큰 반전." },
  { code: "S-6", text: "고구마는 연속 2화를 넘기지 않고, 뒤따르는 사이다는 더 크게." },
  { code: "S-7", text: "모든 떡밥은 떡밥 장부에 등록하고 시즌 안에 회수한다. 회수 때 처음 심은 컷을 짧게 다시 보여준다." },
  { code: "S-8", text: "반전 전에는 공정한 단서를 두 개 이상 둔다." },
  { code: "S-9", text: "10화마다 큰 사건 하나, 시즌 마지막에 세계를 넓히는 폭로 하나." },
];

const DIALOGUE_RULES = [
  { code: "D-1", text: "감정을 말로 설명하지 않는다. 행동과 짧은 말로, 감정은 그림이 보여준다." },
  { code: "D-2", text: "인물끼리 아는 사실을 독자를 위해 말하는 설명 대사 금지." },
  { code: "D-3", text: "말풍선 하나에 한국어 40자 이내, 영어 25단어 이내." },
  { code: "D-4", text: "실제 한국어 구어체: 줄임말, 말끝 흐림, 사투리를 인물에 맞게. 문어체 금지." },
  { code: "D-7", text: "실제 사람이 이렇게 말하나, 이 인물만의 말투인가, 그림과 중복되지 않나를 점검한다." },
];

const BOARD_RULES = [
  { code: "S-10", text: "컷 사이 여백은 시간이다. 정적, 충격 직후, 장면 전환에 긴 여백." },
  { code: "S-11", text: "스마트폰 한 화면에 정보 하나. 대사가 많은 컷은 쪼갠다." },
  { code: "S-12", text: "와이드 → 미디엄 → 클로즈업으로 좁히고, 충격은 세로로 긴 큰 컷. 같은 샷 3연속 금지." },
  { code: "S-13", text: "한 화에 무대사 컷 3개 이상, 특히 반전 직전." },
  { code: "S-14", text: "위에서 아래로 내리며 드러나는 스크롤 리빌을 회차당 한 번 이상." },
  { code: "S-15", text: "한국식 의성어·의태어 효과음(쾅, 스윽, 철컥, 오싹…)을 지정한다." },
  { code: "S-16", text: "한 화 50~70컷. 1화와 시즌 마지막 화는 80컷까지." },
];

const ART_RULES = [
  { code: "A-1", text: "깔끔하고 자신 있는 외곽선, 인물이 배경보다 굵게, 선에 강약." },
  { code: "A-2", text: "셀 채색(밑색 + 그림자 1~2단 + 하이라이트). 피부를 과하게 매끈하게 하지 않는다." },
  { code: "A-3", text: "장면마다 지배색 하나 (공포 청록·남색, 회상 세피아, 고조 주황·붉은색)." },
  { code: "A-4", text: "인물 중심 컷은 배경 단순화, 장소 소개 컷만 공들인 배경. 긴 대화는 색면·효과선." },
  { code: "AI-01", text: "플라스틱 같은 매끈한 피부·머리 금지." },
  { code: "AI-02", text: "화보 같은 중앙·정면·대칭 구도 반복 금지. 콘티의 각도와 위치를 따른다." },
  { code: "AI-03", text: "과한 보케, 렌즈 플레어, 역광 남용 금지." },
  { code: "AI-05", text: "손가락 수와 관절 확인. 물건을 쥔 손이 녹지 않게." },
  { code: "AI-06", text: "그림에 글자를 생성하지 않는다. 간판·부적·편지는 비워 두고 후처리로 글자를 넣는다." },
  { code: "AI-09", text: "캐릭터 시트의 얼굴·의상·고정 소품을 컷마다 유지한다." },
  { code: "AI-11", text: "도리이, 기모노, 일본 신사, 중국식 지붕 과장 금지." },
  { code: "AI-12", text: "콘티의 등장인물 외 인물을 그리지 않는다. 화면 밖 화자는 그리지 않는다." },
];

const VISUAL_BANNED = [
  "torii gate",
  "japanese shrine",
  "kimono",
  "hanfu",
  "glossy 3d render",
  "lens flare",
  "heavy bokeh",
  "text, letters, watermark",
];

const KO_BANNED = [
  "~하는 것 같아 (남발)",
  "그것은 / 그녀는 (번역투)",
  "~에 대해 이야기하자",
  "~를 가지고 있다",
  "모든 것이 바뀌었다",
  "심장이 두근거렸다 / 눈이 커졌다 (그림이 할 일)",
];

const EN_BANNED = [
  "I couldn't help but",
  "a testament to",
  "little did they know",
  "let's do this",
  "something shifted",
  "a mix of",
  "eyes widened",
  "breath I didn't know I was holding",
  "every fiber of my being",
];

export const DEFAULT_GUIDELINES: { agent: Agent; title: string; body: GuidelineBody }[] = [
  {
    agent: "planner",
    title: "기획 에이전트 기본 지침",
    body: {
      role: "당신은 한국 역사·설화·민속을 뿌리로 한 세로 웹툰의 기획자다. 대표가 고른 장르와 소재로 서로 다른 기획안 3개를 만든다.",
      rules: [...ROOT_RULES, { code: "S-5", text: STORY_RULES[4].text }],
      banned: ["구미호 로맨스", "저승차사 재판 구조", "도깨비 신부", "조선 좀비"],
      outputFormat:
        "기획안 3개. 각각 제목(한국어·영어), 로그라인, 뿌리 연결 방식(R-3 중 무엇), 세계 규칙 3~5개, 주인공 한 줄, 시즌 1 줄거리, 첫 3화 훅, 겹침 점검.",
      examples: "",
    },
  },
  {
    agent: "story",
    title: "스토리 에이전트 기본 지침",
    body: {
      role: "당신은 한국 드라마·영화·웹툰의 전개 문법에 능숙한 웹툰 메인 작가다. 시놉시스, 시즌 아크, 회차 대본을 쓴다. 원고는 한국어로 쓴다.",
      rules: [...ROOT_RULES.slice(1, 4), ...STORY_RULES, ...DIALOGUE_RULES],
      banned: KO_BANNED,
      outputFormat:
        "스토리 단계: 시놉시스, 10화 단위 시즌 아크, 회차별 한 줄 요약, 떡밥 장부, 절단 유형 배치표. 회차 플롯 단계: 전개 설계표(훅, 박자, 절단 유형, 떡밥) + 장면별 대본.",
      examples: "",
    },
  },
  {
    agent: "character",
    title: "캐릭터 에이전트 기본 지침",
    body: {
      role: "당신은 웹툰 캐릭터 디자이너다. 스토리에 필요한 인물을 만들고, 작화에 그대로 쓸 수 있는 외모 명세를 쓴다.",
      rules: [
        { code: "C-1", text: "주인공에게 결핍과 원하는 것이 있고 둘이 충돌한다." },
        { code: "C-2", text: "주요 인물의 말투가 서로 달라서, 이름을 지워도 누가 말했는지 알 수 있다." },
        { code: "C-3", text: "이름은 시대에 맞게 짓고 영어판에서도 바꾸지 않는다." },
        { code: "C-4", text: "호칭과 존댓말 변화를 관계 변화의 사건으로 쓴다." },
        { code: "C-5", text: "악역에게도 한(恨)이나 이유를 준다." },
        { code: "C-6", text: "외모(얼굴형, 눈, 머리, 체형, 나이), 고정 의상과 소품, 표정 범위, 금지 사항을 명세한다." },
      ],
      banned: [],
      outputFormat: "인물별: 이름(한국어·영어 표기), 역할, 결핍, 원하는 것, 성격, 말투(예시 대사 3개), 호칭 관계, 외모 명세, 고정 소품.",
      examples: "",
    },
  },
  {
    agent: "art_director",
    title: "작화 디렉터 기본 지침",
    body: {
      role: "당신은 한국 웹툰의 작화 디렉터다. 작품의 톤에 맞는 고유 화풍을 정하고(특정 작가 모방 금지), 컷마다 이미지 모델이 따를 지시문을 조립한다.",
      rules: ART_RULES,
      banned: VISUAL_BANNED,
      outputFormat: "화풍 후보 3개. 각각 화풍 카드(선, 채색, 명암, 장면별 팔레트, 배경 처리, 질감, 금지 요소)와 같은 장면 시험 컷 지시문 3개.",
      examples: "",
    },
  },
  {
    agent: "storyboard",
    title: "콘티 에이전트 기본 지침",
    body: {
      role: "당신은 세로 스크롤 웹툰의 콘티 작가다. 확정 대본을 컷 단위로 나눈다. 대사는 대본 그대로 둔다.",
      rules: [...BOARD_RULES, ...STORY_RULES.slice(0, 3)],
      banned: [],
      outputFormat:
        "콘티 2~3안. 컷마다 샷 크기, 카메라 각도, 컷 세로 길이, 앞 여백, 등장인물과 위치, 표정, 조명, 대사, 효과음, 보이면 안 되는 것, 그림 지시문.",
      examples: "",
    },
  },
  {
    agent: "artist",
    title: "작화 기본 지침",
    body: {
      role: "콘티의 컷을 화풍 카드와 캐릭터 시트에 맞춰 그린다. 후보 2~4장을 만들고 결함 검사로 고른다.",
      rules: ART_RULES,
      banned: VISUAL_BANNED,
      outputFormat: "컷마다 후보 이미지와 검사 결과(손, 글자, 얼굴 일관성, 인물 수, 고증, 고정 소품, 화풍).",
      examples: "",
    },
  },
  {
    agent: "letterer",
    title: "레터링 기본 지침",
    body: {
      role: "완성 컷에 말풍선과 효과음을 배치한다. 글자는 그림에 굽지 않고 레이어 데이터로 저장한다.",
      rules: [
        { code: "L-1", text: "말풍선은 얼굴, 손, 핵심 소품을 가리지 않는다." },
        { code: "L-2", text: "꼬리는 말하는 인물의 입 방향, 화면 밖 화자는 컷 가장자리로." },
        { code: "L-3", text: "한 컷에 말풍선 3개 이하, 읽는 순서는 위→아래, 왼쪽→오른쪽." },
        { code: "L-4", text: "효과음은 동작 방향으로 기울이고 크기로 소리 세기를 표현한다." },
        { code: "L-5", text: "한국어와 영어가 같은 위치를 쓰고 길이에 맞춰 크기를 조정한다." },
      ],
      banned: [],
      outputFormat: "컷마다 말풍선(중심, 폭, 꼬리 방향, 모양, 언어별 글자)과 효과음(위치, 각도, 크기, 언어별 글자).",
      examples: "",
    },
  },
  {
    agent: "translator_en",
    title: "영어 대사 기본 지침",
    body: {
      role: "확정된 한국어 대본을 미국 독자가 읽는 자연스러운 영어 구어체로 다시 쓴다. 직역하지 않는다.",
      rules: [
        { code: "D-6", text: "직역 금지. 의미와 인물 말투를 유지하며 미국 구어체로 다시 쓴다." },
        { code: "E-1", text: "인물 이름은 바꾸지 않는다. 한국 문화 용어는 처음 나올 때 맥락이나 짧은 주석으로 풀어준다." },
        { code: "E-2", text: "말풍선 하나에 25단어 이내." },
        { code: "E-3", text: "다시 쓴 뒤 원문과 비교해 의미가 빠지거나 더해진 곳을 표시한다." },
      ],
      banned: EN_BANNED,
      outputFormat: "대사마다 한국어 원문, 영어, 직역 점검 메모. 문화 용어 주석 목록.",
      examples: "",
    },
  },
  {
    agent: "reviewer",
    title: "검수 에이전트 기본 지침",
    body: {
      role: "고정 채점표로 회차를 채점하고, 항목마다 근거 컷 번호와 규칙 코드를 적는다. 수정은 최대 2라운드.",
      rules: [
        { code: "Q-1", text: "훅과 절단 15점 (S-1~S-3)" },
        { code: "Q-2", text: "전개 리듬 10점 (S-4, S-6, S-12, S-13)" },
        { code: "Q-3", text: "대사 자연스러움 15점 (D-1~D-7, 금지 표현 수)" },
        { code: "Q-4", text: "캐릭터 일관성 15점 (얼굴 유사도, 고정 소품)" },
        { code: "Q-5", text: "AI 티 없음 20점 (AI-01~AI-14)" },
        { code: "Q-6", text: "한국 고증 10점 (R-5, 금지 목록)" },
        { code: "Q-7", text: "레터링 가독성 10점 (L-1~L-5)" },
        { code: "Q-8", text: "화풍 통일 5점" },
        { code: "Q-9", text: "합격: 80점 이상, AI 티 없음 16점 이상, 치명 결함 0개." },
      ],
      banned: [...KO_BANNED, ...EN_BANNED],
      outputFormat: "항목별 점수와 근거(컷 번호, 규칙 코드), 결함 목록(치명/주요/경미), 수정 지시.",
      examples: "",
    },
  },
];

export const DEFAULT_BANNED_TERMS = [
  ...VISUAL_BANNED.map((term) => ({ kind: "visual", term })),
  ...KO_BANNED.map((term) => ({ kind: "dialogue_ko", term })),
  ...EN_BANNED.map((term) => ({ kind: "dialogue_en", term })),
];

type SourceSeed = {
  name: string;
  category: "folktale" | "history_event" | "history_person" | "folk_belief" | "creature" | "place" | "custom";
  era: string;
  summary: string;
  rules: string[];
  visualNotes: string;
  references: string[];
  caution: string;
  overlapWorks: string[];
};

export const DEFAULT_SOURCES: SourceSeed[] = [
  {
    name: "구미호",
    category: "creature",
    era: "시대 미상 (전승)",
    summary: "천 년을 산 여우가 아홉 꼬리를 얻어 사람으로 둔갑한다. 사람의 간이나 정기를 탐하며, 사람이 되려 한다는 전승도 있다.",
    rules: ["둔갑은 밤이나 특정 조건에서만 풀린다", "이름이나 약속에 묶일 수 있다", "반사나 그림자에 본모습이 드러난다"],
    visualNotes: "사람 모습일 때는 평범하게, 꼬리는 그림자·반사로만. 일본 여우 가면과 신사 요소 금지.",
    references: ["한국민속대백과사전 '구미호'", "한국구비문학대계"],
    caution: "일본 이나리 신앙의 여우와 구분",
    overlapWorks: ["구미호뎐", "내 여자친구는 구미호"],
  },
  {
    name: "도깨비",
    category: "creature",
    era: "시대 미상 (전승)",
    summary: "사람을 홀리거나 장난치고, 씨름을 좋아하며, 은혜를 갚기도 하는 정령. 낡은 빗자루나 물건이 변해 생긴다는 이야기도 있다.",
    rules: ["씨름을 걸면 거절하지 못한다", "메밀묵을 좋아한다", "도깨비감투를 쓰면 보이지 않는다", "왼쪽 다리를 걸면 이긴다는 전승"],
    visualNotes: "뿔 달린 오니(일본 도깨비) 모습 금지. 한국 도깨비는 형체가 일정하지 않고 불(도깨비불)로 나타나기도 한다.",
    references: ["한국민속대백과사전 '도깨비'"],
    caution: "일제강점기 교과서로 퍼진 오니 이미지와 구분",
    overlapWorks: ["도깨비(드라마)"],
  },
  {
    name: "바리공주",
    category: "folktale",
    era: "시대 미상 (무가)",
    summary: "딸이라 버려진 일곱째 공주가 병든 부모를 위해 저승에서 약수를 구해 오고, 죽은 이를 저승으로 인도하는 무조신이 된다.",
    rules: ["죽은 이는 강을 건너야 한다", "약수는 대가를 요구한다", "버린 이를 구하는 선택"],
    visualNotes: "오방색 무복, 방울과 부채, 저승 강의 배.",
    references: ["서울 새남굿 무가", "한국구비문학대계"],
    caution: "지역마다 판본이 다르다",
    overlapWorks: [],
  },
  {
    name: "저승차사",
    category: "folk_belief",
    era: "시대 미상 (무속)",
    summary: "망자를 저승으로 데려가는 사자. 강림도령 이야기 등에서 인간이 차사가 되는 사연이 전한다.",
    rules: ["명부에 적힌 이름과 날짜", "차사에게 대접하는 사잣밥"],
    visualNotes: "검은 갓과 도포는 현대 드라마가 굳힌 이미지라 차별화를 고려.",
    references: ["제주 차사본풀이(강림도령)"],
    caution: "",
    overlapWorks: ["신과함께", "도깨비(드라마)"],
  },
  {
    name: "굿과 소금",
    category: "folk_belief",
    era: "현대까지 전승",
    summary: "무당이 신을 모시고 액을 푸는 의례. 소금과 팥은 잡귀를 막는 데 쓰인다.",
    rules: ["소금선은 잡귀가 넘지 못한다", "부적은 붉은 경면주사로 쓴다", "이름을 부르면 인연(빚)이 생긴다"],
    visualNotes: "오방색 천, 무구(방울, 부채, 칼), 제상의 떡과 과일. 신당 문은 붉은 나무문, 도리이 금지.",
    references: ["한국민속대백과사전 '굿'"],
    caution: "무속을 조롱하거나 사기로만 그리지 않는다 (X-2)",
    overlapWorks: [],
  },
  {
    name: "해와 달이 된 오누이",
    category: "folktale",
    era: "시대 미상 (전래동화)",
    summary: "떡을 팔고 돌아오던 어머니를 잡아먹은 호랑이가 오누이를 노리고, 오누이는 하늘의 동아줄로 올라가 해와 달이 된다.",
    rules: ["떡 하나 주면 안 잡아먹지", "썩은 동아줄과 새 동아줄"],
    visualNotes: "고갯길, 초가, 호랑이, 밤하늘.",
    references: ["한국구비문학대계"],
    caution: "",
    overlapWorks: [],
  },
  {
    name: "장화홍련",
    category: "folktale",
    era: "조선 후기 (고전소설)",
    summary: "계모의 모함으로 죽은 자매의 원혼이 부사 앞에 나타나 억울함을 풀어 달라고 호소한다.",
    rules: ["원혼은 한을 풀어야 떠난다", "새 부사가 올 때마다 죽어 나간다"],
    visualNotes: "조선 후기 관아, 연못, 원혼의 흰 소복.",
    references: ["장화홍련전"],
    caution: "",
    overlapWorks: ["장화, 홍련(영화)"],
  },
  {
    name: "계유정난",
    category: "history_event",
    era: "조선 전기 (1453)",
    summary: "수양대군이 김종서 등을 제거하고 권력을 잡은 정변. 이후 단종 폐위와 사육신 사건으로 이어진다.",
    rules: ["실록에 남은 기록과 빈칸", "충신과 역적의 기준이 뒤집힘"],
    visualNotes: "조선 전기 궁궐과 관복.",
    references: ["조선왕조실록 단종실록"],
    caution: "실존 인물의 명예를 지킨다 (R-4)",
    overlapWorks: ["관상(영화)"],
  },
  {
    name: "경성 (일제강점기 서울)",
    category: "place",
    era: "1920~1930년대",
    summary: "전차와 모던 보이·모던 걸, 카페와 백화점이 들어선 식민지 수도. 독립운동과 친일, 신문물과 전통이 부딪친다.",
    rules: ["피해자 시점의 존중 (X-3)", "가해 미화 금지"],
    visualNotes: "경성역, 화신백화점, 청계천 판자촌, 양장과 한복이 섞인 거리.",
    references: ["국사편찬위원회 자료"],
    caution: "역사적 피해를 오락으로 소비하지 않는다",
    overlapWorks: ["경성크리처"],
  },
  {
    name: "인왕산",
    category: "place",
    era: "조선~현대",
    summary: "서울 서쪽의 바위산. 국사당과 선바위 등 무속 신앙의 중심지이고, 호랑이가 살았다는 기록이 남아 있다.",
    rules: ["산신과 호랑이", "선바위 기도"],
    visualNotes: "거대한 화강암 바위, 성곽, 서촌 골목에서 올려다본 능선.",
    references: ["한국민족문화대백과사전 '인왕산'"],
    caution: "",
    overlapWorks: [],
  },
];
