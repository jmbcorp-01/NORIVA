import { Stack, type StackProps, aws_certificatemanager as acm, aws_route53 as route53 } from "aws-cdk-lib";
import type { Construct } from "constructs";

/**
 * CloudFront에 붙일 인증서는 반드시 us-east-1(버지니아)에서 만들어야 해서 스택을 따로 둬요.
 * Route 53의 같은 도메인 호스팅 영역에 DNS 확인 레코드를 자동으로 넣어 발급해요 (몇 분 걸려요).
 */
export class NorivaCertStack extends Stack {
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: StackProps & { domain: string }) {
    super(scope, id, props);
    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: props.domain });
    this.certificate = new acm.Certificate(this, "Cert", {
      domainName: props.domain,
      subjectAlternativeNames: [`www.${props.domain}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
