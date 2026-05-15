import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("instance"),
    scopeId: uuid("scope_id"),
    state: text("state").notNull().default("preparing"),
    reason: text("reason"),
    requestedAction: text("requested_action"),
    drainPolicy: text("drain_policy").notNull().default("wait_for_active_runs"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    drainDeadlineAt: timestamp("drain_deadline_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    requestedByUserId: text("requested_by_user_id"),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByRunId: uuid("created_by_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeStateIdx: index("maintenance_windows_scope_state_idx").on(table.scopeType, table.scopeId, table.state),
    companyStateIdx: index("maintenance_windows_company_state_idx").on(table.companyId, table.state),
  }),
);
