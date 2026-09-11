export interface JobRecord {
  id: string;
  organizationId: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maximumAttempts: number;
}

export interface JobQueue {
  claim(now: Date): Promise<JobRecord | null>;
  complete(jobId: string, now: Date): Promise<void>;
  fail(job: JobRecord, error: unknown, now: Date): Promise<void>;
}

export type JobHandler = (job: JobRecord) => Promise<void>;
