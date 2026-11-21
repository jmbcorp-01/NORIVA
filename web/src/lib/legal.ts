import { COMPANY_EN, COMPANY_KO } from "./business";

/**
 * 약관·방침 문서. 한국어가 기준이고 영어는 요약 번역이에요.
 * 법률 검토 전 초안이라, 운영 설정 LEGAL_REVIEWED=1이 되기 전까지 화면 위에 '검토 전 초안' 표시가 나와요.
 */

export type LegalDoc = { title: string; sections: { h: string; p: string[] }[] };
export type LegalKey = "terms" | "privacy" | "refund" | "copyright";

const C = COMPANY_KO;

const copyrightKo: LegalDoc = {
  title: "저작권 안내",
  sections: [
    {
      h: "1. 권리자",
      p: [
        `NORIVA(노리바)에서 제공하는 모든 작품과 그 구성요소(제목, 이야기, 대사, 인물과 설정, 그림, 말풍선과 연출, 표지, 로고)에 관한 저작권과 그 밖의 지식재산권은 ${C}(이하 '회사')에 있어요.`,
        "NORIVA 이름과 로고, 서비스 화면의 디자인도 회사의 권리예요.",
      ],
    },
    {
      h: "2. 작품을 만드는 방식",
      p: [
        "NORIVA의 작품은 회사가 기획하고, AI 도구를 활용해 제작한 뒤 회사 구성원이 고르고 고치고 검수해서 완성해요.",
        "회사는 작품마다 기획, 설정, 장면 선택, 수정, 편집, 연출에 들어간 사람의 창작 기여를 기록으로 남기고 있어요. 작품에 대한 권리는 이 창작 기여와 작품 전체의 편집·구성에 근거해요.",
        "작품 제작에 쓴 AI 도구는 제공사 약관에 따라 결과물을 상업적으로 쓸 수 있는 조건으로만 사용해요.",
      ],
    },
    {
      h: "3. 허용하지 않는 이용",
      p: [
        "회사의 서면 허락 없이 다음 행위를 할 수 없어요.",
        "· 작품 화면, 그림, 대사를 캡처·저장·복제해서 다른 곳에 올리거나 나누는 행위 (개인 감상 범위를 넘는 경우)",
        "· 작품을 번역·편집·재가공해서 배포하거나, 다른 작품·굿즈·광고에 쓰는 행위",
        "· 작품을 AI 학습 데이터로 수집하거나, 자동 수집 프로그램(크롤러·스크래퍼)으로 내려받는 행위",
        "· 유료 회차를 다른 사람이 무료로 볼 수 있게 공유하는 행위",
        "· 회사나 NORIVA를 사칭하거나 작품의 출처 표시를 지우는 행위",
      ],
    },
    {
      h: "4. 위반 시 책임",
      p: [
        "무단 이용이 확인되면 회사는 게시물 삭제를 요청하고, 서비스 이용을 제한하며, 민사·형사상 법적 조치를 할 수 있어요.",
        "저작권법 제136조에 따라 저작재산권을 침해한 사람은 5년 이하의 징역 또는 5천만 원 이하의 벌금에 처해지거나 이를 함께 받을 수 있어요.",
        "회사는 저작권법 제125조에 따른 손해배상과, 부정경쟁방지 및 영업비밀보호에 관한 법률에 따른 성과물 무단 사용 금지·손해배상을 청구할 수 있어요.",
        "이용약관을 어기고 작품을 무단 이용한 경우 약관에 따른 손해배상 책임도 함께 져요.",
      ],
    },
    {
      h: "5. 허락과 신고",
      p: [
        "작품을 소개·인용·2차 창작에 쓰고 싶다면 고객센터로 먼저 문의해 주세요. 출처를 밝힌 짧은 소개(표지 1장과 작품 소개 글)는 허락 없이도 괜찮아요.",
        "무단 이용을 발견하면 고객센터로 알려 주세요.",
      ],
    },
  ],
};

