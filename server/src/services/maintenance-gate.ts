import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  heartbeatRuns,
  issues,
  maintenanceGateMembers,
  maintenanceWindows,
  routineRuns,
  routines,
  routineTriggers,
} from "@paperclipai/db";

export const MAINTENANCE_GATE_HOLD_STATES = [
  "preparing",
  "draining",
  "ready_to_stop",
  "stopping",
  "stopped",
] as const;

export const MAINTENANCE_WINDOW_STATES = [
  ...MAINTENANCE_GATE_HOLD_STATES,
  "resuming",
  "completed",
  "cancelled",
  "failed",
] as const;

const LIVE_RUN_STATUSES = ["queued", "running", "scheduled_retry"] as const;

export type MaintenanceGateHoldState = (typeof MAINTENANCE_GATE_HOLD_STATES)[number];
export type MaintenanceWindowState = (typeof MAINTENANCE_WINDOW_STATES)[number];
export type MaintenanceScopeType = "instance" | "company" | "project";
export type MaintenanceDrainPolicy = "wait_for_active_runs" | "interrupt_after_deadline" | "hold_only";
export type MaintenanceGateMemberKind =
  | "running_run"
  | "queued_run"
  | "deferred_wakeup"
  | "scheduler_source"
  | "routine_trigger";

type MaintenanceWindow = typeof maintenanceWindows.$inferSelect;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function transitionAllowed(from: string, to: MaintenanceWindowState) {
  if (from === to) return true;
  const allowed: Record<string, MaintenanceWindowState[]> = {
    preparing: ["draining", "ready_to_stop", "cancelled", "failed"],
    draining: ["ready_to_stop", "stopping", "resuming", "cancelled", "failed"],
    ready_to_stop: ["stopping", "resuming", "cancelled", "failed"],
    stopping: ["stopped", "failed"],
    stopped: ["resuming", "failed"],
    resuming: ["completed", "failed"],
    completed: [],
    cancelled: [],
    failed: [],
  };
  return (allowed[from] ?? []).includes(to);
}

