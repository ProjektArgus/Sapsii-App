import { jobs, type Database } from "@sapsii/db";
import { and, asc, eq, lte, or } from "drizzle-orm";
import type { JobQueue, JobRecord } from "../../modules/jobs/job-queue.js";

export class PostgresJobQueue implements JobQueue {
  public constructor(private readonly database: Database) {}

  public async claim(now: Date): Promise<JobRecord | null> {
    return this.database.transaction(async (transaction) => {
      const [job] = await transaction
        .select()
        .from(jobs)
        .where(
          or(
            and(eq(jobs.status, "pending"), lte(jobs.availableAt, now)),
            and(eq(jobs.status, "running"), lte(jobs.leasedUntil, now)),
          ),
        )
        .orderBy(asc(jobs.availableAt), asc(jobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!job) return null;

      const attempts = job.attempts + 1;
      await transaction
        .update(jobs)
        .set({
          status: "running",
          attempts,
          leasedUntil: new Date(now.getTime() + 30_000),
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));

      return {
        id: job.id,
        organizationId: job.organizationId,
        kind: job.kind,
        payload: job.payload,
        attempts,
        maximumAttempts: job.maximumAttempts,
      };
    });
  }

  public async complete(jobId: string, now: Date): Promise<void> {
    await this.database
      .update(jobs)
      .set({ status: "completed", completedAt: now, leasedUntil: null, updatedAt: now })
      .where(eq(jobs.id, jobId));
  }

  public async fail(job: JobRecord, error: unknown, now: Date): Promise<void> {
    const dead = job.attempts >= job.maximumAttempts;
    const retryDelaySeconds = Math.min(60, 2 ** Math.min(job.attempts, 6));
    await this.database
      .update(jobs)
      .set({
        status: dead ? "dead" : "pending",
        availableAt: dead ? now : new Date(now.getTime() + retryDelaySeconds * 1_000),
        leasedUntil: null,
        lastError: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
        updatedAt: now,
      })
      .where(eq(jobs.id, job.id));
  }
}
