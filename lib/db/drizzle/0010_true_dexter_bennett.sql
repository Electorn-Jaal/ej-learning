ALTER TABLE "core"."grade_levels" DROP CONSTRAINT "grade_levels_grade_number_check";--> statement-breakpoint
ALTER TABLE "core"."classes" ADD COLUMN "data_origin" varchar(10) DEFAULT 'REAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN "data_origin" varchar(10) DEFAULT 'REAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."teachers" ADD COLUMN "data_origin" varchar(10) DEFAULT 'REAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_data_origin_check" CHECK ((data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[]));--> statement-breakpoint
ALTER TABLE "core"."grade_levels" ADD CONSTRAINT "grade_levels_grade_number_check" CHECK ((grade_number >= 1) AND (grade_number <= 12));--> statement-breakpoint
ALTER TABLE "core"."students" ADD CONSTRAINT "students_data_origin_check" CHECK ((data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[]));--> statement-breakpoint
ALTER TABLE "core"."teachers" ADD CONSTRAINT "teachers_data_origin_check" CHECK ((data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[]));