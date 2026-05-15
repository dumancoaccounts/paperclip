export type IssueWorkProductType =
  | "preview_url"
  | "runtime_service"
  | "pull_request"
  | "branch"
  | "commit"
  | "artifact"
  | "document"
  | "test_result"
  | "screenshot"
  | "report"
  | "release_artifact"
  | "manual_verification_note";

export type IssueEvidenceKind =
  | "test_result"
  | "screenshot"
  | "pull_request"
  | "report"
  | "release_artifact"
  | "document"
  | "manual_verification_note";

export type IssueWorkProductProvider =
  | "paperclip"
  | "github"
  | "vercel"
  | "s3"
  | "custom";

export type IssueWorkProductStatus =
  | "active"
  | "ready_for_review"
  | "approved"
  | "changes_requested"
  | "merged"
  | "closed"
  | "failed"
  | "archived"
  | "draft";

export type IssueWorkProductReviewState =
  | "none"
  | "needs_board_review"
  | "approved"
  | "changes_requested";

export type IssueEvidenceVerificationRole =
  | "minimum_verification"
  | "expected_output"
  | "completion_summary"
  | "supporting";

export type IssueEvidenceValidity =
  | "current"
  | "stale"
  | "superseded"
  | "revoked";

export type IssueDeliveryEvidenceCloseConfidence =
  | "missing"
  | "weak"
  | "partial"
  | "ready"
  | "review_required";

export interface IssueDeliveryEvidenceSummary {
  closeConfidence: IssueDeliveryEvidenceCloseConfidence;
  primaryEvidenceId: string | null;
  minimumVerificationEvidenceId: string | null;
  expectedOutputEvidenceId: string | null;
  currentEvidenceCount: number;
  staleEvidenceCount: number;
  supersededEvidenceCount: number;
  missingReasons: string[];
  lastVerifiedAt: Date | null;
}

export interface IssueWorkProduct {
  id: string;
  companyId: string;
  projectId: string | null;
  issueId: string;
  executionWorkspaceId: string | null;
  runtimeServiceId: string | null;
  type: IssueWorkProductType;
  provider: IssueWorkProductProvider | string;
  externalId: string | null;
  title: string;
  url: string | null;
  status: IssueWorkProductStatus | string;
  reviewState: IssueWorkProductReviewState;
  isPrimary: boolean;
  healthStatus: "unknown" | "healthy" | "unhealthy";
  summary: string | null;
  metadata: Record<string, unknown> | null;
  evidenceKind: IssueEvidenceKind | null;
  verificationRole: IssueEvidenceVerificationRole;
  validity: IssueEvidenceValidity;
  satisfiesMinimumVerification: boolean;
  coversExpectedOutput: boolean;
  verifiedAt: Date | null;
  staleAt: Date | null;
  staleReason: string | null;
  supersededByWorkProductId: string | null;
  supersededAt: Date | null;
  supersededReason: string | null;
  createdByRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
