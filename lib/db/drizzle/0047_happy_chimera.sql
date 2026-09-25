
CREATE TABLE "assessment"."diagnostic_item_targets" (
	"item_id" bigint NOT NULL,
	"map_id" bigint NOT NULL,
	CONSTRAINT "diagnostic_item_targets_item_id_map_id_pk" PRIMARY KEY("item_id","map_id")
);
--> statement-breakpoint

CREATE TABLE "assessment"."diagnostic_plan_reviews" (
	"attempt_id" bigint PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"evidence" jsonb NOT NULL,
	"entries" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "content"."diagnostic_resource_targets" (
	"resource_id" bigint NOT NULL,
	"map_id" bigint NOT NULL,
	CONSTRAINT "diagnostic_resource_targets_resource_id_map_id_pk" PRIMARY KEY("resource_id","map_id")
);
--> statement-breakpoint

CREATE TABLE "content"."diagnostic_resources" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."diagnostic_resources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" varchar(500) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"instructions" text NOT NULL,
	"source_material_id" bigint,
	"reference" varchar(500),
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "assessment"."diagnostic_item_targets" ADD CONSTRAINT "diagnostic_item_targets_item_id_diagnostic_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "assessment"."diagnostic_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "assessment"."diagnostic_item_targets" ADD CONSTRAINT "diagnostic_item_targets_map_id_content_skill_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "content"."content_skill_maps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "assessment"."diagnostic_plan_reviews" ADD CONSTRAINT "diagnostic_plan_reviews_attempt_id_diagnostic_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "assessment"."diagnostic_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "assessment"."diagnostic_plan_reviews" ADD CONSTRAINT "diagnostic_plan_reviews_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "content"."diagnostic_resource_targets" ADD CONSTRAINT "diagnostic_resource_targets_resource_id_diagnostic_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "content"."diagnostic_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "content"."diagnostic_resource_targets" ADD CONSTRAINT "diagnostic_resource_targets_map_id_content_skill_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "content"."content_skill_maps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "content"."diagnostic_resources" ADD CONSTRAINT "diagnostic_resources_source_material_id_source_materials_id_fk" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "content"."diagnostic_resources" ADD CONSTRAINT "diagnostic_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;