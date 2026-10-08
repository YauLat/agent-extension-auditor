export type OperationReason = "INPUT_PATH_UNAVAILABLE" | "REVIEW_STALE" | "REVIEW_REQUIRED" | "SCAN_INCOMPLETE" | "BASELINE_INVALID" | "BASELINE_OPERATION_FAILED" | "REVIEW_STATE_INVALID" | "REVIEW_STATE_BUSY";
export class AuditOperationError extends Error {
  constructor(public readonly reason: OperationReason, message: string) { super(message); }
}
