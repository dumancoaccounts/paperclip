ALTER TABLE "issue_work_products" ADD COLUMN "evidence_kind" text;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "verification_role" text DEFAULT 'supporting' NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "validity" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "satisfies_minimum_verification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "covers_expected_output" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "superseded_by_work_product_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "superseded_reason" text;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_superseded_by_work_product_id_issue_work_products_id_fk" FOREIGN KEY ("superseded_by_work_product_id") REFERENCES "public"."issue_work_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_work_products_company_issue_evidence_kind_idx" ON "issue_work_products" USING btree ("company_id","issue_id","evidence_kind");--> statement-breakpoint
CREATE INDEX "issue_work_products_company_issue_validity_idx" ON "issue_work_products" USING btree ("company_id","issue_id","validity");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_work_products_primary_current_role_uq" ON "issue_work_products" USING btree ("company_id","issue_id","verification_role") WHERE "issue_work_products"."is_primary" = true and "issue_work_products"."validity" = 'current';
