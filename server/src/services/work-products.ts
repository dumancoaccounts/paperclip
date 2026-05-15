import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueWorkProducts } from "@paperclipai/db";
import type { IssueDeliveryEvidenceSummary, IssueWorkProduct } from "@paperclipai/shared";

type IssueWorkProductRow = typeof issueWorkProducts.$inferSelect;

function toIssueWorkProduct(row: IssueWorkProductRow): IssueWorkProduct {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    issueId: row.issueId,
    executionWorkspaceId: row.executionWorkspaceId ?? null,
    runtimeServiceId: row.runtimeServiceId ?? null,
    type: row.type as IssueWorkProduct["type"],
    provider: row.provider,
    externalId: row.externalId ?? null,
    title: row.title,
    url: row.url ?? null,
    status: row.status,
    reviewState: row.reviewState as IssueWorkProduct["reviewState"],
    isPrimary: row.isPrimary,
    healthStatus: row.healthStatus as IssueWorkProduct["healthStatus"],
    summary: row.summary ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    evidenceKind: (row.evidenceKind as IssueWorkProduct["evidenceKind"]) ?? null,
    verificationRole: row.verificationRole as IssueWorkProduct["verificationRole"],
    validity: row.validity as IssueWorkProduct["validity"],
    satisfiesMinimumVerification: row.satisfiesMinimumVerification,
    coversExpectedOutput: row.coversExpectedOutput,
    verifiedAt: row.verifiedAt ?? null,
    staleAt: row.staleAt ?? null,
    staleReason: row.staleReason ?? null,
    supersededByWorkProductId: row.supersededByWorkProductId ?? null,
    supersededAt: row.supersededAt ?? null,
    supersededReason: row.supersededReason ?? null,
    createdByRunId: row.createdByRunId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hasContractList(value: string[] | null | undefined) {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
}

function hasContractText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function isCurrentEvidence(product: IssueWorkProduct) {
  return product.validity === "current" && !product.staleAt && !product.supersededAt;
}

function latestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    return !latest || value.getTime() > latest.getTime() ? value : latest;
  }, null);
}

