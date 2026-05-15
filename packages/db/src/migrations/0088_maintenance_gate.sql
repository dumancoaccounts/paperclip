CREATE TABLE IF NOT EXISTS "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"scope_type" text DEFAULT 'instance' NOT NULL,
	"scope_id" uuid,
	"state" text DEFAULT 'preparing' NOT NULL,
	"reason" text,
	"requested_action" text,
	"drain_policy" text DEFAULT 'wait_for_active_runs' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drain_deadline_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"requested_by_user_id" text,
	"requested_by_agent_id" uuid,
	"created_by_run_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_gate_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_window_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"issue_id" uuid,
	"run_id" uuid,
	"wakeup_request_id" uuid,
	"routine_id" uuid,
	"routine_trigger_id" uuid,
	"routine_run_id" uuid,
	"kind" text NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"resume_policy" text DEFAULT 'resume_after_maintenance' NOT NULL,
	"dedupe_key" text NOT NULL,
	"snapshot_json" jsonb,
	"held_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_windows_company_id_companies_id_fk') THEN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_windows_requested_by_agent_id_agents_id_fk') THEN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_windows_created_by_run_id_heartbeat_runs_id_fk') THEN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_maintenance_window_id_maintenance_windows_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_maintenance_window_id_maintenance_windows_id_fk" FOREIGN KEY ("maintenance_window_id") REFERENCES "public"."maintenance_windows"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_company_id_companies_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_agent_id_agents_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_issue_id_issues_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_run_id_heartbeat_runs_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_wakeup_request_id_agent_wakeup_requests_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_wakeup_request_id_agent_wakeup_requests_id_fk" FOREIGN KEY ("wakeup_request_id") REFERENCES "public"."agent_wakeup_requests"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_routine_id_routines_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_routine_trigger_id_routine_triggers_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_routine_trigger_id_routine_triggers_id_fk" FOREIGN KEY ("routine_trigger_id") REFERENCES "public"."routine_triggers"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_gate_members_routine_run_id_routine_runs_id_fk') THEN
  ALTER TABLE "maintenance_gate_members" ADD CONSTRAINT "maintenance_gate_members_routine_run_id_routine_runs_id_fk" FOREIGN KEY ("routine_run_id") REFERENCES "public"."routine_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_windows_scope_state_idx" ON "maintenance_windows" USING btree ("scope_type","scope_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_windows_company_state_idx" ON "maintenance_windows" USING btree ("company_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_gate_members_window_dedupe_uq" ON "maintenance_gate_members" USING btree ("maintenance_window_id","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_gate_members_company_state_idx" ON "maintenance_gate_members" USING btree ("company_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_gate_members_window_kind_state_idx" ON "maintenance_gate_members" USING btree ("maintenance_window_id","kind","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_gate_members_run_idx" ON "maintenance_gate_members" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_gate_members_wakeup_idx" ON "maintenance_gate_members" USING btree ("wakeup_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_gate_members_routine_run_idx" ON "maintenance_gate_members" USING btree ("routine_run_id");
