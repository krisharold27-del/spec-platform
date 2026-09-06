CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"role_id" text NOT NULL,
	"criterion_id" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"note" text,
	"entered_by" text,
	"entered_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "board_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"markdown" text NOT NULL,
	"generated_by" text DEFAULT 'claude' NOT NULL,
	"approved_by" text,
	"created_at" text NOT NULL,
	CONSTRAINT "board_outputs_period_id_unique" UNIQUE("period_id")
);
--> statement-breakpoint
ALTER TABLE "board_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claude_registrations" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"workspace_name" text,
	"seats_confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" text,
	"confirmed_at" text
);
--> statement-breakpoint
ALTER TABLE "claude_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "criteria" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"pillar" text NOT NULL,
	"text" text NOT NULL,
	"weight" real NOT NULL,
	"kpi" boolean DEFAULT false NOT NULL,
	"target" text,
	"proposed_target" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "criteria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"section_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" text NOT NULL,
	"answered_by" text,
	"answered_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnostics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gates" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"gate" text NOT NULL,
	"value" text NOT NULL,
	"pass" boolean NOT NULL,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"step_id" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"note" text,
	"completed_by" text,
	"completed_at" text
);
--> statement-breakpoint
ALTER TABLE "journey_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"minutes" text,
	"actions" text
);
--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"user_id" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text
);
--> statement-breakpoint
ALTER TABLE "role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"stream" text NOT NULL,
	"level" text NOT NULL,
	"default_access" text DEFAULT 'readonly' NOT NULL,
	"reports_to_role_id" text,
	"pnl_view" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rulebook_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"pattern" text NOT NULL,
	"action" text NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"start_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"program_requested_at" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"access" text DEFAULT 'readonly' NOT NULL,
	"invited_at" text,
	"accepted_at" text
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_period_id_assessment_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."assessment_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_criterion_id_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_outputs" ADD CONSTRAINT "board_outputs_period_id_assessment_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."assessment_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_registrations" ADD CONSTRAINT "claude_registrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gates" ADD CONSTRAINT "gates_period_id_assessment_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."assessment_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_periods" ADD CONSTRAINT "assessment_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_unique" ON "assessments" USING btree ("period_id","role_id","criterion_id");--> statement-breakpoint
CREATE INDEX "criteria_role_pillar" ON "criteria" USING btree ("role_id","pillar");--> statement-breakpoint
CREATE INDEX "diag_tenant_section" ON "diagnostics" USING btree ("tenant_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gates_unique" ON "gates" USING btree ("period_id","gate");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_tenant_step" ON "journey_steps" USING btree ("tenant_id","step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_tenant_period" ON "assessment_periods" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "ra_role" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "ra_user" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roles_tenant" ON "roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_auth_user" ON "users" USING btree ("auth_user_id");