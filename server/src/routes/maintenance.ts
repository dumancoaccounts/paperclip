import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { forbidden, notFound, unauthorized, unprocessable } from "../errors.js";
import { heartbeatService, maintenanceGateService, routineService } from "../services/index.js";
import { MAINTENANCE_WINDOW_STATES } from "../services/maintenance-gate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBodyRecord(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function readDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  throw unprocessable("Invalid date value");
}

async function assertMaintenanceOperator(req: Request, companyId?: string | null) {
  if (companyId) assertCompanyAccess(req, companyId);
  if (req.actor.type !== "board") throw unauthorized();
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
  throw forbidden("Instance admin access required");
}

export function maintenanceRoutes(db: Db) {
  const router = Router();
  const gate = maintenanceGateService(db);
  const heartbeat = heartbeatService(db);
  const routines = routineService(db);

  function statusInput(req: Request) {
    return {
      companyId: readString(req.query.companyId),
      scopeType: readString(req.query.scopeType) as "instance" | "company" | "project" | null,
      scopeId: readString(req.query.scopeId),
    };
  }

  router.get("/maintenance/status", async (req, res) => {
    const input = statusInput(req);
    if (input.companyId) assertCompanyAccess(req, input.companyId);
    const status = await gate.buildStatus(input);
    res.json(status);
  });

  router.post("/maintenance/windows", async (req, res) => {
    const body = readBodyRecord(req);
    const companyId = readString(body.companyId) ?? readString(req.query.companyId);
    await assertMaintenanceOperator(req, companyId);
    const scopeType = (readString(body.scopeType) ?? "instance") as "instance" | "company" | "project";
    if (!["instance", "company", "project"].includes(scopeType)) throw unprocessable("Invalid maintenance scopeType");
    const scopeId = readString(body.scopeId) ?? (scopeType === "company" ? companyId : null);
    const drainPolicy = (readString(body.drainPolicy) ?? "wait_for_active_runs") as
      | "wait_for_active_runs"
      | "interrupt_after_deadline"
      | "hold_only";
    if (!["wait_for_active_runs", "interrupt_after_deadline", "hold_only"].includes(drainPolicy)) {
      throw unprocessable("Invalid maintenance drainPolicy");
    }
    const state = readString(body.state) ?? "preparing";
    if (!MAINTENANCE_WINDOW_STATES.includes(state as (typeof MAINTENANCE_WINDOW_STATES)[number])) {
      throw unprocessable("Invalid maintenance state");
    }
    const actor = getActorInfo(req);
    const created = await gate.createWindow({
      companyId,
      scopeType,
      scopeId,
      state: state as (typeof MAINTENANCE_WINDOW_STATES)[number],
      reason: readString(body.reason),
      requestedAction: readString(body.requestedAction),
      drainPolicy,
      drainDeadlineAt: readDate(body.drainDeadlineAt),
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      requestedByAgentId: actor.agentId,
      createdByRunId: actor.runId,
      metadata: typeof body.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : { operatorNote: readString(body.operatorNote) },
    });
    const status = await gate.buildStatus({
      companyId,
      scopeType,
      scopeId,
    });
    if (!created.created) {
      res.status(409).json({
        code: "maintenance_gate_active",
        error: "Maintenance gate already active",
        maintenanceWindowId: created.window.id,
        state: created.window.state,
        status,
      });
      return;
    }
    res.status(201).json({ window: created.window, status });
  });

  router.post("/maintenance/windows/:id/ready-check", async (req, res) => {
    const window = await gate.getWindow(req.params.id as string);
    if (!window) throw notFound("Maintenance window not found");
    await assertMaintenanceOperator(req, window.companyId);
    const body = readBodyRecord(req);
    const result = await gate.readyCheck({
      windowId: window.id,
      markReady: body.markReady !== false,
    });
    res.json(result);
  });

  router.post("/maintenance/windows/:id/interrupt", async (req, res) => {
    const window = await gate.getWindow(req.params.id as string);
    if (!window) throw notFound("Maintenance window not found");
    await assertMaintenanceOperator(req, window.companyId);
    const body = readBodyRecord(req);
    const running = await gate.listRunsForWindow(window, ["running"]);
    const interrupted = [];
    for (const run of running) {
      const updated = await heartbeat.interruptRunForMaintenance({
        runId: run.id,
        maintenanceWindowId: window.id,
        reason: readString(body.reason),
        operatorNote: readString(body.operatorNote),
      });
      if (updated) interrupted.push(updated.id);
    }
    const readiness = await gate.readyCheck({ windowId: window.id });
    res.status(202).json({
      maintenanceWindowId: window.id,
      interruptedRunIds: interrupted,
      readiness,
    });
  });

  router.post("/maintenance/windows/:id/resume", async (req, res) => {
    const window = await gate.getWindow(req.params.id as string);
    if (!window) throw notFound("Maintenance window not found");
    await assertMaintenanceOperator(req, window.companyId);
    const body = readBodyRecord(req);
    const resuming = await gate.transitionWindow({
      windowId: window.id,
      state: "resuming",
      metadata: {
        ...(window.metadata ?? {}),
        operatorNote: readString(body.operatorNote) ?? undefined,
      },
    });
    const released = await gate.markHeldWorkReleased({
      windowId: window.id,
      operatorNote: readString(body.operatorNote),
      releaseReason: "resume",
    });
    const catchUp = await routines.tickScheduledTriggers(new Date());
    for (const agentId of released?.agentIds ?? []) {
      await heartbeat.startNextQueuedRunForAgent(agentId);
    }
    const completed = await gate.transitionWindow({ windowId: window.id, state: "completed" });
    res.json({
      window: completed ?? resuming,
      released,
      catchUp,
    });
  });

  router.post("/maintenance/windows/:id/cancel", async (req, res) => {
    const window = await gate.getWindow(req.params.id as string);
    if (!window) throw notFound("Maintenance window not found");
    await assertMaintenanceOperator(req, window.companyId);
    const body = readBodyRecord(req);
    const released = await gate.markHeldWorkReleased({
      windowId: window.id,
      operatorNote: readString(body.operatorNote),
      releaseReason: "cancel",
    });
    const cancelled = await gate.transitionWindow({ windowId: window.id, state: "cancelled" });
    for (const agentId of released?.agentIds ?? []) {
      await heartbeat.startNextQueuedRunForAgent(agentId);
    }
    res.json({ window: cancelled, released });
  });

  return router;
}
