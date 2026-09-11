import type { JobHandler, JobQueue } from "./job-queue.js";

export interface WorkerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export class JobWorker {
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly queue: JobQueue,
    private readonly handlers: ReadonlyMap<string, JobHandler>,
    private readonly logger: WorkerLogger,
    private readonly idleMilliseconds = 500,
  ) {}

  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    let delay = 0;
    try {
      const job = await this.queue.claim(new Date());
      if (!job) {
        delay = this.idleMilliseconds;
      } else {
        const handler = this.handlers.get(job.kind);
        if (!handler) {
          const error = new Error(`No handler registered for job kind ${job.kind}`);
          await this.queue.fail(job, error, new Date());
          this.logger.error({ err: error, jobId: job.id, kind: job.kind }, "background job has no handler");
        } else {
          try {
            await handler(job);
            await this.queue.complete(job.id, new Date());
          } catch (error) {
            await this.queue.fail(job, error, new Date());
            this.logger.error({ err: error, jobId: job.id, kind: job.kind }, "background job failed");
          }
        }
      }
    } catch (error) {
      delay = this.idleMilliseconds;
      this.logger.error({ err: error }, "job worker polling failed");
    }

    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), delay);
  }
}
