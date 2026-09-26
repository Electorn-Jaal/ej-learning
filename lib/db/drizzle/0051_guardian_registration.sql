CREATE TABLE "core"."guardian_invites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."guardian_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."guardian_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."guardian_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"invite_id" bigint NOT NULL,
	"student_id" bigint NOT NULL,
	"username" varchar(50) NOT NULL,
	"display_name" varchar(300) NOT NULL,
	"relation_mn" varchar(40),
	"password_hash" text NOT NULL,
	"status" varchar(10) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" bigint,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"user_id" bigint,
	CONSTRAINT "guardian_requests_status_check" CHECK (status IN ('PENDING','APPROVED','REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "core"."guardian_invites" ADD CONSTRAINT "guardian_invites_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."guardian_invites" ADD CONSTRAINT "guardian_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."guardian_requests" ADD CONSTRAINT "guardian_requests_invite_id_guardian_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "core"."guardian_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."guardian_requests" ADD CONSTRAINT "guardian_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."guardian_requests" ADD CONSTRAINT "guardian_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."guardian_requests" ADD CONSTRAINT "guardian_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_invites_code_hash_key" ON "core"."guardian_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "idx_guardian_invites_student" ON "core"."guardian_invites" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_guardian_requests_status" ON "core"."guardian_requests" USING btree ("status");