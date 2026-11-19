import * as path from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Token,
  type StackProps,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_rds as rds,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import type { Construct } from "constructs";

type Props = StackProps & {
  stage: string;
  /** 서비스 도메인 (예: noriva.app). Route 53에 호스팅 영역이 있어야 해요. 없으면 CloudFront 기본 주소로만 열려요. */
  domain?: string;
  /** 도메인 인증서 (CloudFront 규칙상 us-east-1에서 만들어요, NorivaCertStack) */
  certificate?: acm.ICertificate;
};

/**
 * NORIVA 전체 인프라 (docs/05-technical-design.md 2절)
 *
 * 인터넷 → CloudFront → ALB → 웹(Next.js, Fargate) → RDS PostgreSQL (외부 접근 불가)
 *                                         └→ SQS → 제작 서버(Python, Fargate) → Claude, fal.ai
 * 이미지: S3 (비공개) → CloudFront
 *
 * 비용을 아끼려고 NAT 게이트웨이를 쓰지 않아요. 컨테이너는 공용 서브넷에서 공인 IP로 바깥 API를 부르고,
 * 보안 그룹으로 들어오는 연결을 막아요. DB는 인터넷 경로가 없는 격리 서브넷에 둬요.
 */
export class NorivaStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const prod = props.stage === "prod";
    const repoRoot = path.join(__dirname, "..", "..");

    /* ─── 네트워크 ─── */
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "db", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    /* ─── DB ─── */
    const dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc, description: "NORIVA RDS" });
    const db = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, prod ? ec2.InstanceSize.SMALL : ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      databaseName: "noriva",
      credentials: rds.Credentials.fromGeneratedSecret("noriva"),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: Duration.days(7),
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      multiAz: false,
    });

    /* ─── 이미지 저장소와 배포 ─── */
    const assets = new s3.Bucket(this, "Assets", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: prod,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !prod,
    });

    /* ─── 작업 큐 ─── */
    const dlq = new sqs.Queue(this, "JobsDlq", { retentionPeriod: Duration.days(14) });
    const queue = new sqs.Queue(this, "Jobs", {
      // 글 단계는 몇 분 걸릴 수 있어서 넉넉히
      visibilityTimeout: Duration.minutes(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    /* ─── 비밀 값: 배포 뒤 콘솔에서 값을 채워요 (docs/aws-deploy.md) ─── */
    const appSecret = new secretsmanager.Secret(this, "AppSecret", {
      description: "NORIVA 앱 비밀 값: SESSION_SECRET, STUDIO_OWNER_EMAIL, STUDIO_OWNER_PASSWORD_HASH, ANTHROPIC_API_KEY, FAL_KEY, 독자 로그인 키",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          STUDIO_OWNER_EMAIL: "",
          STUDIO_OWNER_PASSWORD_HASH: "",
          ANTHROPIC_API_KEY: "",
          FAL_KEY: "",
          // 독자 로그인 (docs/login-setup.md). 서비스 주소(APP_URL)는 배포할 때 자동으로 들어가요.
          KAKAO_CLIENT_ID: "",
          KAKAO_CLIENT_SECRET: "",
          NAVER_CLIENT_ID: "",
          NAVER_CLIENT_SECRET: "",
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          APPLE_CLIENT_ID: "",
          APPLE_TEAM_ID: "",
          APPLE_KEY_ID: "",
          APPLE_PRIVATE_KEY: "",
        }),
        generateStringKey: "SESSION_SECRET",
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    /* ─── 컨테이너 ─── */
    const cluster = new ecs.Cluster(this, "Cluster", { vpc, containerInsightsV2: ecs.ContainerInsights.DISABLED });
    const dbSecret = db.secret!;
    const dbEnvSecrets = {
      DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
      DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, "port"),
      DB_NAME: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
      DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
    };
    const logRetention = prod ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS;

    // 웹 (독자 + 스튜디오)
    const webTask = new ecs.FargateTaskDefinition(this, "WebTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    const webContainer = webTask.addContainer("web", {
      image: ecs.ContainerImage.fromAsset(path.join(repoRoot, "web"), { platform: Platform.LINUX_ARM64 }),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "web", logRetention }),
      environment: {
        NODE_ENV: "production",
        DB_SSL: "true",
        SQS_QUEUE_URL: queue.queueUrl,
        AWS_REGION: this.region,
        ASSETS_BUCKET: assets.bucketName,
      },
      secrets: {
        ...dbEnvSecrets,
        SESSION_SECRET: ecs.Secret.fromSecretsManager(appSecret, "SESSION_SECRET"),
        STUDIO_OWNER_EMAIL: ecs.Secret.fromSecretsManager(appSecret, "STUDIO_OWNER_EMAIL"),
        STUDIO_OWNER_PASSWORD_HASH: ecs.Secret.fromSecretsManager(appSecret, "STUDIO_OWNER_PASSWORD_HASH"),
        ...Object.fromEntries(
          ["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"].map((k) => [k, ecs.Secret.fromSecretsManager(appSecret, k)]),
        ),
      },
      healthCheck: {
        command: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"],
        interval: Duration.seconds(30),
        startPeriod: Duration.seconds(30),
      },
    });
    queue.grantSendMessages(webTask.taskRole);
    assets.grantReadWrite(webTask.taskRole);

    const webSg = new ec2.SecurityGroup(this, "WebSg", { vpc, description: "NORIVA web tasks" });
    const web = new ecs.FargateService(this, "Web", {
      cluster,
      taskDefinition: webTask,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [webSg],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
    });

    const albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc, description: "NORIVA ALB" });
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", { vpc, internetFacing: true, securityGroup: albSg });
    // CloudFront를 거친 요청만 받도록 CloudFront가 붙이는 헤더 값을 확인해요 (스택마다 고유한 값)
    const originVerify = `nv-${this.node.addr}`;
    const listener = alb.addListener("Http", {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: "text/plain", messageBody: "forbidden" }),
    });
    listener.addTargets("WebTarget", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [web],
      priority: 1,
      conditions: [elbv2.ListenerCondition.httpHeader("x-noriva-origin", [originVerify])],
      healthCheck: { path: "/api/health", healthyHttpCodes: "200" },
      deregistrationDelay: Duration.seconds(15),
    });
    webSg.addIngressRule(albSg, ec2.Port.tcp(3000), "ALB to web");
    albSg.addIngressRule(cloudFrontPeer(this), ec2.Port.tcp(80), "CloudFront only");
    dbSg.addIngressRule(webSg, ec2.Port.tcp(5432), "web to db");

    // 제작 서버 (작업 실행기)
    const workerTask = new ecs.FargateTaskDefinition(this, "WorkerTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    workerTask.addContainer("worker", {
      image: ecs.ContainerImage.fromAsset(path.join(repoRoot, "worker"), { platform: Platform.LINUX_ARM64 }),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "worker", logRetention }),
      environment: {
        DB_SSL: "true",
        SQS_QUEUE_URL: queue.queueUrl,
        AWS_REGION: this.region,
        ASSETS_BUCKET: assets.bucketName,
      },
      secrets: {
        ...dbEnvSecrets,
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(appSecret, "ANTHROPIC_API_KEY"),
        FAL_KEY: ecs.Secret.fromSecretsManager(appSecret, "FAL_KEY"),
      },
    });
    queue.grantConsumeMessages(workerTask.taskRole);
    assets.grantReadWrite(workerTask.taskRole);
    const workerSg = new ec2.SecurityGroup(this, "WorkerSg", { vpc, description: "NORIVA worker (outbound only)" });
    dbSg.addIngressRule(workerSg, ec2.Port.tcp(5432), "worker to db");
    new ecs.FargateService(this, "Worker", {
      cluster,
      taskDefinition: workerTask,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [workerSg],
      minHealthyPercent: 0,
      circuitBreaker: { rollback: true },
    });

    /* ─── CloudFront ─── */
    const domain = props.domain;
    // www.도메인으로 들어오면 도메인으로 보내요. 로그인 쿠키와 돌아오는 주소가 한 곳이어야 해서요.
    const wwwRedirect = domain
      ? new cloudfront.Function(this, "WwwRedirect", {
          runtime: cloudfront.FunctionRuntime.JS_2_0,
          code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var host = event.request.headers.host && event.request.headers.host.value;
  if (host === "www.${domain}") {
    var qs = Object.keys(event.request.querystring).length ? "?" + Object.keys(event.request.querystring).map(function (k) { var v = event.request.querystring[k]; return encodeURIComponent(k) + (v.value ? "=" + encodeURIComponent(v.value) : ""); }).join("&") : "";
    return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: "https://${domain}" + event.request.uri + qs } } };
  }
  return event.request;
}`),
        })
      : undefined;
    const cdn = new cloudfront.Distribution(this, "Cdn", {
      comment: `NORIVA ${props.stage}`,
      ...(domain && props.certificate ? { domainNames: [domain, `www.${domain}`], certificate: props.certificate } : {}),
      defaultBehavior: {
        ...(wwwRedirect ? { functionAssociations: [{ function: wwwRedirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }] } : {}),
        origin: new origins.LoadBalancerV2Origin(alb, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          customHeaders: { "x-noriva-origin": originVerify },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: new origins.LoadBalancerV2Origin(alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            customHeaders: { "x-noriva-origin": originVerify },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        "/media/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(assets),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // 한국, 일본, 미국, 유럽 포함
    });

    const appUrl = domain ? `https://${domain}` : `https://${cdn.distributionDomainName}`;
    // 소셜 로그인이 돌아올 주소의 기준 (docs/login-setup.md)
    webContainer.addEnvironment("APP_URL", appUrl);

    if (domain) {
      const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: domain });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdn));
      for (const name of [domain, `www.${domain}`]) {
        const id = name === domain ? "Apex" : "Www";
        new route53.ARecord(this, `${id}A`, { zone, recordName: name, target });
        new route53.AaaaRecord(this, `${id}Aaaa`, { zone, recordName: name, target });
      }
    }

    new CfnOutput(this, "Url", { value: appUrl });
    new CfnOutput(this, "CloudFrontUrl", { value: `https://${cdn.distributionDomainName}` });
    new CfnOutput(this, "AppSecretName", { value: appSecret.secretName });
    new CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
    new CfnOutput(this, "AssetsBucket", { value: assets.bucketName });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "WebServiceName", { value: web.serviceName });
  }
}

// CloudFront가 원본에 연결할 때 쓰는 AWS 관리형 IP 목록만 ALB에 들어오게 해요.
// 계정 없이 synth만 할 때(로컬 확인)는 조회할 수 없어서 임시로 모두 허용하고, 헤더 검사가 막아요.
function cloudFrontPeer(stack: Stack): ec2.IPeer {
  if (Token.isUnresolved(stack.account)) return ec2.Peer.anyIpv4();
  const pl = ec2.PrefixList.fromLookup(stack, "CloudFrontOriginFacing", {
    prefixListName: "com.amazonaws.global.cloudfront.origin-facing",
  });
  return ec2.Peer.prefixList(pl.prefixListId);
}
