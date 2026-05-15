import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issueComments, issueRelations, issues, issueWorkProducts } from "@paperclipai/db";
import type {
  IssueDeliveryEvidenceSummary,
  IssueEstimate,
  IssuePhase,
  IssueStatus,
  IssueWorkProduct,
  ParentDeliveryBlockerSummary,
  ParentDeliveryCriticalPathSummary,
  ParentDeliveryEffectiveAgentCapSummary,
  ParentDeliveryEstimateSnapshot,
  ParentDeliveryEvidenceSnapshot,
  ParentDeliveryItem,
  ParentDeliveryNextAction,
  ParentDeliveryProgressSummary,
  ParentDeliveryRisk,
  ParentDeliverySummary,
  ParentDeliverySummaryCompact,
  ParentDeliverySummaryConfidence,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { summarizeIssueDeliveryEvidence, toIssueWorkProduct } from "./work-products.js";

const SIZE_COST: Record<NonNullable<IssueEstimate["size"]>, number> = {
  XS: 0.5,
  S: 1,
  M: 2,
  L: 4,
  XL: 8,
};
const ACTIVE_RUN_STATUSES = ["queued", "running"] as const;
const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);

type IssueNode = {
  id: string;
  companyId: string;
  parentId: string | null;
  identifier: string | null;
  title: string;
  status: IssueStatus;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  assigneeAgentName: string | null;
  successCriteria: string[] | null;
  minimumVerification: string[] | null;
  expectedOutput: string | null;
  estimate: IssueEstimate | null;
  phase: IssuePhase | null;
  executionRunId: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
};

type BlockerEdge = {
  blocker: IssueNode;
  blockedIssueId: string;
};

