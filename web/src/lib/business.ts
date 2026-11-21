/**
 * 사업자 정보 (전자상거래법 표시 의무). 회사 이름은 대표 결정으로 고정이고,
 * 나머지는 운영 설정(BUSINESS_*)에서 읽어요. 비어 있으면 '등록 예정'으로 보여줘요.
 */
export const COMPANY_KO = "주식회사 제이엠비코퍼레이션";
export const COMPANY_EN = "JMB Corporation Inc.";

export function businessInfo() {
  const e = process.env;
  const v = (x: string | undefined) => (x && x.trim()) || "";
  return {
    company: COMPANY_KO,
    ceo: v(e.BUSINESS_CEO),
    regNo: v(e.BUSINESS_REG_NO), // 사업자등록번호
    salesNo: v(e.BUSINESS_SALES_NO), // 통신판매업 신고번호
    address: v(e.BUSINESS_ADDRESS),
    phone: v(e.BUSINESS_PHONE),
    email: v(e.SUPPORT_EMAIL) || v(e.BUSINESS_EMAIL),
    privacyOfficer: v(e.PRIVACY_OFFICER),
  };
}