const copyrightEn: LegalDoc = {
  title: "Copyright",
  sections: [
    {
      h: "1. Rights holder",
      p: [
        `All series on NORIVA and their elements (titles, stories, dialogue, characters and settings, artwork, lettering and staging, covers, logos) are the copyright and intellectual property of ${COMPANY_EN} ("the Company").`,
        "The NORIVA name, logo and service design also belong to the Company.",
      ],
    },
    {
      h: "2. How we make our series",
      p: [
        "NORIVA series are planned by the Company, produced with AI tools, then selected, revised and reviewed by Company staff.",
        "We keep a record of the human creative contribution in each series (planning, settings, scene selection, revisions, editing and staging). Our rights rest on that contribution and on the editing and arrangement of the whole work.",
        "We only use AI tools whose terms allow commercial use of their output.",
      ],
    },
    {
      h: "3. What is not allowed",
      p: [
        "Without written permission from the Company, you may not:",
        "· capture, save, copy or share screens, art or dialogue beyond personal viewing",
        "· translate, edit or rework a series for distribution, or use it in other works, merchandise or ads",
        "· collect series for AI training or download them with crawlers or scrapers",
        "· share paid episodes so others can read them free",
        "· impersonate the Company or NORIVA, or remove attribution",
      ],
    },
    {
      h: "4. Liability",
      p: [
        "If we find unauthorized use, we may request takedowns, restrict accounts, and take civil and criminal action.",
        "Under Article 136 of the Korean Copyright Act, infringing economic rights can be punished by up to 5 years in prison, a fine of up to KRW 50 million, or both. Equivalent laws apply in other countries, including the U.S. Copyright Act and the DMCA.",
        "The Company may also claim damages under the Copyright Act and the Unfair Competition Prevention Act, and under our Terms of Service.",
      ],
    },
    {
      h: "5. Permission and reports",
      p: ["To feature, quote or adapt a series, contact us first. A short, credited introduction (one cover image and the series description) is fine without asking.", "To report unauthorized use, contact Help."],
    },
  ],
};

const termsKo: LegalDoc = {
  title: "이용약관",
  sections: [
    { h: "제1조 (목적)", p: [`이 약관은 ${C}(이하 '회사')가 제공하는 웹툰 서비스 NORIVA(웹과 앱, 이하 '서비스')를 이용하는 조건과 절차, 회사와 회원의 권리·의무를 정해요.`] },
    { h: "제2조 (정의)", p: ["'회원'은 이 약관에 동의하고 소셜 계정으로 가입한 사람이에요.", "'코인'은 유료 회차를 열 때 쓰는 서비스 안의 결제 수단이에요. 결제로 충전한 '충전 코인'과 이벤트로 받은 '보너스 코인'이 있어요.", "'패스'는 매달 요금을 내고 공개된 회차를 제한 없이 보는 구독 상품이에요."] },
    { h: "제3조 (약관의 효력과 변경)", p: ["약관은 서비스 화면에 게시해서 효력이 생겨요. 회사가 약관을 바꿀 때는 시행 7일 전(회원에게 불리하면 30일 전)부터 알려요."] },
    { h: "제4조 (가입과 탈퇴)", p: ["회원은 언제든지 '내 정보 > 계정'에서 탈퇴할 수 있어요. 탈퇴하면 관심 작품, 읽은 기록, 남은 코인, 소장 회차가 사라지고 되돌릴 수 없어요. 남은 충전 코인은 탈퇴 전에 환불을 요청해 주세요."] },
    { h: "제5조 (서비스 이용)", p: ["작품은 무료 회차, 기다리면 무료 회차, 코인 회차, 선공개 회차로 나뉘고, 각 회차의 조건은 작품 화면에 표시해요.", "코인으로 연 회차는 서비스가 유지되는 동안 계속 볼 수 있어요. 기다리면 무료로 연 회차도 계속 볼 수 있어요."] },
    { h: "제6조 (코인과 결제)", p: ["코인은 앱스토어(App Store, Google Play) 결제 또는 회사가 정한 결제 수단으로 충전해요. 보너스 코인을 먼저 쓰고, 그다음 충전 코인을 써요.", "보너스 코인은 받은 날부터 정해진 기간이 지나면 소멸할 수 있고, 기간은 받을 때 알려요. 충전 코인은 마지막 사용일부터 5년이 지나면 소멸해요."] },
    { h: "제7조 (청약철회와 환불)", p: ["환불은 '환불 규정'을 따라요."] },
    { h: "제8조 (저작권)", p: ["서비스의 작품과 화면에 관한 권리는 회사에 있어요. 자세한 내용과 무단 이용 시 책임은 '저작권 안내'를 따라요."] },
    { h: "제9조 (회원의 의무)", p: ["회원은 계정을 다른 사람과 나눠 쓰거나, 유료 회차를 무단으로 공유하거나, 자동 프로그램으로 서비스를 이용하거나, 서비스 운영을 방해해서는 안 돼요. 어기면 회사는 이용을 제한하고 손해배상을 청구할 수 있어요."] },
    { h: "제10조 (책임의 제한)", p: ["회사는 천재지변, 통신 장애처럼 회사가 막을 수 없는 사유로 서비스를 제공하지 못한 경우 책임을 지지 않아요. 다만 회사의 고의나 과실이 있으면 책임을 져요."] },
    { h: "제11조 (분쟁 해결)", p: ["이 약관은 대한민국 법을 따르고, 분쟁은 민사소송법에 따른 관할 법원에서 해결해요."] },
  ],
};