type ActiveRunSignal = {
  id: string;
  issueId: string;
  agentId: string;
  status: string;
  lastUsefulActionAt: Date | null;
  lastOutputAt: Date | null;
  nextAction: string | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CommentSignal = {
  issueId: string;
  body: string;
  createdAt: Date;
};

export type ParentDeliverySummaryInput = {
  parent: IssueNode;
  children: IssueNode[];
  blockerEdges: BlockerEdge[];
  evidenceByIssueId: Map<string, IssueDeliveryEvidenceSummary>;
  workProductsByIssueId: Map<string, IssueWorkProduct[]>;
  activeRunsByIssueId: Map<string, ActiveRunSignal>;
  comments: CommentSignal[];
  generatedAt?: Date;
  filteredChildCount?: number;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hasList(value: string[] | null | undefined) {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function assigneeLabel(issue: IssueNode) {
  if (issue.assigneeAgentName) return issue.assigneeAgentName;
  if (issue.assigneeAgentId) return issue.assigneeAgentId;
  if (issue.assigneeUserId) return issue.assigneeUserId;
  return null;
}

function issueLabel(issue: Pick<IssueNode, "identifier" | "id">) {
  return issue.identifier ?? issue.id;
}

function evidenceSnapshot(evidence: IssueDeliveryEvidenceSummary | undefined): ParentDeliveryEvidenceSnapshot | null {
  if (!evidence) return null;
  return {
    closeConfidence: evidence.closeConfidence,
    primaryEvidenceId: evidence.primaryEvidenceId,
    currentEvidenceCount: evidence.currentEvidenceCount,
    staleEvidenceCount: evidence.staleEvidenceCount,
    supersededEvidenceCount: evidence.supersededEvidenceCount,
    missingReasons: evidence.missingReasons,
    lastVerifiedAt: toIso(evidence.lastVerifiedAt),
  };
}

function estimateSnapshot(issue: IssueNode): ParentDeliveryEstimateSnapshot {
  const estimate = issue.estimate;
  if (issue.status === "done" || issue.status === "cancelled") {
    return {
      size: estimate?.size ?? null,
      expectedHeartbeatCount: estimate?.expectedHeartbeatCount ?? null,
      expectedHeartbeatRange: estimate?.expectedHeartbeatRange ?? null,
      risk: estimate?.risk ?? null,
      effectiveParallelism: estimate?.effectiveParallelism ?? null,
      remainingHeartbeats: 0,
      confidence: "high",
      source: "done",
    };
  }
  if (estimate?.expectedHeartbeatCount != null) {
    return {
      size: estimate.size ?? null,
      expectedHeartbeatCount: estimate.expectedHeartbeatCount,
      expectedHeartbeatRange: estimate.expectedHeartbeatRange ?? null,
      risk: estimate.risk ?? null,
      effectiveParallelism: estimate.effectiveParallelism ?? null,
      remainingHeartbeats: estimate.expectedHeartbeatCount,
      confidence: estimate.risk === "high" ? "medium" : "high",
      source: "count",
    };
  }
  if (estimate?.expectedHeartbeatRange) {
    return {
      size: estimate.size ?? null,
      expectedHeartbeatCount: null,
      expectedHeartbeatRange: estimate.expectedHeartbeatRange,
      risk: estimate.risk ?? null,
      effectiveParallelism: estimate.effectiveParallelism ?? null,
      remainingHeartbeats: estimate.expectedHeartbeatRange.max,
      confidence: estimate.risk === "high" ? "medium" : "high",
      source: "range",
    };
  }
  if (estimate?.size) {
    return {
      size: estimate.size,
      expectedHeartbeatCount: null,
      expectedHeartbeatRange: null,
      risk: estimate.risk ?? null,
      effectiveParallelism: estimate.effectiveParallelism ?? null,
      remainingHeartbeats: SIZE_COST[estimate.size],
      confidence: estimate.risk === "high" ? "medium" : "high",
      source: "size",
    };
  }
  if (issue.status === "in_review") {
    return {
      size: null,
      expectedHeartbeatCount: null,
      expectedHeartbeatRange: null,
      risk: null,
      effectiveParallelism: null,
      remainingHeartbeats: 0.5,
      confidence: "medium",
      source: "review_tail",
    };
  }
  return {
    size: null,
    expectedHeartbeatCount: null,
    expectedHeartbeatRange: null,
    risk: null,
    effectiveParallelism: null,
    remainingHeartbeats: SIZE_COST.M,
    confidence: "low",
    source: "default",
  };
}

function successCriteriaStatus(issue: IssueNode): ParentDeliveryItem["successCriteriaStatus"] {
  if (hasList(issue.successCriteria)) return "present";
  if (hasText(issue.expectedOutput)) return "partial";
  return "missing";
}

function minimumVerificationStatus(
  issue: IssueNode,
  evidence: IssueDeliveryEvidenceSummary | undefined,
): ParentDeliveryItem["minimumVerificationStatus"] {
  if (evidence?.minimumVerificationEvidenceId || evidence?.closeConfidence === "ready" || evidence?.closeConfidence === "review_required") {
    return "satisfied";
  }
  if ((evidence?.staleEvidenceCount ?? 0) > 0 || (evidence?.supersededEvidenceCount ?? 0) > 0) {
    return "stale";
  }
  if (hasList(issue.minimumVerification)) return "missing";
  return (evidence?.currentEvidenceCount ?? 0) > 0 ? "present" : "missing";
}

function isMissingContract(issue: IssueNode) {
  return !hasList(issue.successCriteria) || !hasText(issue.expectedOutput);
}

function isMissingEvidence(issue: IssueNode, evidence: IssueDeliveryEvidenceSummary | undefined) {
  if (issue.status !== "done") return false;
  if (!hasList(issue.minimumVerification) && !hasText(issue.expectedOutput)) return false;
  return evidence?.closeConfidence !== "ready" && evidence?.closeConfidence !== "review_required";
}

function isStaleOrSupersededEvidence(evidence: IssueDeliveryEvidenceSummary | undefined) {
  return (evidence?.staleEvidenceCount ?? 0) > 0 || (evidence?.supersededEvidenceCount ?? 0) > 0;
}

function unresolvedBlockerEdges(edges: BlockerEdge[]) {
  return edges.filter((edge) => edge.blocker.status !== "done");
}

function actionNeededForBlocker(blocker: IssueNode): ParentDeliveryBlockerSummary["actionNeeded"] {
  if (blocker.status === "cancelled") return "triage_cancelled_blocker";
  if (!blocker.assigneeAgentId && !blocker.assigneeUserId) return "assign_owner";
  if (blocker.status === "in_review") return "needs_decision";
  return "wait_dependency";
}

function buildBlockerSummaries(childrenById: Map<string, IssueNode>, edges: BlockerEdge[]) {
  const byBlocker = new Map<string, ParentDeliveryBlockerSummary>();
  for (const edge of unresolvedBlockerEdges(edges)) {
    const child = childrenById.get(edge.blockedIssueId);
    if (!child) continue;
    const current = byBlocker.get(edge.blocker.id) ?? {
      blockerIssueId: edge.blocker.id,
      identifier: edge.blocker.identifier,
      title: edge.blocker.title,
      status: edge.blocker.status,
      blocksChildren: [],
      ownerLabel: assigneeLabel(edge.blocker),
      ageBlocked: null,
      actionNeeded: actionNeededForBlocker(edge.blocker),
    };
    current.blocksChildren.push(child.id);
    byBlocker.set(edge.blocker.id, current);
  }
  return [...byBlocker.values()].sort((a, b) => {
    const severityA = a.actionNeeded === "triage_cancelled_blocker" ? 0 : a.actionNeeded === "assign_owner" ? 1 : 2;
    const severityB = b.actionNeeded === "triage_cancelled_blocker" ? 0 : b.actionNeeded === "assign_owner" ? 1 : 2;
    return severityA - severityB || (a.identifier ?? a.title).localeCompare(b.identifier ?? b.title);
  });
}

function detectCycle(nodes: Map<string, IssueNode>, edgesByDependent: Map<string, string[]>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return start >= 0 ? stack.slice(start).concat(id) : [id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const blockerId of edgesByDependent.get(id) ?? []) {
      if (!nodes.has(blockerId)) continue;
      const cycle = visit(blockerId);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of nodes.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function buildCriticalPath(
  children: IssueNode[],
  blockerEdges: BlockerEdge[],
  evidenceByIssueId: Map<string, IssueDeliveryEvidenceSummary>,
): ParentDeliveryCriticalPathSummary {
  const nodes = new Map<string, IssueNode>();
  for (const child of children) nodes.set(child.id, child);
  for (const edge of unresolvedBlockerEdges(blockerEdges)) nodes.set(edge.blocker.id, edge.blocker);

  const edgesByDependent = new Map<string, string[]>();
  for (const edge of unresolvedBlockerEdges(blockerEdges)) {
    const existing = edgesByDependent.get(edge.blockedIssueId) ?? [];
    existing.push(edge.blocker.id);
    edgesByDependent.set(edge.blockedIssueId, existing);
  }

  const cycle = detectCycle(nodes, edgesByDependent);
  if (cycle) {
    return {
      state: "invalid_graph",
      path: cycle.map((id) => {
        const node = nodes.get(id);
        return {
          issueId: id,
          identifier: node?.identifier ?? null,
          reason: "Dependency cycle detected.",
          remainingCost: node ? estimateSnapshot(node).remainingHeartbeats : 0,
        };
      }),
      confidence: "low",
    };
  }

  const memo = new Map<string, { cost: number; path: string[]; missingEstimate: boolean }>();
  function costFor(id: string): { cost: number; path: string[]; missingEstimate: boolean } {
    const cached = memo.get(id);
    if (cached) return cached;
    const node = nodes.get(id);
    if (!node) return { cost: 0, path: [], missingEstimate: false };
    const estimate = estimateSnapshot(node);
    const ownCost =
      node.status === "done" && !isStaleOrSupersededEvidence(evidenceByIssueId.get(node.id))
        ? 0
        : estimate.remainingHeartbeats;
    let bestBlocker = { cost: 0, path: [] as string[], missingEstimate: false };
    for (const blockerId of edgesByDependent.get(id) ?? []) {
      const candidate = costFor(blockerId);
      if (candidate.cost > bestBlocker.cost) bestBlocker = candidate;
    }
    const result = {
      cost: ownCost + bestBlocker.cost,
      path: [...bestBlocker.path, id],
      missingEstimate: estimate.source === "default" || bestBlocker.missingEstimate,
    };
    memo.set(id, result);
    return result;
  }

  let best = { cost: 0, path: [] as string[], missingEstimate: false };
  for (const child of children) {
    if (!OPEN_STATUSES.has(child.status) && !isStaleOrSupersededEvidence(evidenceByIssueId.get(child.id))) continue;
    const candidate = costFor(child.id);
    if (candidate.cost > best.cost) best = candidate;
  }

  if (best.cost <= 0 || best.path.length === 0) {
    return { state: "no_open_work", path: [], confidence: "high" };
  }

  return {
    state: best.missingEstimate ? "insufficient_estimates" : "available",
    estimatedRemainingHeartbeats: Number(best.cost.toFixed(2)),
    path: best.path.map((id) => {
      const node = nodes.get(id)!;
      return {
        issueId: node.id,
        identifier: node.identifier,
        reason: node.parentId ? `Open child ${issueLabel(node)} contributes remaining work.` : `External blocker ${issueLabel(node)} gates delivery.`,
        remainingCost: estimateSnapshot(node).remainingHeartbeats,
      };
    }),
    confidence: best.missingEstimate ? "medium" : "high",
  };
}

function buildEffectiveAgentCap(
  children: IssueNode[],
  blockerEdges: BlockerEdge[],
  criticalPath: ParentDeliveryCriticalPathSummary,
): ParentDeliveryEffectiveAgentCapSummary {
  const unresolvedByChild = new Map<string, BlockerEdge[]>();
  for (const edge of unresolvedBlockerEdges(blockerEdges)) {
    const existing = unresolvedByChild.get(edge.blockedIssueId) ?? [];
    existing.push(edge);
    unresolvedByChild.set(edge.blockedIssueId, existing);
  }

  const openChildren = children.filter((child) => OPEN_STATUSES.has(child.status));
  const readyChildren = openChildren.filter((child) =>
    (child.status === "backlog" || child.status === "todo" || child.status === "in_progress") &&
    (unresolvedByChild.get(child.id)?.length ?? 0) === 0 &&
    !isMissingContract(child)
  );
  const totalRemainingCost = openChildren.reduce((sum, child) => sum + estimateSnapshot(child).remainingHeartbeats, 0);
  const granularityCap = Math.floor(totalRemainingCost / 0.5);
  const recommendedCap = Math.max(0, Math.min(readyChildren.length, openChildren.length, granularityCap));
  const currentActiveAgents = new Set(
    children
      .filter((child) => child.status === "in_progress" && child.assigneeAgentId)
      .map((child) => child.assigneeAgentId as string),
  ).size;
  const limitingFactors: ParentDeliveryEffectiveAgentCapSummary["limitingFactors"] = [];
  if ([...unresolvedByChild.values()].some((edges) => edges.length > 0)) limitingFactors.push("blocked_dependencies");
  if (openChildren.some(isMissingContract)) limitingFactors.push("missing_contract");
  if (granularityCap < readyChildren.length) limitingFactors.push("insufficient_granularity");
  if (criticalPath.path.length > 1 && recommendedCap <= 1) limitingFactors.push("critical_path_serial");

  return {
    recommendedCap,
    currentActiveAgents,
    addableAgents: Math.max(0, recommendedCap - currentActiveAgents),
    limitingFactors,
    independentBranches: readyChildren.map((child) => ({
      label: child.identifier ?? child.title,
      issueIds: [child.id],
      ready: true,
    })),
    confidence: limitingFactors.includes("missing_contract") ? "medium" : "high",
  };
}

function isMeaningfulComment(body: string) {
  const normalized = body.toLowerCase();
  const hasAction = /\b(done|verified|blocked|created document|opened pr|opened pull request|merged|tested|fixed)\b/.test(normalized);
  const hasReference = /https?:\/\/|\[[A-Z]+-\d+\]|\b[A-Z]+-\d+\b/.test(body);
  return hasAction && hasReference;
}

function buildLastMeaningfulProgress(
  childrenById: Map<string, IssueNode>,
  workProductsByIssueId: Map<string, IssueWorkProduct[]>,
  activeRunsByIssueId: Map<string, ActiveRunSignal>,
  comments: CommentSignal[],
): ParentDeliveryProgressSummary | null {
  const workProductCandidates: ParentDeliveryProgressSummary[] = [];
  for (const [issueId, products] of workProductsByIssueId) {
    const issue = childrenById.get(issueId);
    if (!issue) continue;
    for (const product of products) {
      if (product.validity !== "current") continue;
      const at = toIso(product.verifiedAt ?? product.updatedAt);
      if (!at) continue;
      workProductCandidates.push({
        issueId,
        identifier: issue.identifier,
        title: issue.title,
        at,
        source: "work_product_evidence",
        summary: product.summary ?? product.title,
      });
    }
  }
  if (workProductCandidates.length > 0) {
    return workProductCandidates.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  }

  const statusCandidates = [...childrenById.values()]
    .filter((issue) => issue.status === "done" || issue.status === "in_review" || issue.status === "blocked")
    .map((issue) => ({
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      at: toIso(issue.completedAt ?? issue.updatedAt) ?? issue.updatedAt.toISOString(),
      source: "status_transition" as const,
      summary: `Issue moved to ${issue.status}.`,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (statusCandidates[0]) return statusCandidates[0];

  const runCandidates = [...activeRunsByIssueId.values()]
    .map((run): ParentDeliveryProgressSummary | null => {
      const issue = childrenById.get(run.issueId);
      const at = toIso(run.lastUsefulActionAt ?? run.lastOutputAt ?? run.startedAt ?? run.createdAt);
      if (!issue || !at) return null;
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        at,
        source: "active_run" as const,
        summary: run.nextAction ?? `Active run ${run.status}.`,
      };
    })
    .filter((value): value is ParentDeliveryProgressSummary => value != null)
    .sort((a, b) => b.at.localeCompare(a.at));
  if (runCandidates[0]) return runCandidates[0];

  const commentCandidates = comments
    .filter((comment) => isMeaningfulComment(comment.body))
    .map((comment): ParentDeliveryProgressSummary | null => {
      const issue = childrenById.get(comment.issueId);
      if (!issue) return null;
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        at: comment.createdAt.toISOString(),
        source: "agent_comment" as const,
        summary: comment.body.trim().slice(0, 240),
      };
    })
    .filter((value): value is ParentDeliveryProgressSummary => value != null)
    .sort((a, b) => b.at.localeCompare(a.at));
  return commentCandidates[0] ?? null;
}

function buildItem(
  issue: IssueNode,
  evidence: IssueDeliveryEvidenceSummary | undefined,
  blockerLabels: string[],
  criticalPathIds: Set<string>,
): ParentDeliveryItem {
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    phase: issue.phase,
    assigneeLabel: assigneeLabel(issue),
    expectedOutput: issue.expectedOutput,
    successCriteriaStatus: successCriteriaStatus(issue),
    minimumVerificationStatus: minimumVerificationStatus(issue, evidence),
    estimate: estimateSnapshot(issue),
    evidence: evidenceSnapshot(evidence),
    blockers: blockerLabels,
    isOnCriticalPath: criticalPathIds.has(issue.id),
  };
}

function pushRisk(risks: ParentDeliveryRisk[], risk: ParentDeliveryRisk) {
  if (risks.some((existing) => existing.kind === risk.kind && existing.issueId === risk.issueId && existing.message === risk.message)) return;
  risks.push(risk);
}

function buildNextActions(
  blockers: ParentDeliveryBlockerSummary[],
  risks: ParentDeliveryRisk[],
  remaining: ParentDeliveryItem[],
): ParentDeliveryNextAction[] {
  const actions: ParentDeliveryNextAction[] = [];
  const cancelledBlocker = blockers.find((blocker) => blocker.actionNeeded === "triage_cancelled_blocker");
  if (cancelledBlocker) {
    actions.push({
      kind: "triage_cancelled_blocker",
      issueId: cancelledBlocker.blockerIssueId,
      identifier: cancelledBlocker.identifier,
      message: "Cancelled blocker still gates a child; remove, replace, or re-scope the dependency.",
    });
  }
  const activeBlocker = blockers.find((blocker) => blocker.actionNeeded !== "triage_cancelled_blocker");
  if (activeBlocker) {
    actions.push({
      kind: activeBlocker.actionNeeded === "assign_owner" ? "unblock_dependency" : "unblock_dependency",
      issueId: activeBlocker.blockerIssueId,
      identifier: activeBlocker.identifier,
      message: "Resolve the highest-priority blocker before adding more dependent work.",
    });
  }
  const missingContract = risks.find((risk) => risk.kind === "missing_contract");
  if (missingContract) {
    actions.push({
      kind: "add_contract",
      issueId: missingContract.issueId,
      identifier: missingContract.identifier,
      message: "Add structured success criteria and expected output to improve delivery confidence.",
    });
  }
  const missingEvidence = risks.find((risk) => risk.kind === "missing_evidence");
  if (missingEvidence) {
    actions.push({
      kind: "add_evidence",
      issueId: missingEvidence.issueId,
      identifier: missingEvidence.identifier,
      message: "Attach current delivery evidence for a done child.",
    });
  }
  const staleEvidence = risks.find((risk) => risk.kind === "stale_evidence" || risk.kind === "superseded_evidence");
  if (staleEvidence) {
    actions.push({
      kind: "refresh_evidence",
      issueId: staleEvidence.issueId,
      identifier: staleEvidence.identifier,
      message: "Refresh stale or superseded evidence before treating the child as closed.",
    });
  }
  const readyUnassigned = remaining.find((item) => !item.assigneeLabel && item.blockers.length === 0);
  if (readyUnassigned) {
    actions.push({
      kind: "assign_ready_child",
      issueId: readyUnassigned.issueId,
      identifier: readyUnassigned.identifier,
      message: "Assign a ready child issue.",
    });
  }
  if (actions.length === 0) {
    actions.push({ kind: "no_action", message: "No immediate parent delivery action is required." });
  }
  return actions.slice(0, 5);
}

function aggregateConfidence(
  risks: ParentDeliveryRisk[],
  criticalPath: ParentDeliveryCriticalPathSummary,
  effectiveAgentCap: ParentDeliveryEffectiveAgentCapSummary,
) {
  if (criticalPath.state === "invalid_graph" || risks.some((risk) => risk.severity === "high")) return "low";
  if (
    criticalPath.confidence === "medium" ||
    effectiveAgentCap.confidence === "medium" ||
    risks.some((risk) => risk.severity === "medium")
  ) {
    return "medium";
  }
  return "high";
}

export function buildParentDeliverySummary(input: ParentDeliverySummaryInput): ParentDeliverySummary {
  const generatedAt = input.generatedAt ?? new Date();
  const visibleChildren = input.children;
  const childrenById = new Map(visibleChildren.map((child) => [child.id, child]));
  const blockersByChild = new Map<string, string[]>();
  for (const edge of unresolvedBlockerEdges(input.blockerEdges)) {
    const labels = blockersByChild.get(edge.blockedIssueId) ?? [];
    labels.push(issueLabel(edge.blocker));
    blockersByChild.set(edge.blockedIssueId, labels);
  }

  const criticalPath = buildCriticalPath(visibleChildren, input.blockerEdges, input.evidenceByIssueId);
  const criticalPathIds = new Set(criticalPath.path.map((step) => step.issueId));
  const blockers = buildBlockerSummaries(childrenById, input.blockerEdges);
  const completed: ParentDeliveryItem[] = [];
  const remaining: ParentDeliveryItem[] = [];
  const risks: ParentDeliveryRisk[] = [];

  for (const child of visibleChildren) {
    const evidence = input.evidenceByIssueId.get(child.id);
    const item = buildItem(child, evidence, blockersByChild.get(child.id) ?? [], criticalPathIds);
    if (child.status === "done") completed.push(item);
    if (child.status === "cancelled" && !isMissingContract(child)) completed.push(item);
    if (OPEN_STATUSES.has(child.status) || isStaleOrSupersededEvidence(evidence)) remaining.push(item);

    if (isMissingContract(child)) {
      pushRisk(risks, {
        kind: "missing_contract",
        severity: child.status === "done" ? "medium" : "low",
        issueId: child.id,
        identifier: child.identifier,
        message: `${issueLabel(child)} is missing structured success criteria or expected output.`,
      });
    }
    if (isMissingEvidence(child, evidence)) {
      pushRisk(risks, {
        kind: "missing_evidence",
        severity: "medium",
        issueId: child.id,
        identifier: child.identifier,
        message: `${issueLabel(child)} is done but lacks current evidence for its contract.`,
      });
    }
    if ((evidence?.staleEvidenceCount ?? 0) > 0) {
      pushRisk(risks, {
        kind: "stale_evidence",
        severity: "medium",
        issueId: child.id,
        identifier: child.identifier,
        message: `${issueLabel(child)} has stale evidence.`,
      });
    }
    if ((evidence?.supersededEvidenceCount ?? 0) > 0) {
      pushRisk(risks, {
        kind: "superseded_evidence",
        severity: "medium",
        issueId: child.id,
        identifier: child.identifier,
        message: `${issueLabel(child)} has superseded evidence.`,
      });
    }
    if (estimateSnapshot(child).source === "default" && OPEN_STATUSES.has(child.status)) {
      pushRisk(risks, {
        kind: "missing_estimate",
        severity: "low",
        issueId: child.id,
        identifier: child.identifier,
        message: `${issueLabel(child)} has no estimate; default M cost was used.`,
      });
    }
  }

  for (const blocker of blockers) {
    if (blocker.status === "cancelled") {
      pushRisk(risks, {
        kind: "cancelled_blocker",
        severity: "high",
        issueId: blocker.blockerIssueId,
        identifier: blocker.identifier,
        message: `${blocker.identifier ?? blocker.title} is cancelled but still blocks child delivery.`,
      });
    }
  }
  if (criticalPath.state === "invalid_graph") {
    for (const step of criticalPath.path) {
      pushRisk(risks, {
        kind: "invalid_dependency_graph",
        severity: "high",
        issueId: step.issueId,
        identifier: step.identifier,
        message: "Dependency graph contains a cycle.",
      });
    }
  }
  if (visibleChildren.length === 0) {
    pushRisk(risks, {
      kind: "no_children",
      severity: "low",
      issueId: input.parent.id,
      identifier: input.parent.identifier,
      message: "Parent has no direct children to summarize.",
    });
  }
  if ((input.filteredChildCount ?? 0) > 0) {
    pushRisk(risks, {
      kind: "permission_filtered_children",
      severity: "medium",
      issueId: input.parent.id,
      identifier: input.parent.identifier,
      message: `${input.filteredChildCount} child issue(s) were omitted by permissions.`,
    });
  }

  const effectiveAgentCap = buildEffectiveAgentCap(visibleChildren, input.blockerEdges, criticalPath);
  const lastMeaningfulProgress = buildLastMeaningfulProgress(
    childrenById,
    input.workProductsByIssueId,
    input.activeRunsByIssueId,
    input.comments,
  );
  const latestEvidenceAt = [...input.workProductsByIssueId.values()]
    .flat()
    .map((product) => toIso(product.updatedAt))
    .filter((value): value is string => value != null)
    .sort()
    .at(-1) ?? null;
  const latestRunAt = [...input.activeRunsByIssueId.values()]
    .map((run) => toIso(run.lastUsefulActionAt ?? run.lastOutputAt ?? run.updatedAt))
    .filter((value): value is string => value != null)
    .sort()
    .at(-1) ?? null;
  const latestCommentAt = input.comments
    .map((comment) => comment.createdAt.toISOString())
    .sort()
    .at(-1) ?? null;
  const maxChildUpdatedAt = visibleChildren
    .map((child) => child.updatedAt.toISOString())
    .concat(input.parent.updatedAt.toISOString())
    .sort()
    .at(-1) ?? input.parent.updatedAt.toISOString();

  const counts = {
    totalChildren: visibleChildren.length + (input.filteredChildCount ?? 0),
    done: visibleChildren.filter((child) => child.status === "done").length,
    active: visibleChildren.filter((child) => child.status === "in_progress").length,
    blocked: visibleChildren.filter((child) => child.status === "blocked").length,
    review: visibleChildren.filter((child) => child.status === "in_review").length,
    todo: visibleChildren.filter((child) => child.status === "todo" || child.status === "backlog").length,
    cancelled: visibleChildren.filter((child) => child.status === "cancelled").length,
    missingContract: visibleChildren.filter(isMissingContract).length,
    missingEvidence: visibleChildren.filter((child) => isMissingEvidence(child, input.evidenceByIssueId.get(child.id))).length,
  };
  const confidence = aggregateConfidence(risks, criticalPath, effectiveAgentCap);

  return {
    parentIssueId: input.parent.id,
    generatedAt: generatedAt.toISOString(),
    sourceRevision: {
      issueUpdatedAt: maxChildUpdatedAt,
      commentCursor: latestCommentAt,
      evidenceCursor: latestEvidenceAt,
      runCursor: latestRunAt,
    },
    state: (input.filteredChildCount ?? 0) > 0 ? "partial" : "fresh",
    counts,
    completed: completed.sort((a, b) => (b.identifier ?? b.title).localeCompare(a.identifier ?? a.title)),
    remaining: remaining.sort((a, b) => Number(b.isOnCriticalPath) - Number(a.isOnCriticalPath) || b.blockers.length - a.blockers.length),
    blockers,
    criticalPath,
    lastMeaningfulProgress,
    effectiveAgentCap,
    risks,
    nextActions: buildNextActions(blockers, risks, remaining),
    confidence,
  };
}

export function compactParentDeliverySummary(summary: ParentDeliverySummary): ParentDeliverySummaryCompact {
  return {
    parentIssueId: summary.parentIssueId,
    generatedAt: summary.generatedAt,
    state: summary.state,
    counts: summary.counts,
    blockerCount: summary.blockers.length,
    criticalPath: {
      state: summary.criticalPath.state,
      estimatedRemainingHeartbeats: summary.criticalPath.estimatedRemainingHeartbeats,
      identifiers: summary.criticalPath.path.map((step) => step.identifier),
      confidence: summary.criticalPath.confidence,
    },
    lastMeaningfulProgress: summary.lastMeaningfulProgress,
    effectiveAgentCap: {
      recommendedCap: summary.effectiveAgentCap.recommendedCap,
      currentActiveAgents: summary.effectiveAgentCap.currentActiveAgents,
      addableAgents: summary.effectiveAgentCap.addableAgents,
      limitingFactors: summary.effectiveAgentCap.limitingFactors,
      confidence: summary.effectiveAgentCap.confidence,
    },
    riskCount: summary.risks.length,
    nextActions: summary.nextActions.slice(0, 3),
    confidence: summary.confidence,
  };
}

function toIssueNode(row: {
  id: string;
  companyId: string;
  parentId: string | null;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  assigneeAgentName?: string | null;
  successCriteria: string[] | null;
  minimumVerification: string[] | null;
  expectedOutput: string | null;
  estimate: IssueEstimate | null;
  phase: string | null;
  executionRunId: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
}): IssueNode {
  return {
    ...row,
    status: row.status as IssueStatus,
    phase: row.phase as IssuePhase | null,
    assigneeAgentName: row.assigneeAgentName ?? null,
  };
}

export function parentDeliverySummaryService(db: Db) {
  async function getParent(parentIssueId: string) {
    const assignee = alias(agents, "parent_delivery_parent_assignee");
    const row = await db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        parentId: issues.parentId,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        priority: issues.priority,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        assigneeAgentName: assignee.name,
        successCriteria: issues.successCriteria,
        minimumVerification: issues.minimumVerification,
        expectedOutput: issues.expectedOutput,
        estimate: issues.estimate,
        phase: issues.phase,
        executionRunId: issues.executionRunId,
        completedAt: issues.completedAt,
        cancelledAt: issues.cancelledAt,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .leftJoin(assignee, eq(issues.assigneeAgentId, assignee.id))
      .where(eq(issues.id, parentIssueId))
      .then((rows) => rows[0] ?? null);
    return row ? toIssueNode(row) : null;
  }

  async function listChildren(parent: IssueNode, visibleChildIssueIds?: string[]) {
    const assignee = alias(agents, "parent_delivery_child_assignee");
    const filters = [
      eq(issues.companyId, parent.companyId),
      eq(issues.parentId, parent.id),
      sql`${issues.hiddenAt} is null`,
    ];
    if (visibleChildIssueIds) {
      if (visibleChildIssueIds.length === 0) return [];
      filters.push(inArray(issues.id, visibleChildIssueIds));
    }
    const rows = await db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        parentId: issues.parentId,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        priority: issues.priority,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        assigneeAgentName: assignee.name,
        successCriteria: issues.successCriteria,
        minimumVerification: issues.minimumVerification,
        expectedOutput: issues.expectedOutput,
        estimate: issues.estimate,
        phase: issues.phase,
        executionRunId: issues.executionRunId,
        completedAt: issues.completedAt,
        cancelledAt: issues.cancelledAt,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .leftJoin(assignee, eq(issues.assigneeAgentId, assignee.id))
      .where(and(...filters))
      .orderBy(issues.issueNumber, issues.createdAt);
    return rows.map(toIssueNode);
  }

  async function countDirectChildren(parent: IssueNode) {
    const row = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(and(eq(issues.companyId, parent.companyId), eq(issues.parentId, parent.id), sql`${issues.hiddenAt} is null`))
      .then((rows) => rows[0] ?? null);
    return row?.count ?? 0;
  }

  async function listBlockerEdges(parent: IssueNode, childIds: string[]) {
    if (childIds.length === 0) return [];
    const blockerIssue = alias(issues, "parent_delivery_blocker_issue");
    const blockerAssignee = alias(agents, "parent_delivery_blocker_assignee");
    const rows = await db
      .select({
        blockedIssueId: issueRelations.relatedIssueId,
        id: blockerIssue.id,
        companyId: blockerIssue.companyId,
        parentId: blockerIssue.parentId,
        identifier: blockerIssue.identifier,
        title: blockerIssue.title,
        status: blockerIssue.status,
        priority: blockerIssue.priority,
        assigneeAgentId: blockerIssue.assigneeAgentId,
        assigneeUserId: blockerIssue.assigneeUserId,
        assigneeAgentName: blockerAssignee.name,
        successCriteria: blockerIssue.successCriteria,
        minimumVerification: blockerIssue.minimumVerification,
        expectedOutput: blockerIssue.expectedOutput,
        estimate: blockerIssue.estimate,
        phase: blockerIssue.phase,
        executionRunId: blockerIssue.executionRunId,
        completedAt: blockerIssue.completedAt,
        cancelledAt: blockerIssue.cancelledAt,
        updatedAt: blockerIssue.updatedAt,
      })
      .from(issueRelations)
      .innerJoin(blockerIssue, eq(issueRelations.issueId, blockerIssue.id))
      .leftJoin(blockerAssignee, eq(blockerIssue.assigneeAgentId, blockerAssignee.id))
      .where(
        and(
          eq(issueRelations.companyId, parent.companyId),
          eq(issueRelations.type, "blocks"),
          inArray(issueRelations.relatedIssueId, childIds),
        ),
      );
    return rows.map((row) => ({
      blockedIssueId: row.blockedIssueId,
      blocker: toIssueNode(row),
    }));
  }

  async function listWorkProductsByIssueId(issueIds: string[]) {
    const byIssue = new Map<string, IssueWorkProduct[]>();
    for (const issueId of issueIds) byIssue.set(issueId, []);
    if (issueIds.length === 0) return byIssue;
    const rows = await db
      .select()
      .from(issueWorkProducts)
      .where(inArray(issueWorkProducts.issueId, issueIds))
      .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
    for (const row of rows) {
      const product = toIssueWorkProduct(row);
      byIssue.set(product.issueId, [...(byIssue.get(product.issueId) ?? []), product]);
    }
    return byIssue;
  }

  async function listActiveRunsByIssueId(children: IssueNode[]) {
    const byIssue = new Map<string, ActiveRunSignal>();
    const runIds = children.map((child) => child.executionRunId).filter((id): id is string => !!id);
    if (runIds.length === 0) return byIssue;
    const issueByRun = new Map(children.filter((child) => child.executionRunId).map((child) => [child.executionRunId as string, child.id]));
    const rows = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        status: heartbeatRuns.status,
        lastUsefulActionAt: heartbeatRuns.lastUsefulActionAt,
        lastOutputAt: heartbeatRuns.lastOutputAt,
        nextAction: heartbeatRuns.nextAction,
        startedAt: heartbeatRuns.startedAt,
        createdAt: heartbeatRuns.createdAt,
        updatedAt: heartbeatRuns.updatedAt,
      })
      .from(heartbeatRuns)
      .where(and(inArray(heartbeatRuns.id, runIds), inArray(heartbeatRuns.status, [...ACTIVE_RUN_STATUSES])));
    for (const row of rows) {
      const issueId = issueByRun.get(row.id);
      if (!issueId) continue;
      byIssue.set(issueId, { ...row, issueId });
    }
    return byIssue;
  }

  async function listLatestComments(issueIds: string[]) {
    if (issueIds.length === 0) return [];
    const rows = await db
      .select({
        issueId: issueComments.issueId,
        body: issueComments.body,
        createdAt: issueComments.createdAt,
      })
      .from(issueComments)
      .where(and(inArray(issueComments.issueId, issueIds), or(eq(issueComments.authorType, "agent"), eq(issueComments.authorType, "user"))))
      .orderBy(desc(issueComments.createdAt))
      .limit(100);
    return rows;
  }

  return {
    getSummary: async (
      parentIssueId: string,
      options: { depth?: number; visibleChildIssueIds?: string[] } = {},
    ) => {
      const depth = options.depth ?? 1;
      if (depth !== 1) {
        throw new Error("parent delivery summary currently supports depth=1");
      }
      const parent = await getParent(parentIssueId);
      if (!parent) throw notFound("Issue not found");

      const [totalChildCount, children] = await Promise.all([
        countDirectChildren(parent),
        listChildren(parent, options.visibleChildIssueIds),
      ]);
      const filteredChildCount = Math.max(0, totalChildCount - children.length);
      const childIds = children.map((child) => child.id);
      const [blockerEdges, workProductsByIssueId, activeRunsByIssueId, comments] = await Promise.all([
        listBlockerEdges(parent, childIds),
        listWorkProductsByIssueId(childIds),
        listActiveRunsByIssueId(children),
        listLatestComments(childIds),
      ]);
      const evidenceByIssueId = new Map<string, IssueDeliveryEvidenceSummary>();
      for (const child of children) {
        evidenceByIssueId.set(child.id, summarizeIssueDeliveryEvidence(child, workProductsByIssueId.get(child.id) ?? []));
      }
      return buildParentDeliverySummary({
        parent,
        children,
        blockerEdges,
        evidenceByIssueId,
        workProductsByIssueId,
        activeRunsByIssueId,
        comments,
        filteredChildCount,
      });
    },

    getCompactSummary: async (parentIssueId: string, options: { depth?: number } = {}) => {
      return compactParentDeliverySummary(await parentDeliverySummaryService(db).getSummary(parentIssueId, options));
    },
  };
}
