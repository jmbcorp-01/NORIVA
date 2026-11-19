import { Notice, PageHeader } from "@/components/ui";
import { SourceForm } from "../source-form";

export default async function NewSourcePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <PageHeader title="소재 추가" sub="원전 주소를 적어 두면 에이전트가 원문을 참고할 수 있어요." />
      <Notice>{error}</Notice>
      <SourceForm />
    </>
  );
}