const privacyKo: LegalDoc = {
  title: "개인정보 처리방침",
  sections: [
    { h: "1. 모으는 정보", p: ["· 가입: 소셜 로그인 제공자(카카오, 네이버, Google, Apple)가 주는 회원 번호, 이메일(제공에 동의한 경우), 닉네임", "· 이용: 읽은 회차와 위치, 관심 작품, 회차 반응, 코인·결제 기록, 접속 기록", "· 결제: 스토어 거래 번호와 상품 정보 (카드 번호 등 결제 정보는 회사가 받지 않아요)"] },
    { h: "2. 쓰는 목적", p: ["회원 확인, 이어 보기와 내 서재, 유료 회차 제공과 환불, 부정 이용 방지, 서비스 개선과 통계"] },
    { h: "3. 보관 기간", p: ["탈퇴하면 바로 지워요. 다만 법에 따라 보관해야 하는 기록은 그 기간 동안 따로 보관해요.", "· 대금 결제와 재화 공급 기록: 5년 (전자상거래법)", "· 소비자 불만과 분쟁 처리 기록: 3년 (전자상거래법)", "· 접속 기록: 3개월 (통신비밀보호법)"] },
    { h: "4. 다른 곳에 맡기는 일", p: ["· Amazon Web Services: 서버와 데이터 보관 (서울 리전)", "· Apple, Google: 앱 결제", "· 카카오, 네이버, Google, Apple: 로그인"] },
    { h: "5. 제3자 제공", p: ["법에 정해진 경우를 빼고 회원 동의 없이 개인정보를 다른 곳에 주지 않아요."] },
    { h: "6. 회원의 권리", p: ["회원은 언제든지 자기 정보를 보고, 고치고, 지우거나 처리를 멈추도록 요청할 수 있어요. '내 정보'에서 직접 하거나 고객센터로 요청해 주세요."] },
    { h: "7. 안전하게 지키는 방법", p: ["전송 구간 암호화(HTTPS), 데이터베이스 외부 접근 차단, 비밀 값 별도 보관, 관리자 2단계 인증, 접근 기록 보관"] },
    { h: "8. 개인정보 보호책임자", p: ["사업자 정보 화면의 연락처로 문의해 주세요."] },
  ],
};

const refundKo: LegalDoc = {
  title: "환불 규정",
  sections: [
    { h: "1. 코인 환불", p: ["충전한 날부터 7일 안에, 하나도 쓰지 않은 충전 코인은 전액 환불받을 수 있어요.", "7일이 지났거나 일부를 쓴 경우에는 남은 충전 코인을 환불받을 수 있어요. 이때 결제 수수료 등 법에서 허용하는 범위의 금액을 빼고 돌려드릴 수 있어요.", "보너스 코인은 환불되지 않아요."] },
    { h: "2. 회차", p: ["코인으로 연 회차는 열자마자 이용이 시작돼서 청약철회가 제한돼요 (전자상거래법 제17조 제2항). 이 사실은 회차를 열기 전에 알려드려요.", "회차 파일에 문제가 있어 볼 수 없으면 쓴 코인을 돌려드려요."] },
    { h: "3. 패스", p: ["패스는 언제든지 해지할 수 있고, 해지해도 이미 낸 기간이 끝날 때까지 계속 볼 수 있어요.", "결제 후 7일 안에 한 번도 쓰지 않았다면 전액 환불받을 수 있어요."] },
    { h: "4. 앱스토어 결제", p: ["App Store, Google Play에서 결제한 경우 환불 절차는 각 스토어의 정책을 따르고, 스토어에서 환불되면 그 결제로 받은 코인을 회수해요. 이미 쓴 코인이 있으면 남은 코인만 회수해요."] },
    { h: "5. 신청 방법", p: ["고객센터로 회원 닉네임, 결제 일시, 결제 수단을 알려 주세요. 영업일 기준 3일 안에 답변드려요."] },
  ],
};

export const LEGAL: Record<LegalKey, { ko: LegalDoc; en: LegalDoc }> = {
  terms: { ko: termsKo, en: termsKo },
  privacy: { ko: privacyKo, en: privacyKo },
  refund: { ko: refundKo, en: refundKo },
  copyright: { ko: copyrightKo, en: copyrightEn },
};

export function legalReviewed() {
  return process.env.LEGAL_REVIEWED === "1";
}
