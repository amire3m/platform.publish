BEGIN;

CREATE TABLE "workflow_programs" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "series_name" text,
  "owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "due_at" timestamp with time zone,
  "notes" text,
  "source" text NOT NULL DEFAULT 'manual',
  "source_ref" text,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone
);

CREATE INDEX "workflow_program_owner_idx" ON "workflow_programs" ("owner_user_id");
CREATE INDEX "workflow_program_due_idx" ON "workflow_programs" ("due_at");
CREATE INDEX "workflow_program_archived_idx" ON "workflow_programs" ("archived_at");

CREATE TABLE "workflow_deliverables" (
  "id" text PRIMARY KEY,
  "program_id" text NOT NULL REFERENCES "workflow_programs"("id"),
  "name" text NOT NULL,
  "kind" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "production_status" text NOT NULL DEFAULT 'not_started',
  "assignee_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "due_at" timestamp with time zone,
  "notes" text,
  "content_id" text REFERENCES "content"("id"),
  "archived_at" timestamp with time zone,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "workflow_deliverable_program_idx" ON "workflow_deliverables" ("program_id");
CREATE INDEX "workflow_deliverable_assignee_idx" ON "workflow_deliverables" ("assignee_user_id");
CREATE INDEX "workflow_deliverable_status_idx" ON "workflow_deliverables" ("production_status");
CREATE INDEX "workflow_deliverable_due_idx" ON "workflow_deliverables" ("due_at");
CREATE UNIQUE INDEX "workflow_deliverable_content_unique" ON "workflow_deliverables" ("content_id");

CREATE TABLE "workflow_publications" (
  "id" text PRIMARY KEY,
  "deliverable_id" text NOT NULL REFERENCES "workflow_deliverables"("id"),
  "platform" text NOT NULL,
  "social_account_id" text REFERENCES "social_accounts"("id"),
  "status" text NOT NULL DEFAULT 'waiting_for_production',
  "created_source" text NOT NULL DEFAULT 'manual',
  "terminal_owner" text,
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "external_id" text,
  "permalink" text,
  "last_error_code" text,
  "last_error_message" text,
  "manual_reason" text,
  "version" integer NOT NULL DEFAULT 1,
  "updated_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "workflow_publication_deliverable_idx" ON "workflow_publications" ("deliverable_id");
CREATE INDEX "workflow_publication_status_idx" ON "workflow_publications" ("status");
CREATE INDEX "workflow_publication_schedule_idx" ON "workflow_publications" ("scheduled_at");
CREATE UNIQUE INDEX "workflow_publication_account_unique" ON "workflow_publications" ("deliverable_id", "platform", "social_account_id");
CREATE UNIQUE INDEX "workflow_publication_accountless_unique" ON "workflow_publications" ("deliverable_id", "platform") WHERE "social_account_id" IS NULL;

CREATE TABLE "workflow_templates" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone
);

CREATE INDEX "workflow_template_active_idx" ON "workflow_templates" ("active");

CREATE TABLE "workflow_template_items" (
  "id" text PRIMARY KEY,
  "template_id" text NOT NULL REFERENCES "workflow_templates"("id"),
  "name" text NOT NULL,
  "kind" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "due_offset_minutes" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "workflow_template_item_template_idx" ON "workflow_template_items" ("template_id", "sort_order");

CREATE TABLE "workflow_events" (
  "id" text PRIMARY KEY,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "actor_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "source" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "workflow_event_entity_idx" ON "workflow_events" ("entity_type", "entity_id", "created_at");

CREATE TABLE "workflow_notifications" (
  "id" text PRIMARY KEY,
  "recipient_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "claim_id" text,
  "claimed_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "workflow_notification_idempotency_unique" ON "workflow_notifications" ("idempotency_key");
CREATE INDEX "workflow_notification_delivery_idx" ON "workflow_notifications" ("status", "scheduled_at");
CREATE INDEX "workflow_notification_recipient_idx" ON "workflow_notifications" ("recipient_user_id", "read_at");

CREATE TABLE "workflow_import_batches" (
  "id" text PRIMARY KEY,
  "sheet_id" text NOT NULL,
  "sheet_gid" text,
  "initiator_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "mapping" jsonb NOT NULL,
  "counts" jsonb NOT NULL,
  "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "workflow_import_batch_status_idx" ON "workflow_import_batches" ("status", "created_at");

COMMIT;
