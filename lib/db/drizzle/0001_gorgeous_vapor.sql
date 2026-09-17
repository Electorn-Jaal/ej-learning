CREATE TYPE "core"."user_role" AS ENUM('STUDENT', 'TEACHER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "core"."teachers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.teachers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"teacher_code" varchar(100) NOT NULL,
	"subject_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "teachers_teacher_code_key" UNIQUE("teacher_code")
);
--> statement-breakpoint
CREATE TABLE "core"."user_roles" (
	"user_id" bigint NOT NULL,
	"role" "core"."user_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(300) NOT NULL,
	"student_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_student_id_key" UNIQUE("student_id")
);
--> statement-breakpoint
ALTER TABLE "core"."teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."teachers" ADD CONSTRAINT "teachers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_teachers_subject" ON "core"."teachers" USING btree ("subject_id" int8_ops);