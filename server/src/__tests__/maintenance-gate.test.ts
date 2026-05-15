import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  agentRuntimeState,
  agentWakeupRequests,
  companies,
  createDb,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
  maintenanceGateMembers,
  maintenanceWindows,
  routineRuns,
  routines,
  routineTriggers,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";
import { maintenanceGateService } from "../services/maintenance-gate.ts";
import { routineService } from "../services/routines.ts";

const mockAdapterExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    summary: "Maintenance gate test run.",
    provider: "test",
    model: "test-model",
  })),
);

vi.mock("../adapters/index.ts", async () => {
  const actual = await vi.importActual<typeof import("../adapters/index.ts")>("../adapters/index.ts");
  return {
    ...actual,
    getServerAdapter: vi.fn(() => ({
      supportsLocalAgentJwt: false,
      execute: mockAdapterExecute,
    })),
  };
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("maintenance gate", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-maintenance-gate-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    mockAdapterExecute.mockClear();
    await db.delete(maintenanceGateMembers);
    await db.delete(maintenanceWindows);
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(issues);
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(agentRuntimeState);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {
        heartbeat: {
          enabled: true,
          intervalSec: 1,
          wakeOnDemand: true,
        },
      },
      permissions: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    return { companyId, agentId };
  }

  it("transitions active windows and deduplicates held members", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const gate = maintenanceGateService(db);
    const { window } = await gate.createWindow({
      companyId,
      scopeType: "company",
      scopeId: companyId,
      state: "preparing",
      reason: "test maintenance",
    });

    expect(await gate.getActiveWindowForScope({ companyId })).toMatchObject({
      id: window.id,
      state: "preparing",
    });

    const draining = await gate.transitionWindow({ windowId: window.id, state: "draining" });
    expect(draining?.state).toBe("draining");
    await expect(gate.transitionWindow({ windowId: window.id, state: "completed" })).rejects.toThrow(
      "Invalid maintenance transition",
    );

    const first = await gate.recordHeldMember({
      maintenanceWindowId: window.id,
      companyId,
      agentId,
      kind: "scheduler_source",
      dedupeKey: `scheduler_source:${agentId}:heartbeat_timer:interval_elapsed`,
      snapshotJson: { attempt: 1 },
    });
    const second = await gate.recordHeldMember({
      maintenanceWindowId: window.id,
      companyId,
      agentId,
      kind: "scheduler_source",
      dedupeKey: `scheduler_source:${agentId}:heartbeat_timer:interval_elapsed`,
      snapshotJson: { attempt: 2 },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const members = await db.select().from(maintenanceGateMembers);
    expect(members).toHaveLength(1);
    expect(members[0].snapshotJson).toEqual({ attempt: 2 });
  });

  it("holds queued heartbeat runs without starting an adapter process", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    await maintenanceGateService(db).createWindow({
      companyId,
      scopeType: "company",
      scopeId: companyId,
      state: "draining",
    });

    const heartbeat = heartbeatService(db);
    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "maintenance_gate_test",
      requestedByActorType: "system",
      requestedByActorId: "test",
    });

    expect(run?.status).toBe("queued");
    expect(mockAdapterExecute).not.toHaveBeenCalled();
    const [persistedRun] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    expect(persistedRun.status).toBe("queued");
    const [member] = await db.select().from(maintenanceGateMembers);
    expect(member).toMatchObject({
      kind: "queued_run",
      state: "held",
      runId: run!.id,
      agentId,
    });
  });

  it("records timer scheduler ticks as held without enqueueing runs", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    await maintenanceGateService(db).createWindow({
      companyId,
      scopeType: "company",
      scopeId: companyId,
      state: "preparing",
    });

    const result = await heartbeatService(db).tickTimers(new Date("2026-01-01T00:05:00.000Z"));

    expect(result).toEqual({ checked: 1, enqueued: 0, skipped: 1 });
    expect(await db.select().from(heartbeatRuns)).toHaveLength(0);
    const [member] = await db.select().from(maintenanceGateMembers);
    expect(member).toMatchObject({
      kind: "scheduler_source",
      state: "held",
      agentId,
    });
  });

  it("holds API routine dispatch idempotently without creating execution issues", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    await maintenanceGateService(db).createWindow({
      companyId,
      scopeType: "company",
      scopeId: companyId,
      state: "draining",
    });

    const routinesSvc = routineService(db, {
      heartbeat: {
        wakeup: vi.fn(),
      },
    });
    const routine = await routinesSvc.create(companyId, {
      title: "Maintenance routine",
      description: "Should be held",
      assigneeAgentId: agentId,
      status: "active",
      priority: "medium",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
    }, {});

    const first = await routinesSvc.runRoutine(routine.id, {
      source: "api",
      idempotencyKey: "maintenance-api-dispatch",
    });
    const second = await routinesSvc.runRoutine(routine.id, {
      source: "api",
      idempotencyKey: "maintenance-api-dispatch",
    });

    expect(first.status).toBe("maintenance_held");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("maintenance_held");
    expect(await db.select().from(issues)).toHaveLength(0);
    const members = await db.select().from(maintenanceGateMembers);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      kind: "routine_trigger",
      routineRunId: first.id,
      state: "held",
    });
  });
});
