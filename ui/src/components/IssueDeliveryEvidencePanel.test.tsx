// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Issue, IssueWorkProduct } from "@paperclipai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueDeliveryEvidencePanel } from "./IssueDeliveryEvidencePanel";

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Evidence issue",
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    currentExecutionWorkspace: null,
    createdByAgentId: null,
    createdByUserId: null,
    identifier: "PAP-1",
    issueNumber: 1,
    originKind: "manual",
    originId: null,
    originRunId: null,
    originFingerprint: "default",
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionPolicy: null,
    executionState: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    labels: [],
    labelIds: [],
    ancestors: [],
    documentSummaries: [],
    expectedOutput: "Board-visible artifact",
    minimumVerification: ["Focused verification"],
    deliveryEvidence: {
      closeConfidence: "ready",
      primaryEvidenceId: "wp-1",
      minimumVerificationEvidenceId: "wp-1",
      expectedOutputEvidenceId: "wp-1",
      currentEvidenceCount: 1,
      staleEvidenceCount: 0,
      supersededEvidenceCount: 0,
      missingReasons: [],
      lastVerifiedAt: new Date("2026-05-15T10:00:00.000Z"),
    },
    createdAt: new Date("2026-05-15T09:00:00.000Z"),
    updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    ...overrides,
  } as Issue;
}

function createWorkProduct(overrides: Partial<IssueWorkProduct> = {}): IssueWorkProduct {
  return {
    id: "wp-1",
    companyId: "company-1",
    projectId: null,
    issueId: "issue-1",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "test_result",
    provider: "paperclip",
    externalId: null,
    title: "Focused tests passed",
    url: "https://example.com/test",
    status: "active",
    reviewState: "none",
    isPrimary: true,
    healthStatus: "healthy",
    summary: "pnpm vitest passed",
    metadata: null,
    evidenceKind: "test_result",
    verificationRole: "minimum_verification",
    validity: "current",
    satisfiesMinimumVerification: true,
    coversExpectedOutput: true,
    verifiedAt: new Date("2026-05-15T10:00:00.000Z"),
    staleAt: null,
    staleReason: null,
    supersededByWorkProductId: null,
    supersededAt: null,
    supersededReason: null,
    createdByRunId: "run-1",
    createdAt: new Date("2026-05-15T09:45:00.000Z"),
    updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    ...overrides,
  };
}

