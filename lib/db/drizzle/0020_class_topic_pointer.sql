CREATE TABLE "learning"."class_topics" (
  "class_id" bigint NOT NULL,
  "subject_id" bigint NOT NULL,
  "source_outline_node_id" bigint NOT NULL,
  "effective_on" date DEFAULT CURRENT_DATE NOT NULL,
  "note" text,
  "set_by" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "class_topics_pkey" PRIMARY KEY("class_id","subject_id"),
  CONSTRAINT "class_topics_note_check" CHECK (note IS NULL OR char_length(note) <= 500)
);
--> statement-breakpoint
ALTER TABLE "learning"."class_topics"
  ADD CONSTRAINT "class_topics_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "learning"."class_topics"
  ADD CONSTRAINT "class_topics_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");
--> statement-breakpoint
ALTER TABLE "learning"."class_topics"
  ADD CONSTRAINT "class_topics_source_outline_node_id_fkey"
  FOREIGN KEY ("source_outline_node_id") REFERENCES "content"."source_outline_nodes"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "learning"."class_topics"
  ADD CONSTRAINT "class_topics_set_by_fkey"
  FOREIGN KEY ("set_by") REFERENCES "core"."users"("id");
--> statement-breakpoint
CREATE INDEX "idx_class_topics_node" ON "learning"."class_topics" USING btree ("source_outline_node_id" int8_ops);
