CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"employee_id" integer,
	"actor" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"citations" jsonb,
	"confidence" double precision,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"location" text NOT NULL,
	"start_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"manager_name" text,
	"manager_email" text,
	"manager_clerk_id" text,
	"clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"plan_id" integer,
	"task_id" integer,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "llm_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"success" boolean NOT NULL,
	"error" text,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"generation_mode" text DEFAULT 'ai' NOT NULL,
	"ai_confidence" double precision,
	"ai_raw_response" jsonb,
	"compliance_score" double precision,
	"compliance_missing" jsonb,
	"notes" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_name" text NOT NULL,
	"section" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"location_scope" text DEFAULT 'global' NOT NULL,
	"role_scope" text DEFAULT 'all' NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"assigned_to_role" text NOT NULL,
	"assigned_to_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"due_date" date NOT NULL,
	"dependency_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"review_confirmed" boolean DEFAULT false NOT NULL,
	"policy_reference" text,
	"source" text DEFAULT 'rule' NOT NULL,
	"hr_modified" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_plan_id_onboarding_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_plans" ADD CONSTRAINT "onboarding_plans_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plan_id_onboarding_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_employee_idx" ON "audit_log" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_employee_idx" ON "chat_messages" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_uq" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "employees_manager_clerk_idx" ON "employees" USING btree ("manager_clerk_id");--> statement-breakpoint
CREATE INDEX "escalations_status_idx" ON "escalations" USING btree ("status","employee_id");--> statement-breakpoint
CREATE INDEX "plans_employee_idx" ON "onboarding_plans" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "policy_chunks_embedding_idx" ON "policy_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "policy_chunks_doc_idx" ON "policy_chunks" USING btree ("doc_name","chunk_index");--> statement-breakpoint
CREATE INDEX "tasks_plan_idx" ON "tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "tasks_status_due_idx" ON "tasks" USING btree ("status","due_date");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is insert-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