export function maintenanceGateService(db: Db) {
  function windowCompanyId(window: MaintenanceWindow) {
    return window.scopeType === "company"
      ? window.scopeId ?? window.companyId
      : window.companyId;
  }

  function runScopePredicate(window: MaintenanceWindow, statuses: readonly string[]) {
    const predicates = [inArray(heartbeatRuns.status, [...statuses])];
    const companyId = windowCompanyId(window);
    if (companyId) predicates.push(eq(heartbeatRuns.companyId, companyId));
    if (window.scopeType === "project" && window.scopeId) {
      const issueId = sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`;
      predicates.push(sql`exists (
        select 1 from ${issues}
        where ${issues.companyId} = ${heartbeatRuns.companyId}
          and ${issues.id}::text = ${issueId}
          and coalesce(${heartbeatRuns.contextSnapshot} ->> 'projectId', ${issues.projectId}::text) = ${window.scopeId}
      )`);
    }
    return and(...predicates);
  }

  async function countRunsForWindow(window: MaintenanceWindow, statuses: readonly string[]) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(heartbeatRuns)
      .where(runScopePredicate(window, statuses));
    return Number(value ?? 0);
  }

  async function listRunsForWindow(window: MaintenanceWindow, statuses: readonly string[]) {
    return db
      .select()
      .from(heartbeatRuns)
      .where(runScopePredicate(window, statuses))
      .orderBy(asc(heartbeatRuns.createdAt));
  }

  async function countHeldMembersForWindow(windowId: string) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(maintenanceGateMembers)
      .where(
        and(
          eq(maintenanceGateMembers.maintenanceWindowId, windowId),
          inArray(maintenanceGateMembers.state, ["draining", "held", "interrupted"]),
        ),
      );
    return Number(value ?? 0);
  }

  async function getWindow(windowId: string) {
    return db
      .select()
      .from(maintenanceWindows)
      .where(eq(maintenanceWindows.id, windowId))
      .then((rows) => rows[0] ?? null);
  }

  async function getIssueProject(companyId: string, issueId: string | null | undefined) {
    if (!issueId) return null;
    return db
      .select({ projectId: issues.projectId })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId)))
      .then((rows) => rows[0]?.projectId ?? null);
  }

  async function getActiveWindowForScope(input: {
    companyId: string;
    projectId?: string | null;
  }) {
    const projectMatch = input.projectId
      ? and(eq(maintenanceWindows.scopeType, "project"), eq(maintenanceWindows.scopeId, input.projectId))
      : undefined;

    return db
      .select()
      .from(maintenanceWindows)
      .where(
        and(
          inArray(maintenanceWindows.state, [...MAINTENANCE_GATE_HOLD_STATES]),
          or(isNull(maintenanceWindows.companyId), eq(maintenanceWindows.companyId, input.companyId)),
          or(
            eq(maintenanceWindows.scopeType, "instance"),
            and(eq(maintenanceWindows.scopeType, "company"), eq(maintenanceWindows.scopeId, input.companyId)),
            and(eq(maintenanceWindows.scopeType, "company"), eq(maintenanceWindows.companyId, input.companyId)),
            projectMatch,
          ),
        ),
      )
      .orderBy(
        sql`case ${maintenanceWindows.scopeType} when 'project' then 0 when 'company' then 1 else 2 end`,
        desc(maintenanceWindows.startedAt),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async function createWindow(input: {
    companyId?: string | null;
    scopeType?: MaintenanceScopeType;
    scopeId?: string | null;
    state?: MaintenanceWindowState;
    reason?: string | null;
    requestedAction?: string | null;
    drainPolicy?: MaintenanceDrainPolicy;
    drainDeadlineAt?: Date | null;
    requestedByUserId?: string | null;
    requestedByAgentId?: string | null;
    createdByRunId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const existing = input.companyId
      ? await getActiveWindowForScope({
          companyId: input.companyId,
          projectId: input.scopeType === "project" ? input.scopeId ?? null : null,
        })
      : await db
          .select()
          .from(maintenanceWindows)
          .where(
            and(
              inArray(maintenanceWindows.state, [...MAINTENANCE_GATE_HOLD_STATES]),
              eq(maintenanceWindows.scopeType, input.scopeType ?? "instance"),
              input.scopeId ? eq(maintenanceWindows.scopeId, input.scopeId) : isNull(maintenanceWindows.scopeId),
            ),
          )
          .orderBy(desc(maintenanceWindows.startedAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);
    if (existing) {
      return { window: existing, created: false as const };
    }

    return db
      .insert(maintenanceWindows)
      .values({
        companyId: input.companyId ?? null,
        scopeType: input.scopeType ?? "instance",
        scopeId: input.scopeId ?? (input.scopeType === "company" ? input.companyId ?? null : null),
        state: input.state ?? "preparing",
        reason: input.reason ?? null,
        requestedAction: input.requestedAction ?? null,
        drainPolicy: input.drainPolicy ?? "wait_for_active_runs",
        drainDeadlineAt: input.drainDeadlineAt ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByAgentId: input.requestedByAgentId ?? null,
        createdByRunId: input.createdByRunId ?? null,
        metadata: input.metadata ?? null,
      })
      .returning()
      .then((rows) => ({ window: rows[0], created: true as const }));
  }

  async function transitionWindow(input: {
    windowId: string;
    state: MaintenanceWindowState;
    metadata?: Record<string, unknown> | null;
    now?: Date;
  }) {
    const existing = await getWindow(input.windowId);
    if (!existing) return null;
    if (!transitionAllowed(existing.state, input.state)) {
      throw new Error(`Invalid maintenance transition ${existing.state} -> ${input.state}`);
    }

    const now = input.now ?? new Date();
    return db
      .update(maintenanceWindows)
      .set({
        state: input.state,
        metadata: input.metadata === undefined ? existing.metadata : input.metadata,
        readyAt: input.state === "ready_to_stop" ? now : undefined,
        stoppedAt: input.state === "stopped" ? now : undefined,
        resumedAt: input.state === "resuming" ? now : undefined,
        completedAt:
          input.state === "completed" || input.state === "cancelled" || input.state === "failed"
            ? now
            : undefined,
        updatedAt: now,
      })
      .where(eq(maintenanceWindows.id, input.windowId))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function recordHeldMember(input: {
    maintenanceWindowId: string;
    companyId: string;
    kind: MaintenanceGateMemberKind;
    dedupeKey: string;
    agentId?: string | null;
    issueId?: string | null;
    runId?: string | null;
    wakeupRequestId?: string | null;
    routineId?: string | null;
    routineTriggerId?: string | null;
    routineRunId?: string | null;
    state?: "draining" | "held" | "interrupted" | "resumed" | "skipped" | "completed";
    resumePolicy?: "resume_after_maintenance" | "manual_review" | "discard_if_stale";
    snapshotJson?: Record<string, unknown> | null;
  }) {
    const existing = await db
      .select()
      .from(maintenanceGateMembers)
      .where(
        and(
          eq(maintenanceGateMembers.maintenanceWindowId, input.maintenanceWindowId),
          eq(maintenanceGateMembers.dedupeKey, input.dedupeKey),
        ),
      )
      .then((rows) => rows[0] ?? null);

    const values = {
      companyId: input.companyId,
      agentId: input.agentId ?? null,
      issueId: input.issueId ?? null,
      runId: input.runId ?? null,
      wakeupRequestId: input.wakeupRequestId ?? null,
      routineId: input.routineId ?? null,
      routineTriggerId: input.routineTriggerId ?? null,
      routineRunId: input.routineRunId ?? null,
      kind: input.kind,
      state: input.state ?? "held",
      resumePolicy: input.resumePolicy ?? "resume_after_maintenance",
      snapshotJson: input.snapshotJson ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      const [member] = await db
        .update(maintenanceGateMembers)
        .set(values)
        .where(eq(maintenanceGateMembers.id, existing.id))
        .returning();
      return { member, created: false };
    }

    const [member] = await db
      .insert(maintenanceGateMembers)
      .values({
        maintenanceWindowId: input.maintenanceWindowId,
        dedupeKey: input.dedupeKey,
        ...values,
      })
      .onConflictDoUpdate({
        target: [maintenanceGateMembers.maintenanceWindowId, maintenanceGateMembers.dedupeKey],
        set: values,
      })
      .returning();

    return { member, created: true };
  }

  async function buildWindowReadiness(window: MaintenanceWindow) {
    const [runningCount, queuedCount, heldCount] = await Promise.all([
      countRunsForWindow(window, ["running"]),
      countRunsForWindow(window, ["queued", "scheduled_retry"]),
      countHeldMembersForWindow(window.id),
    ]);
    const waitingForActiveRuns = runningCount;
    return {
      ready: waitingForActiveRuns === 0,
      waitingForActiveRuns,
      runningCount,
      queuedCount,
      heldCount,
      state: window.state,
      blockers:
        waitingForActiveRuns > 0
          ? [{
              type: "active_runs",
              count: waitingForActiveRuns,
              message: "Maintenance is waiting for active runs to finish or be interrupted",
            }]
          : [],
    };
  }

  async function buildStatus(input: {
    companyId?: string | null;
    scopeType?: MaintenanceScopeType | null;
    scopeId?: string | null;
  } = {}) {
    let window: MaintenanceWindow | null = null;
    if (input.scopeType === "project" && input.scopeId && input.companyId) {
      window = await getActiveWindowForScope({ companyId: input.companyId, projectId: input.scopeId });
    } else if (input.companyId) {
      window = await getActiveWindowForScope({ companyId: input.companyId });
    } else {
      window = await db
        .select()
        .from(maintenanceWindows)
        .where(inArray(maintenanceWindows.state, [...MAINTENANCE_GATE_HOLD_STATES, "resuming"]))
        .orderBy(desc(maintenanceWindows.startedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    }

    if (!window) {
      return {
        active: false,
        window: null,
        readiness: {
          ready: true,
          waitingForActiveRuns: 0,
          runningCount: 0,
          queuedCount: 0,
          heldCount: 0,
          state: null,
          blockers: [],
        },
        activeRuns: [],
      };
    }

    const [readiness, activeRuns] = await Promise.all([
      buildWindowReadiness(window),
      listRunsForWindow(window, [...LIVE_RUN_STATUSES]),
    ]);
    return {
      active: true,
      window,
      readiness,
      activeRuns: activeRuns.map((run) => ({
        id: run.id,
        agentId: run.agentId,
        status: run.status,
        invocationSource: run.invocationSource,
        triggerDetail: run.triggerDetail,
        issueId: readString(parseRecord(run.contextSnapshot).issueId),
        startedAt: run.startedAt,
        createdAt: run.createdAt,
        lastOutputAt: run.lastOutputAt,
      })),
    };
  }

  async function readyCheck(input: { windowId: string; markReady?: boolean; now?: Date }) {
    const window = await getWindow(input.windowId);
    if (!window) return null;
    const readiness = await buildWindowReadiness(window);
    if (
      input.markReady !== false &&
      readiness.ready &&
      (window.state === "preparing" || window.state === "draining")
    ) {
      const readyWindow = await transitionWindow({
        windowId: window.id,
        state: "ready_to_stop",
        now: input.now,
      });
      return { window: readyWindow ?? window, readiness: { ...readiness, state: readyWindow?.state ?? window.state } };
    }
    return { window, readiness };
  }

  async function markHeldWorkReleased(input: {
    windowId: string;
    operatorNote?: string | null;
    now?: Date;
    releaseReason?: "resume" | "cancel";
  }) {
    const window = await getWindow(input.windowId);
    if (!window) return null;
    const now = input.now ?? new Date();
    const members = await db
      .select()
      .from(maintenanceGateMembers)
      .where(
        and(
          eq(maintenanceGateMembers.maintenanceWindowId, window.id),
          inArray(maintenanceGateMembers.state, ["held", "draining", "interrupted"]),
        ),
      );
    const runIds = members.map((member) => member.runId).filter((id): id is string => Boolean(id));
    const agentIds = [...new Set(members.map((member) => member.agentId).filter((id): id is string => Boolean(id)))];

    if (runIds.length > 0) {
      const runs = await db
        .select()
        .from(heartbeatRuns)
        .where(inArray(heartbeatRuns.id, runIds));
      for (const run of runs) {
        const context = parseRecord(run.contextSnapshot);
        await db
          .update(heartbeatRuns)
          .set({
            contextSnapshot: {
              ...context,
              maintenanceResume: {
                maintenanceWindowId: window.id,
                previousRunId: run.id,
                previousSessionDisplayId: run.sessionIdBefore ?? null,
                continuationSummary: parseRecord(context.continuationSummary),
                drainState: window.state,
                operatorNote: input.operatorNote ?? readString(parseRecord(window.metadata).operatorNote),
                releaseReason: input.releaseReason ?? "resume",
              },
            },
            updatedAt: now,
          })
          .where(eq(heartbeatRuns.id, run.id));
      }
    }

    if (members.length > 0) {
      await db
        .update(maintenanceGateMembers)
        .set({
          state: "resumed",
          resumedAt: now,
          updatedAt: now,
        })
        .where(inArray(maintenanceGateMembers.id, members.map((member) => member.id)));
    }

    return { window, memberCount: members.length, runIds, agentIds };
  }

  async function canEnqueueWakeup(input: {
    companyId: string;
    issueId?: string | null;
    projectId?: string | null;
  }) {
    const projectId = input.projectId ?? await getIssueProject(input.companyId, input.issueId);
    const window = await getActiveWindowForScope({ companyId: input.companyId, projectId });
    return window
      ? { allowed: false as const, window }
      : { allowed: true as const, window: null };
  }

  async function holdQueuedRun(input: {
    run: typeof heartbeatRuns.$inferSelect;
    reason?: string;
  }) {
    const context = parseRecord(input.run.contextSnapshot);
    const issueId = readString(context.issueId) ?? readString(context.taskId);
    const projectId = readString(context.projectId) ?? await getIssueProject(input.run.companyId, issueId);
    const gate = await canEnqueueWakeup({ companyId: input.run.companyId, issueId, projectId });
    if (gate.allowed) return { held: false as const, window: null, member: null, created: false };

    const recorded = await recordHeldMember({
      maintenanceWindowId: gate.window.id,
      companyId: input.run.companyId,
      agentId: input.run.agentId,
      issueId,
      runId: input.run.id,
      wakeupRequestId: input.run.wakeupRequestId,
      kind: "queued_run",
      dedupeKey: `queued_run:${input.run.id}`,
      snapshotJson: {
        reason: input.reason ?? "claim_queued_run",
        runStatus: input.run.status,
        invocationSource: input.run.invocationSource,
        triggerDetail: input.run.triggerDetail,
        contextSnapshot: context,
        queuedAt: input.run.createdAt.toISOString(),
      },
    });
    return { held: true as const, window: gate.window, ...recorded };
  }

  async function holdSchedulerTick(input: {
    companyId: string;
    agentId: string;
    now: Date;
    source: string;
    reason: string;
  }) {
    const window = await getActiveWindowForScope({ companyId: input.companyId });
    if (!window) return { held: false as const, window: null, member: null, created: false };
    const recorded = await recordHeldMember({
      maintenanceWindowId: window.id,
      companyId: input.companyId,
      agentId: input.agentId,
      kind: "scheduler_source",
      dedupeKey: `scheduler_source:${input.agentId}:${input.source}:${input.reason}`,
      snapshotJson: {
        source: input.source,
        reason: input.reason,
        now: input.now.toISOString(),
      },
    });
    return { held: true as const, window, ...recorded };
  }

  async function holdRoutineDispatch(input: {
    routine: typeof routines.$inferSelect;
    trigger: typeof routineTriggers.$inferSelect | null;
    run: typeof routineRuns.$inferSelect;
    source: "schedule" | "manual" | "api" | "webhook";
    projectId?: string | null;
    assigneeAgentId?: string | null;
    title?: string | null;
    description?: string | null;
    triggerPayload?: Record<string, unknown> | null;
    dispatchFingerprint?: string | null;
  }) {
    const projectId = input.projectId ?? input.routine.projectId ?? null;
    const window = await getActiveWindowForScope({ companyId: input.routine.companyId, projectId });
    if (!window) return { held: false as const, window: null, member: null, created: false };
    const recorded = await recordHeldMember({
      maintenanceWindowId: window.id,
      companyId: input.routine.companyId,
      agentId: input.assigneeAgentId ?? input.routine.assigneeAgentId,
      routineId: input.routine.id,
      routineTriggerId: input.trigger?.id ?? null,
      routineRunId: input.run.id,
      kind: "routine_trigger",
      dedupeKey: `routine_run:${input.run.id}`,
      snapshotJson: {
        source: input.source,
        routineId: input.routine.id,
        triggerId: input.trigger?.id ?? null,
        triggerKind: input.trigger?.kind ?? null,
        title: input.title ?? input.routine.title,
        description: input.description ?? input.routine.description,
        projectId,
        assigneeAgentId: input.assigneeAgentId ?? input.routine.assigneeAgentId,
        triggerPayload: input.triggerPayload ?? null,
        dispatchFingerprint: input.dispatchFingerprint ?? input.run.dispatchFingerprint,
      },
    });
    return { held: true as const, window, ...recorded };
  }

  return {
    buildStatus,
    canEnqueueWakeup,
    createWindow,
    getActiveWindowForScope,
    getWindow,
    holdQueuedRun,
    holdRoutineDispatch,
    holdSchedulerTick,
    listRunsForWindow,
    markHeldWorkReleased,
    readyCheck,
    recordHeldMember,
    transitionWindow,
  };
}
