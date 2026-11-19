import { App } from "aws-cdk-lib";
import { NorivaStack } from "../lib/noriva-stack";

const app = new App();
// 스테이지: staging(출시 전 시험, 스토어 심사용) / prod(운영). 기본은 staging.
const stage = (app.node.tryGetContext("stage") as string) ?? "staging";

new NorivaStack(app, `Noriva-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-northeast-2", // 서울
  },
});