function renderPanel({
  issue = createIssue(),
  workProducts = [createWorkProduct()],
  workProductsError = null,
  onCreateWorkProduct = vi.fn(),
  onUpdateWorkProduct = vi.fn(),
}: Partial<{
  issue: Issue;
  workProducts: IssueWorkProduct[];
  workProductsError: unknown;
  onCreateWorkProduct: (data: Record<string, unknown>) => Promise<unknown>;
  onUpdateWorkProduct: (id: string, data: Record<string, unknown>) => Promise<unknown>;
}> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <IssueDeliveryEvidencePanel
        issue={issue}
        workProducts={workProducts}
        workProductsError={workProductsError}
        onRetryWorkProducts={vi.fn()}
        onCreateWorkProduct={onCreateWorkProduct}
        onUpdateWorkProduct={onUpdateWorkProduct}
      />,
    );
  });
  return { container, root };
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("IssueDeliveryEvidencePanel", () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = "";
  });

  it.each([
    ["ready", "Ready"],
    ["partial", "Partial"],
    ["missing", "Missing"],
    ["weak", "Weak"],
    ["review_required", "Review required"],
  ] as const)("renders %s confidence", (confidence, label) => {
    const rendered = renderPanel({
      issue: createIssue({
        deliveryEvidence: {
          closeConfidence: confidence,
          primaryEvidenceId: confidence === "missing" ? null : "wp-1",
          minimumVerificationEvidenceId: confidence === "ready" ? "wp-1" : null,
          expectedOutputEvidenceId: confidence === "ready" ? "wp-1" : null,
          currentEvidenceCount: confidence === "missing" ? 0 : 1,
          staleEvidenceCount: 0,
          supersededEvidenceCount: 0,
          missingReasons: confidence === "missing" ? ["current_evidence_missing"] : [],
          lastVerifiedAt: confidence === "missing" ? null : new Date("2026-05-15T10:00:00.000Z"),
        },
      }),
      workProducts: confidence === "missing" ? [] : [createWorkProduct()],
    });
    root = rendered.root;
    expect(rendered.container.textContent).toContain(label);
    if (confidence !== "ready") {
      expect(rendered.container.textContent).toContain("Closing evidence is missing");
    }
  });

  it("keeps stale and superseded evidence collapsed until requested", () => {
    const rendered = renderPanel({
      issue: createIssue({
        deliveryEvidence: {
          closeConfidence: "partial",
          primaryEvidenceId: null,
          minimumVerificationEvidenceId: null,
          expectedOutputEvidenceId: null,
          currentEvidenceCount: 0,
          staleEvidenceCount: 1,
          supersededEvidenceCount: 1,
          missingReasons: ["stale_evidence_present"],
          lastVerifiedAt: null,
        },
      }),
      workProducts: [
        createWorkProduct({
          id: "wp-stale",
          title: "Old screenshot",
          evidenceKind: "screenshot",
          validity: "stale",
          staleAt: new Date("2026-05-15T11:00:00.000Z"),
          staleReason: "UI changed",
          isPrimary: false,
        }),
        createWorkProduct({
          id: "wp-superseded",
          title: "Old report",
          evidenceKind: "report",
          validity: "superseded",
          supersededAt: new Date("2026-05-15T11:15:00.000Z"),
          supersededReason: "Newer report exists",
          isPrimary: false,
        }),
      ],
    });
    root = rendered.root;

    expect(rendered.container.textContent).toContain("Show stale and superseded history");
    expect(rendered.container.textContent).not.toContain("Old screenshot");

    const showHistory = Array.from(rendered.container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Show stale")) as HTMLButtonElement;
    act(() => {
      showHistory.click();
    });

    expect(rendered.container.textContent).toContain("Old screenshot");
    expect(rendered.container.textContent).toContain("Old report");
  });

  it("renders planning-only document evidence as ready", () => {
    const rendered = renderPanel({
      issue: createIssue({
        phase: "planning",
        expectedOutput: "Approved plan document",
        minimumVerification: ["Source issues reviewed"],
      }),
      workProducts: [
        createWorkProduct({
          title: "Plan document",
          type: "document",
          evidenceKind: "document",
          verificationRole: "completion_summary",
          summary: "Implementation plan approved.",
        }),
      ],
    });
    root = rendered.root;

    expect(rendered.container.textContent).toContain("Ready");
    expect(rendered.container.textContent).toContain("Document");
    expect(rendered.container.textContent).toContain("Plan document");
  });

  it("shows an inline retry state when evidence loading fails", () => {
    const rendered = renderPanel({
      workProductsError: new Error("network"),
      workProducts: [],
    });
    root = rendered.root;

    expect(rendered.container.textContent).toContain("Evidence could not be loaded");
    expect(rendered.container.textContent).toContain("Retry");
  });

  it("submits create evidence fields", async () => {
    const onCreateWorkProduct = vi.fn().mockResolvedValue({});
    const rendered = renderPanel({
      workProducts: [],
      onCreateWorkProduct,
    });
    root = rendered.root;

    const openForm = Array.from(rendered.container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Add evidence")) as HTMLButtonElement;
    act(() => {
      openForm.click();
    });

    const title = rendered.container.querySelector("input") as HTMLInputElement;
    setInputValue(title, "Manual QA passed");
    const checkboxes = Array.from(rendered.container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    await act(async () => {
      checkboxes[0].click();
      checkboxes[1].click();
      checkboxes[2].click();
    });
    const save = Array.from(rendered.container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Add evidence")) as HTMLButtonElement;
    await act(async () => {
      save.click();
    });

    expect(onCreateWorkProduct).toHaveBeenCalledWith(expect.objectContaining({
      title: "Manual QA passed",
      evidenceKind: "manual_verification_note",
      verificationRole: "supporting",
      validity: "current",
      isPrimary: true,
      satisfiesMinimumVerification: true,
      coversExpectedOutput: true,
    }));
  });
});
