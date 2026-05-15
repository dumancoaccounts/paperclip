import { describe, expect, it, vi } from "vitest";
import { summarizeIssueDeliveryEvidence, workProductService } from "../services/work-products.ts";

function createWorkProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date("2026-03-17T00:00:00.000Z");
  return {
    id: "work-product-1",
    companyId: "company-1",
    projectId: "project-1",
    issueId: "issue-1",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "pull_request",
    provider: "github",
    externalId: null,
    title: "PR 1",
    url: "https://example.com/pr/1",
    status: "open",
    reviewState: "draft",
    isPrimary: true,
    healthStatus: "unknown",
    summary: null,
    metadata: null,
    evidenceKind: null,
    verificationRole: "supporting",
    validity: "current",
    satisfiesMinimumVerification: false,
    coversExpectedOutput: false,
    verifiedAt: null,
    staleAt: null,
    staleReason: null,
    supersededByWorkProductId: null,
    supersededAt: null,
    supersededReason: null,
    createdByRunId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("workProductService", () => {
  it("uses a transaction when creating a new primary work product", async () => {
    const updatedWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updatedWhere }));
    const txUpdate = vi.fn(() => ({ set: updateSet }));

    const insertedRow = createWorkProductRow();
    const insertReturning = vi.fn(async () => [insertedRow]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const txInsert = vi.fn(() => ({ values: insertValues }));

    const tx = {
      update: txUpdate,
      insert: txInsert,
    };
    const transaction = vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => await callback(tx));

    const svc = workProductService({ transaction } as any);
    const result = await svc.createForIssue("issue-1", "company-1", {
      type: "pull_request",
      provider: "github",
      title: "PR 1",
      status: "open",
      reviewState: "draft",
      isPrimary: true,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(result?.id).toBe("work-product-1");
  });

  it("uses a transaction when promoting an existing work product to primary", async () => {
    const existingRow = createWorkProductRow({ isPrimary: false });

    const selectWhere = vi.fn(async () => [existingRow]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const txSelect = vi.fn(() => ({ from: selectFrom }));

    const updateReturning = vi
      .fn()
      .mockResolvedValue([createWorkProductRow({ reviewState: "ready_for_review" })]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const txUpdate = vi.fn(() => ({ set: updateSet }));

    const tx = {
      select: txSelect,
      update: txUpdate,
    };
    const transaction = vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => await callback(tx));

    const svc = workProductService({ transaction } as any);
    const result = await svc.update("work-product-1", {
      isPrimary: true,
      reviewState: "ready_for_review",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txSelect).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(result?.reviewState).toBe("ready_for_review");
  });

  it("clears primary when evidence is superseded", async () => {
    const existingRow = createWorkProductRow({
      isPrimary: true,
      verificationRole: "minimum_verification",
      satisfiesMinimumVerification: true,
    });

    const selectWhere = vi.fn(async () => [existingRow]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const txSelect = vi.fn(() => ({ from: selectFrom }));

    const updateReturning = vi
      .fn()
      .mockResolvedValue([createWorkProductRow({
        isPrimary: false,
        validity: "superseded",
        supersededAt: new Date("2026-03-18T00:00:00.000Z"),
      })]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const txUpdate = vi.fn(() => ({ set: updateSet }));

    const tx = {
      select: txSelect,
      update: txUpdate,
    };
    const transaction = vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => await callback(tx));

    const svc = workProductService({ transaction } as any);
    const result = await svc.update("work-product-1", {
      validity: "superseded",
      supersededByWorkProductId: "work-product-2",
    });

    expect(result?.isPrimary).toBe(false);
    expect(result?.validity).toBe("superseded");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      isPrimary: false,
      supersededByWorkProductId: "work-product-2",
    }));
  });
});

describe("summarizeIssueDeliveryEvidence", () => {
  it("returns ready when current evidence covers the contract", () => {
    const verifiedAt = new Date("2026-03-17T00:00:00.000Z");
    const summary = summarizeIssueDeliveryEvidence(
      {
        minimumVerification: ["pnpm test work-products"],
        expectedOutput: "Implementation PR",
      },
      [
        createWorkProductRow({
          evidenceKind: "test_result",
          verificationRole: "minimum_verification",
          satisfiesMinimumVerification: true,
          coversExpectedOutput: true,
          verifiedAt,
        }) as any,
      ],
    );

    expect(summary).toEqual({
      closeConfidence: "ready",
      primaryEvidenceId: "work-product-1",
      minimumVerificationEvidenceId: "work-product-1",
      expectedOutputEvidenceId: "work-product-1",
      currentEvidenceCount: 1,
      staleEvidenceCount: 0,
      supersededEvidenceCount: 0,
      missingReasons: [],
      lastVerifiedAt: verifiedAt,
    });
  });

  it("ignores stale, superseded, and revoked evidence for current confidence", () => {
    const summary = summarizeIssueDeliveryEvidence(
      {
        minimumVerification: ["browser QA"],
        expectedOutput: "Screenshot set",
      },
      [
        createWorkProductRow({
          id: "stale",
          validity: "stale",
          satisfiesMinimumVerification: true,
          staleAt: new Date("2026-03-18T00:00:00.000Z"),
        }) as any,
        createWorkProductRow({
          id: "superseded",
          validity: "superseded",
          coversExpectedOutput: true,
          supersededAt: new Date("2026-03-18T00:00:00.000Z"),
        }) as any,
        createWorkProductRow({
          id: "revoked",
          validity: "revoked",
          satisfiesMinimumVerification: true,
          coversExpectedOutput: true,
        }) as any,
      ],
    );

    expect(summary.closeConfidence).toBe("partial");
    expect(summary.currentEvidenceCount).toBe(0);
    expect(summary.staleEvidenceCount).toBe(1);
    expect(summary.supersededEvidenceCount).toBe(1);
    expect(summary.minimumVerificationEvidenceId).toBeNull();
    expect(summary.expectedOutputEvidenceId).toBeNull();
    expect(summary.missingReasons).toEqual(expect.arrayContaining([
      "current_evidence_missing",
      "minimum_verification_evidence_missing",
      "expected_output_evidence_missing",
      "stale_evidence_present",
    ]));
  });
});
