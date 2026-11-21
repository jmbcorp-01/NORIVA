/**
 * 사업자 정보 (전자상거래법 제10조·제13조 표시 의무). 공개 정보라 코드에 두고,
 * 바뀌면 운영 설정(BUSINESS_*)으로 덮어쓸 수 있어요. 비어 있으면 '등록 예정'으로 보여줘요.
 */
export const COMPANY_KO = "주식회사 제이엠비코퍼레이션";
export const COMPANY_EN = "Jmbcorp Co., Ltd.";

type Info = { company: string; ceo: string; regNo: string; salesNo: string; address: string; phone: string; email: string; privacyOfficer: string; hosting: string };

const DEFAULTS: { ko: Info; en: Info } = {
  ko: {
    company: COMPANY_KO,
    ceo: "서진호",
    regNo: "109-87-02378",
    salesNo: "2022-고양일산동-1250",
    address: "(10401) 경기도 고양시 일산동구 중앙로1275번길 60-30 (장항동, 라페스타B) 401-104호",
    phone: "031-812-0706",
    email: "",
    privacyOfficer: "서진호 (대표)",
    hosting: "Amazon Web Services, Inc.",
  },
  en: {
    company: COMPANY_EN,
    ceo: "Jin ho Seo",
    regNo: "109-87-02378",
    salesNo: "No. 2022-Goyang-Ilsandong-1250",
    address: "401-104, 60-30, Jungang-ro 1275beon-gil, Ilsandong-gu, Goyang-si, Gyeonggi-do, 10401, Rep. of KOREA",
    phone: "031-812-0706",
    email: "",
    privacyOfficer: "Jin ho Seo (CEO)",
    hosting: "Amazon Web Services, Inc.",
  },
};

export function businessInfo(locale: "ko" | "en" = "ko"): Info {
  const e = process.env;
  const v = (x: string | undefined) => (x && x.trim()) || "";
  const d = DEFAULTS[locale];
  return {
    ...d,
    ceo: (locale === "ko" && v(e.BUSINESS_CEO)) || d.ceo,
    regNo: v(e.BUSINESS_REG_NO) || d.regNo, // 사업자등록번호
    address: (locale === "ko" && v(e.BUSINESS_ADDRESS)) || d.address,
    phone: v(e.BUSINESS_PHONE) || d.phone,
    email: v(e.SUPPORT_EMAIL) || v(e.BUSINESS_EMAIL) || d.email,
  };
}
