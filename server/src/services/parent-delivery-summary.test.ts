import { describe, expect, it } from "vitest";
import type { IssueDeliveryEvidenceSummary, IssueWorkProduct } from "@paperclipai/shared";
import { buildParentDeliverySummary, type ParentDeliverySummaryInput } from "./parent-delivery-summary.js";

const baseDate = new Date("2026-05-15T12:00:00.000Z");

function issue(overrides: Partial<ParentDeliverySummaryInput["parent"]> = {}): ParentDeliverySummaryInput["parent"] {
  return {
    id: overrides.id ?? "parent",
    companyId: "company-1",
    parentId: null,
    identifier: overrides.identifier ?? "DUM-P",
    title: overrides.title ?? "Parent",
    status: overrides.status ?? "todo",
    priority: "medium",
    assigneeAgentId: overrides.assigneeAgentId ?? null,
    assigneeUserId: overrides.assigneeUserId ?? null,
    assigneeAgentName: overrides.assigneeAgentName ?? null,
    successCriteria: overrides.successCriteria ?? ["done"],
    minimumVerification: overrides.minimumVerification ?? ["test"],
    expectedOutput: overrides.expectedOutput ?? "artifact",
    estimate: Object.prototype.hasOwnProperty.call(overrides, "estimate") ? (overrides.estimate ?? null) : { size: "S" },
    phase: overrides.phase ?? null,
    executionRunId: overrides.executionRunId ?? null,
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    updatedAt: overrides.updatedAt ?? baseDate,
  };
}

function evidence(overrides: Partial<IssueDeliveryEvidenceSummary> = {}): IssueDeliveryEvidenceSummary {
  return {
    closeConfidence: overrides.closeConfidence ?? "ready",
    primaryEvidenceId: overrides.primaryEvidenceId ?? "wp-1",
    minimumVerificationEvidenceId: overrides.minimumVerificationEvidenceId ?? "wp-1",
    expectedOutputEvidenceId: overrides.expectedOutputEvidenceId ?? "wp-1",
    currentEvidenceCount: overrides.currentEvidenceCount ?? 1,
    staleEvidenceCount: overrides.staleEvidenceCount ?? 0,
    supersededEvidenceCount: overrides.supersededEvidenceCount ?? 0,
    missingReasons: overrides.missingReasons ?? [],
    lastVerifiedAt: overrides.lastVerifiedAt ?? baseDate,
  };
}

function workProduct(overrides: Partial<IssueWorkProduct> = {}): IssueWorkProduct {
  return {
    id: overrides.id ?? "wp-1",
    companyId: "company-1",
    projectId: null,
    issueId: overrides.issueId ?? "child-1",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "test_result",
    provider: "paperclip",
    externalId: null,
    title: overrides.title ?? "Targeted tests",
    url: null,
    status: "active",
    reviewState: "none",
    isPrimary: true,
    healthStatus: "healthy",
    summary: overrides.summary ?? "Tests passed",
    metadata: null,
    evidenceKind: "test_result",
    verificationRole: "minimum_verification",
    validity: overrides.validity ?? "current",
    satisfiesMinimumVerification: true,
    coversExpectedOutput: true,
    verifiedAt: overrides.verifiedAt ?? baseDate,
    staleAt: null,
    staleReason: null,
    supersededByWorkProductId: null,
    supersededAt: null,
    supersededReason: null,
    createdByRunId: null,
    createdAt: overrides.createdAt ?? baseDate,
    updatedAt: overrides.updatedAt ?? baseDate,
  };
}

function summary(overrides: Partial<ParentDeliverySummaryInput> = {}) {
  const parent = overrides.parent ?? issue();
  const children = overrides.children ?? [];
  return buildParentDeliverySummary({
    parent,
    children,
    blockerEdges: overrides.blockerEdges ?? [],
    evidenceByIssueId: overrides.evidenceByIssueId ?? new Map(children.map((child) => [child.id, evidence()])),
    workProductsByIssueId: overrides.workProductsByIssueId ?? new Map(),
    activeRunsByIssueId: overrides.activeRunsByIssueId ?? new Map(),
    comments: overrides.comments ?? [],
    generatedAt: new Date("2026-05-15T13:00:00.000Z"),
    filteredChildCount: overrides.filteredChildCount ?? 0,
  });
}

