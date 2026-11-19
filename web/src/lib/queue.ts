import "server-only";
import { db, schema } from "@/db";
import type { JobType } from "./pipeline";

export type EnqueueInput = {
  type: JobType;
  seriesId?: string | null;
  episodeId?: string | null;
  artifactId?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * 작업을 jobs 테이블에 기록하고, AWS에서는 SQS에도 넣어요.
 * SQS_QUEUE_URL이 없으면(로컬) 작업 실행기가 jobs 테이블을 직접 읽어요.
 */
export async function enqueueJob(input: EnqueueInput): Promise<string> {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      type: input.type,
      seriesId: input.seriesId ?? null,
      episodeId: input.episodeId ?? null,
      artifactId: input.artifactId ?? null,
      payload: input.payload ?? {},
    })
    .returning({ id: schema.jobs.id });

  await notifyWorker(job.id);
  return job.id;
}

/**
 * AWS에서 작업 id를 SQS에 넣고, 꺼져 있는 작업 서버를 깨워요.
 * 작업 서버는 할 일이 없으면 스스로 0대로 줄어들어요 (worker WORKER_IDLE_MINUTES).
 * 로컬(SQS_QUEUE_URL 없음)에서는 아무것도 하지 않아요.
 */
export async function notifyWorker(jobId: string): Promise<void> {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) return;
  const region = process.env.AWS_REGION ?? "ap-northeast-2";
  const { SQSClient, SendMessageCommand } = await import("@aws-sdk/client-sqs");
  await new SQSClient({ region }).send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ jobId }) }));
  // 메시지를 넣은 뒤에 확인해야, 작업 서버가 막 꺼지는 순간과 겹쳐도 작업이 남지 않아요.
  await wakeWorker(region).catch((e) => console.error("작업 서버 깨우기 실패", e));
}

async function wakeWorker(region: string): Promise<void> {
  const cluster = process.env.WORKER_CLUSTER;
  const service = process.env.WORKER_SERVICE;
  if (!cluster || !service) return;
  const { ECSClient, DescribeServicesCommand, UpdateServiceCommand } = await import("@aws-sdk/client-ecs");
  const ecs = new ECSClient({ region });
  const { services } = await ecs.send(new DescribeServicesCommand({ cluster, services: [service] }));
  if ((services?.[0]?.desiredCount ?? 0) > 0) return;
  await ecs.send(new UpdateServiceCommand({ cluster, service, desiredCount: 1 }));
}