export function summarizeIssueDeliveryEvidence(
  issue: {
    minimumVerification?: string[] | null;
    expectedOutput?: string | null;
  },
  workProducts: IssueWorkProduct[],
): IssueDeliveryEvidenceSummary {
  const minimumVerificationRequired = hasContractList(issue.minimumVerification);
  const expectedOutputRequired = hasContractText(issue.expectedOutput);
  const currentEvidence = workProducts.filter(isCurrentEvidence);
  const staleEvidence = workProducts.filter((product) => product.validity === "stale" || !!product.staleAt);
  const supersededEvidence = workProducts.filter(
    (product) => product.validity === "superseded" || !!product.supersededAt || !!product.supersededByWorkProductId,
  );
  const primaryEvidence = currentEvidence.find((product) => product.isPrimary) ?? null;
  const minimumVerificationEvidence =
    currentEvidence.find((product) => product.satisfiesMinimumVerification) ?? null;
  const expectedOutputEvidence =
    currentEvidence.find((product) => product.coversExpectedOutput) ?? null;
  const staleMinimumVerificationEvidence =
    staleEvidence.find((product) => product.satisfiesMinimumVerification) ?? null;
  const staleExpectedOutputEvidence =
    staleEvidence.find((product) => product.coversExpectedOutput) ?? null;

  const missingReasons: string[] = [];
  if (minimumVerificationRequired && !minimumVerificationEvidence) {
    missingReasons.push("minimum_verification_evidence_missing");
  }
  if (expectedOutputRequired && !expectedOutputEvidence) {
    missingReasons.push("expected_output_evidence_missing");
  }
  if (currentEvidence.length === 0) {
    missingReasons.push("current_evidence_missing");
  }
  if (currentEvidence.some((product) => product.reviewState === "changes_requested")) {
    missingReasons.push("evidence_changes_requested");
  }
  if (staleMinimumVerificationEvidence || staleExpectedOutputEvidence) {
    missingReasons.push("stale_evidence_present");
  }

  const minimumVerificationSatisfied = !minimumVerificationRequired || !!minimumVerificationEvidence;
  const expectedOutputCovered = !expectedOutputRequired || !!expectedOutputEvidence;
  const explicitEvidenceReady =
    !!currentEvidence.find((product) => product.satisfiesMinimumVerification && product.coversExpectedOutput) ||
    (!!minimumVerificationEvidence && !!expectedOutputEvidence);
  const reviewRequired =
    currentEvidence.some((product) =>
      product.reviewState === "needs_board_review" &&
      (product.satisfiesMinimumVerification || product.coversExpectedOutput || product.isPrimary),
    );
  const changesRequested =
    currentEvidence.some((product) =>
      product.reviewState === "changes_requested" &&
      (product.satisfiesMinimumVerification || product.coversExpectedOutput || product.isPrimary),
    );
  const staleWouldSatisfy =
    (minimumVerificationRequired && !!staleMinimumVerificationEvidence) ||
    (expectedOutputRequired && !!staleExpectedOutputEvidence);

  let closeConfidence: IssueDeliveryEvidenceSummary["closeConfidence"] = "missing";
  if (
    currentEvidence.length > 0 &&
    minimumVerificationSatisfied &&
    expectedOutputCovered &&
    explicitEvidenceReady &&
    !changesRequested
  ) {
    closeConfidence = reviewRequired ? "review_required" : "ready";
  } else if (
    staleWouldSatisfy ||
    (minimumVerificationRequired && !!minimumVerificationEvidence) ||
    (expectedOutputRequired && !!expectedOutputEvidence)
  ) {
    closeConfidence = "partial";
  } else if (currentEvidence.length > 0) {
    closeConfidence = "weak";
  }

  return {
    closeConfidence,
    primaryEvidenceId: primaryEvidence?.id ?? null,
    minimumVerificationEvidenceId: minimumVerificationEvidence?.id ?? null,
    expectedOutputEvidenceId: expectedOutputEvidence?.id ?? null,
    currentEvidenceCount: currentEvidence.length,
    staleEvidenceCount: staleEvidence.length,
    supersededEvidenceCount: supersededEvidence.length,
    missingReasons,
    lastVerifiedAt: latestDate(currentEvidence.map((product) => product.verifiedAt)),
  };
}

export function workProductService(db: Db) {
  return {
    listForIssue: async (issueId: string) => {
      const rows = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.issueId, issueId))
        .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
      return rows.map(toIssueWorkProduct);
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },

    createForIssue: async (issueId: string, companyId: string, data: Omit<typeof issueWorkProducts.$inferInsert, "issueId" | "companyId">) => {
      const row = await db.transaction(async (tx) => {
        if (data.isPrimary) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, companyId),
                eq(issueWorkProducts.issueId, issueId),
                eq(issueWorkProducts.verificationRole, data.verificationRole ?? "supporting"),
                eq(issueWorkProducts.validity, "current"),
              ),
            );
        }
        return await tx
          .insert(issueWorkProducts)
          .values({
            ...data,
            companyId,
            issueId,
          })
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    update: async (id: string, patch: Partial<typeof issueWorkProducts.$inferInsert>) => {
      const row = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, id))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        const nextVerificationRole = patch.verificationRole ?? existing.verificationRole;
        const nextValidity = patch.validity ?? existing.validity;

        if (patch.isPrimary === true && nextValidity === "current") {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, existing.companyId),
                eq(issueWorkProducts.issueId, existing.issueId),
                eq(issueWorkProducts.verificationRole, nextVerificationRole),
                eq(issueWorkProducts.validity, "current"),
              ),
            );
        }

        const normalizedPatch = { ...patch };
        if (patch.validity && patch.validity !== "current") {
          normalizedPatch.isPrimary = false;
        }
        if (patch.validity === "stale" && patch.staleAt === undefined) {
          normalizedPatch.staleAt = new Date();
        }
        if (patch.validity === "superseded" && patch.supersededAt === undefined) {
          normalizedPatch.supersededAt = new Date();
        }

        return await tx
          .update(issueWorkProducts)
          .set({ ...normalizedPatch, updatedAt: new Date() })
          .where(eq(issueWorkProducts.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    remove: async (id: string) => {
      const row = await db
        .delete(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },
  };
}

export { toIssueWorkProduct };
