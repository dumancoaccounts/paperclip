import { z } from "zod";

export const issueWorkProductTypeSchema = z.enum([
  "preview_url",
  "runtime_service",
  "pull_request",
  "branch",
  "commit",
  "artifact",
  "document",
  "test_result",
  "screenshot",
  "report",
  "release_artifact",
  "manual_verification_note",
]);

export const issueEvidenceKindSchema = z.enum([
  "test_result",
  "screenshot",
  "pull_request",
  "report",
  "release_artifact",
  "document",
  "manual_verification_note",
]);

export const issueWorkProductStatusSchema = z.enum([
  "active",
  "ready_for_review",
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "failed",
  "archived",
  "draft",
]);

export const issueWorkProductReviewStateSchema = z.enum([
  "none",
  "needs_board_review",
  "approved",
  "changes_requested",
]);

export const issueEvidenceVerificationRoleSchema = z.enum([
  "minimum_verification",
  "expected_output",
  "completion_summary",
  "supporting",
]);

export const issueEvidenceValiditySchema = z.enum([
  "current",
  "stale",
  "superseded",
  "revoked",
]);

export const testResultMetadataSchema = z.object({
  command: z.string().optional(),
  exitCode: z.number().int().optional(),
  passed: z.boolean().optional(),
  testFramework: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  logExcerpt: z.string().optional(),
}).passthrough();

export const screenshotMetadataSchema = z.object({
  viewport: z.string().optional(),
  scenario: z.string().optional(),
  capturedAt: z.string().datetime().optional(),
  attachmentId: z.string().uuid().optional(),
}).passthrough();

export const manualVerificationMetadataSchema = z.object({
  verifierAgentId: z.string().uuid().optional(),
  verifierUserId: z.string().optional(),
  method: z.string().min(1),
  observedResult: z.string().min(1),
}).passthrough();

export const issueWorkProductMetadataSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const kind = typeof value.evidenceKind === "string" ? value.evidenceKind : null;
  const metadata = typeof value.metadata === "object" && value.metadata !== null
    ? value.metadata
    : value;
  const schema =
    kind === "test_result"
      ? testResultMetadataSchema
      : kind === "screenshot"
        ? screenshotMetadataSchema
        : kind === "manual_verification_note"
          ? manualVerificationMetadataSchema
          : null;
  if (!schema) return;
  const result = schema.safeParse(metadata);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue(issue);
    }
  }
});

const issueWorkProductBaseSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  executionWorkspaceId: z.string().uuid().optional().nullable(),
  runtimeServiceId: z.string().uuid().optional().nullable(),
  type: issueWorkProductTypeSchema,
  provider: z.string().min(1),
  externalId: z.string().optional().nullable(),
  title: z.string().min(1),
  url: z.string().url().optional().nullable(),
  status: issueWorkProductStatusSchema.default("active"),
  reviewState: issueWorkProductReviewStateSchema.optional().default("none"),
  isPrimary: z.boolean().optional().default(false),
  healthStatus: z.enum(["unknown", "healthy", "unhealthy"]).optional().default("unknown"),
  summary: z.string().optional().nullable(),
  metadata: issueWorkProductMetadataSchema.optional().nullable(),
  evidenceKind: issueEvidenceKindSchema.optional().nullable(),
  verificationRole: issueEvidenceVerificationRoleSchema.optional().default("supporting"),
  validity: issueEvidenceValiditySchema.optional().default("current"),
  satisfiesMinimumVerification: z.boolean().optional().default(false),
  coversExpectedOutput: z.boolean().optional().default(false),
  verifiedAt: z.coerce.date().optional().nullable(),
  staleAt: z.coerce.date().optional().nullable(),
  staleReason: z.string().optional().nullable(),
  supersededByWorkProductId: z.string().uuid().optional().nullable(),
  supersededAt: z.coerce.date().optional().nullable(),
  supersededReason: z.string().optional().nullable(),
  createdByRunId: z.string().uuid().optional().nullable(),
});

function validateEvidenceMetadata(
  value: { evidenceKind?: string | null; metadata?: Record<string, unknown> | null },
  ctx: z.RefinementCtx,
) {
  if (value.metadata && value.evidenceKind) {
    const result = issueWorkProductMetadataSchema.safeParse({
      evidenceKind: value.evidenceKind,
      metadata: value.metadata,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["metadata", ...issue.path] });
      }
    }
  }
}

export const createIssueWorkProductSchema = issueWorkProductBaseSchema.superRefine(validateEvidenceMetadata);

export type CreateIssueWorkProduct = z.infer<typeof createIssueWorkProductSchema>;

export const updateIssueWorkProductSchema = issueWorkProductBaseSchema.partial().superRefine(validateEvidenceMetadata);

export type UpdateIssueWorkProduct = z.infer<typeof updateIssueWorkProductSchema>;
