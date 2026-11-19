import { App } from "aws-cdk-lib";
import { NorivaStack } from "../lib/noriva-stack";
import { NorivaCertStack } from "../lib/cert-stack";

const app = new App();
// 스테이지: staging(출시 전 시험, 스토어 심사용) / prod(운영). 기본은 staging.
const stage = (app.node.tryGetContext("stage") as string) ?? "staging";
// 서비스 도메인: npx cdk deploy --all -c domain=k-noriva.com (Route 53에 호스팅 영역이 있어야 해요)
const domain = (app.node.tryGetContext("domain") as string | undefined)?.trim() || undefined;
const account = process.env.CDK_DEFAULT_ACCOUNT;

const cert = domain
  ? new NorivaCertStack(app, `Noriva-${stage}-Cert`, {
      domain,
      env: { account, region: "us-east-1" },
      crossRegionReferences: true,
    })
  : undefined;

new NorivaStack(app, `Noriva-${stage}`, {
  stage,
  domain,
  certificate: cert?.certificate,
  crossRegionReferences: Boolean(cert),
  env: {
    account,
    region: "ap-northeast-2", // 서울
  },
});