describe("buildParentDeliverySummary", () => {
  it("counts direct child buckets deterministically", () => {
    const result = summary({
      children: [
        issue({ id: "done", identifier: "DUM-1", status: "done" }),
        issue({ id: "active", identifier: "DUM-2", status: "in_progress" }),
        issue({ id: "blocked", identifier: "DUM-3", status: "blocked" }),
        issue({ id: "review", identifier: "DUM-4", status: "in_review" }),
        issue({ id: "todo", identifier: "DUM-5", status: "todo" }),
        issue({ id: "cancelled", identifier: "DUM-6", status: "cancelled" }),
      ],
    });

    expect(result.counts).toEqual(expect.objectContaining({
      totalChildren: 6,
      done: 1,
      active: 1,
      blocked: 1,
      review: 1,
      todo: 1,
      cancelled: 1,
    }));
  });

  it("lowers confidence for done children with missing evidence", () => {
    const child = issue({ id: "child-1", identifier: "DUM-1", status: "done" });
    const result = summary({
      children: [child],
      evidenceByIssueId: new Map([
        [child.id, evidence({
          closeConfidence: "missing",
          primaryEvidenceId: null,
          minimumVerificationEvidenceId: null,
          expectedOutputEvidenceId: null,
          currentEvidenceCount: 0,
          missingReasons: ["current_evidence_missing"],
        })],
      ]),
    });

    expect(result.counts.missingEvidence).toBe(1);
    expect(result.confidence).toBe("medium");
    expect(result.risks).toContainEqual(expect.objectContaining({ kind: "missing_evidence", identifier: "DUM-1" }));
  });

  it("moves stale and superseded done evidence back into remaining risk", () => {
    const stale = issue({ id: "stale", identifier: "DUM-1", status: "done" });
    const superseded = issue({ id: "superseded", identifier: "DUM-2", status: "done" });
    const result = summary({
      children: [stale, superseded],
      evidenceByIssueId: new Map([
        [stale.id, evidence({ staleEvidenceCount: 1, closeConfidence: "partial" })],
        [superseded.id, evidence({ supersededEvidenceCount: 1, closeConfidence: "partial" })],
      ]),
    });

    expect(result.remaining.map((item) => item.issueId).sort()).toEqual(["stale", "superseded"]);
    expect(result.risks.map((risk) => risk.kind)).toEqual(expect.arrayContaining(["stale_evidence", "superseded_evidence"]));
  });

  it("triages cancelled blockers instead of treating them as resolved", () => {
    const child = issue({ id: "child", identifier: "DUM-1", status: "blocked" });
    const blocker = issue({ id: "blocker", identifier: "DUM-0", status: "cancelled" });
    const result = summary({
      children: [child],
      blockerEdges: [{ blocker, blockedIssueId: child.id }],
    });

    expect(result.blockers[0]).toEqual(expect.objectContaining({
      blockerIssueId: "blocker",
      actionNeeded: "triage_cancelled_blocker",
    }));
    expect(result.confidence).toBe("low");
  });

  it("uses default estimates for missing estimates and marks critical path insufficient", () => {
    const child = issue({ id: "child", identifier: "DUM-1", status: "todo", estimate: null });
    const result = summary({ children: [child] });

    expect(result.criticalPath.state).toBe("insufficient_estimates");
    expect(result.criticalPath.estimatedRemainingHeartbeats).toBe(2);
    expect(result.risks).toContainEqual(expect.objectContaining({ kind: "missing_estimate" }));
  });

  it("selects the longest dependency path through external blockers", () => {
    const fast = issue({ id: "fast", identifier: "DUM-1", status: "todo", estimate: { size: "S" } });
    const slow = issue({ id: "slow", identifier: "DUM-2", status: "todo", estimate: { size: "L" } });
    const qa = issue({ id: "qa", identifier: "DUM-3", status: "blocked", estimate: { size: "S" } });
    const external = issue({ id: "external", identifier: "DUM-X", status: "todo", estimate: { size: "M" } });
    const result = summary({
      children: [fast, slow, qa],
      blockerEdges: [
        { blocker: slow, blockedIssueId: qa.id },
        { blocker: external, blockedIssueId: slow.id },
      ],
    });

    expect(result.criticalPath.state).toBe("available");
    expect(result.criticalPath.path.map((step) => step.identifier)).toEqual(["DUM-X", "DUM-2", "DUM-3"]);
    expect(result.criticalPath.estimatedRemainingHeartbeats).toBe(7);
  });

  it("detects dependency cycles", () => {
    const a = issue({ id: "a", identifier: "DUM-1", status: "blocked" });
    const b = issue({ id: "b", identifier: "DUM-2", status: "blocked" });
    const result = summary({
      children: [a, b],
      blockerEdges: [
        { blocker: a, blockedIssueId: b.id },
        { blocker: b, blockedIssueId: a.id },
      ],
    });

    expect(result.criticalPath.state).toBe("invalid_graph");
    expect(result.confidence).toBe("low");
  });

  it("limits effective agent cap to ready unblocked branches", () => {
    const readyA = issue({ id: "ready-a", identifier: "DUM-1", status: "todo", estimate: { size: "S" } });
    const readyB = issue({ id: "ready-b", identifier: "DUM-2", status: "todo", estimate: { size: "S" } });
    const blocked = issue({ id: "blocked", identifier: "DUM-3", status: "blocked", estimate: { size: "L" } });
    const blocker = issue({ id: "blocker", identifier: "DUM-X", status: "todo", estimate: { size: "S" } });
    const result = summary({
      children: [readyA, readyB, blocked],
      blockerEdges: [{ blocker, blockedIssueId: blocked.id }],
    });

    expect(result.effectiveAgentCap.recommendedCap).toBe(2);
    expect(result.effectiveAgentCap.limitingFactors).toContain("blocked_dependencies");
  });

  it("prefers work product evidence over newer comment noise for last meaningful progress", () => {
    const child = issue({ id: "child-1", identifier: "DUM-1", status: "in_progress" });
    const result = summary({
      children: [child],
      workProductsByIssueId: new Map([[child.id, [workProduct({ issueId: child.id, verifiedAt: baseDate })]]]),
      comments: [{
        issueId: child.id,
        body: "Done [DUM-1](/DUM/issues/DUM-1)",
        createdAt: new Date("2026-05-15T12:30:00.000Z"),
      }],
    });

    expect(result.lastMeaningfulProgress).toEqual(expect.objectContaining({
      source: "work_product_evidence",
      summary: "Tests passed",
    }));
  });

  it("returns partial state when permissions filter children", () => {
    const result = summary({
      children: [issue({ id: "visible", identifier: "DUM-1" })],
      filteredChildCount: 2,
    });

    expect(result.state).toBe("partial");
    expect(result.counts.totalChildren).toBe(3);
    expect(result.risks).toContainEqual(expect.objectContaining({ kind: "permission_filtered_children" }));
  });

  it("summarizes a parallel delivery fixture with external blocker, stale evidence, and active run signal", () => {
    const design = issue({ id: "design", identifier: "DUM-A", status: "done", estimate: { size: "XS" } });
    const backend = issue({
      id: "backend",
      identifier: "DUM-B",
      status: "in_progress",
      estimate: { size: "M" },
      executionRunId: "run-1",
    });
    const frontend = issue({ id: "frontend", identifier: "DUM-C", status: "todo", estimate: { size: "S" } });
    const qa = issue({ id: "qa", identifier: "DUM-D", status: "blocked", estimate: { size: "S" } });
    const releaseNotes = issue({ id: "notes", identifier: "DUM-E", status: "done", estimate: { size: "XS" } });
    const external = issue({ id: "external", identifier: "DUM-X", status: "todo", estimate: null });
    const result = summary({
      children: [design, backend, frontend, qa, releaseNotes],
      blockerEdges: [
        { blocker: external, blockedIssueId: backend.id },
        { blocker: backend, blockedIssueId: qa.id },
        { blocker: frontend, blockedIssueId: qa.id },
      ],
      evidenceByIssueId: new Map([
        [design.id, evidence()],
        [backend.id, evidence({ closeConfidence: "missing", currentEvidenceCount: 0, primaryEvidenceId: null })],
        [frontend.id, evidence({ closeConfidence: "missing", currentEvidenceCount: 0, primaryEvidenceId: null })],
        [qa.id, evidence({ closeConfidence: "missing", currentEvidenceCount: 0, primaryEvidenceId: null })],
        [releaseNotes.id, evidence({ staleEvidenceCount: 1, closeConfidence: "partial" })],
      ]),
      activeRunsByIssueId: new Map([
        [backend.id, {
          id: "run-1",
          issueId: backend.id,
          agentId: "agent-1",
          status: "running",
          lastUsefulActionAt: new Date("2026-05-15T12:20:00.000Z"),
          lastOutputAt: null,
          nextAction: "Implementing backend adapter.",
          startedAt: new Date("2026-05-15T12:10:00.000Z"),
          createdAt: new Date("2026-05-15T12:09:00.000Z"),
          updatedAt: new Date("2026-05-15T12:20:00.000Z"),
        }],
      ]),
    });

    expect(result.blockers.map((blocker) => blocker.identifier)).toContain("DUM-X");
    expect(result.criticalPath.path.map((step) => step.identifier)).toEqual(["DUM-X", "DUM-B", "DUM-D"]);
    expect(result.sourceRevision.runCursor).toBe("2026-05-15T12:20:00.000Z");
    expect(result.remaining.map((item) => item.identifier)).toContain("DUM-E");
    expect(result.effectiveAgentCap.recommendedCap).toBe(1);
  });
});
