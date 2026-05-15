import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { agentWakeupRequests } from "./agent_wakeup_requests.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";
import { maintenanceWindows } from "./maintenance_windows.js";
import { routineRuns, routines, routineTriggers } from "./routines.js";

export const maintenanceGateMembers = pgTable(
  "maintenance_gate_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    maintenanceWindowId: uuid("maintenance_window_id")
      .notNull()
      .references(() => maintenanceWindows.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    wakeupRequestId: uuid("wakeup_request_id").references(() => agentWakeupRequests.id, { onDelete: "set null" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }),
    routineTriggerId: uuid("routine_trigger_id").references(() => routineTriggers.id, { onDelete: "set null" }),
    routineRunId: uuid("routine_run_id").references(() => routineRuns.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("held"),
    resumePolicy: text("resume_policy").notNull().default("resume_after_maintenance"),
    dedupeKey: text("dedupe_key").notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>(),
    heldAt: timestamp("held_at", { withTimezone: true }).notNull().defaultNow(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    windowDedupeIdx: uniqueIndex("maintenance_gate_members_window_dedupe_uq").on(
      table.maintenanceWindowId,
      table.dedupeKey,
    ),
    companyStateIdx: index("maintenance_gate_members_company_state_idx").on(table.companyId, table.state),
    windowKindStateIdx: index("maintenance_gate_members_window_kind_state_idx").on(
      table.maintenanceWindowId,
      table.kind,
      table.state,
    ),
    runIdx: index("maintenance_gate_members_run_idx").on(table.runId),
    wakeupIdx: index("maintenance_gate_members_wakeup_idx").on(table.wakeupRequestId),
    routineRunIdx: index("maintenance_gate_members_routine_run_idx").on(table.routineRunId),
  }),
);
