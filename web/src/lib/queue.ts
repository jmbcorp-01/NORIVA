import "server-only";
import { db, schema } from "@/db";
import type { Stage } from "./pipeline";

export type EnqueueInput = {
  type: Stage;
  seriesId: string;
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
      seriesId: input.seriesId,
      episodeId: input.episodeId ?? null,
      artifactId: input.artifactId ?? null,
      payload: input.payload ?? {},
    })
    .returning({ id: schema.jobs.id });

  const queueUrl = process.env.SQS_QUEUE_URL;
  if (queueUrl) {
    const { SQSClient, SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const client = new SQSClient({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
    await client.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ jobId: job.id }) }),
    );
  }
  return job.id;
}
