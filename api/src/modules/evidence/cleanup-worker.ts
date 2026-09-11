import type { EvidenceStore } from "../../core/ports/evidence-store.js";
import type { WorkerLogger } from "../jobs/worker.js";
import type { EvidenceRepository } from "./repository.js";

export class EvidenceCleanupWorker {
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly repository: EvidenceRepository,
    private readonly store: EvidenceStore,
    private readonly logger: WorkerLogger,
    private readonly intervalMilliseconds = 60_000,
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMilliseconds);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    try {
      const expired = await this.repository.findExpired(new Date(), 100);
      for (const evidence of expired) {
        await this.store.delete(evidence.objectKey);
        await this.repository.markDeleted(evidence.id, new Date());
      }
      if (expired.length > 0) this.logger.info({ count: expired.length }, "expired evidence removed");
    } catch (error) {
      this.logger.error({ err: error }, "evidence cleanup failed");
    }
  }
}
