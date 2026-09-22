CREATE TABLE "learning"."class_periods" (
  "school_year" varchar(20) NOT NULL,
  "period_no" smallint NOT NULL,
  "name_mn" varchar(50),
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  CONSTRAINT "class_periods_pkey" PRIMARY KEY("school_year","period_no"),
  CONSTRAINT "class_periods_period_no_check" CHECK (period_no BETWEEN 1 AND 12),
  CONSTRAINT "class_periods_range_check" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
ALTER TABLE "learning"."class_schedule" ADD COLUMN "period_no" smallint;
--> statement-breakpoint
ALTER TABLE "learning"."class_schedule"
  ADD CONSTRAINT "class_schedule_class_slot_key" UNIQUE("class_id","scheduled_on","period_no");
