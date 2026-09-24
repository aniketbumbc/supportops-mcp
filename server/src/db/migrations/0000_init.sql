CREATE SCHEMA "mock";
--> statement-breakpoint
CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TYPE "mock"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "mock"."comment_author_type" AS ENUM('customer', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "mock"."customer_status" AS ENUM('active', 'suspended', 'churned');--> statement-breakpoint
CREATE TYPE "mock"."customer_tier" AS ENUM('standard', 'business', 'enterprise');--> statement-breakpoint
CREATE TYPE "mock"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "mock"."payment_method" AS ENUM('card', 'upi', 'netbanking', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "mock"."payment_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "mock"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "mock"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "mock"."ticket_category" AS ENUM('billing', 'technical', 'account', 'other');--> statement-breakpoint
CREATE TYPE "mock"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "mock"."ticket_status" AS ENUM('open', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "platform"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'executed');--> statement-breakpoint
CREATE TYPE "platform"."approval_type" AS ENUM('refund');--> statement-breakpoint
CREATE TYPE "platform"."audit_action_type" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "platform"."audit_outcome" AS ENUM('success', 'denied', 'error', 'rate_limited', 'pending_approval', 'cancelled');--> statement-breakpoint
CREATE SEQUENCE "mock"."refund_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "mock"."ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "platform"."approval_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "mock"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_ref" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"primary_email" text NOT NULL,
	"phone" text,
	"tier" "mock"."customer_tier" NOT NULL,
	"status" "mock"."customer_status" DEFAULT 'active' NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_ref_unique" UNIQUE("customer_ref")
);
--> statement-breakpoint
CREATE TABLE "mock"."invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid,
	"status" "mock"."invoice_status" NOT NULL,
	"description" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "mock"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_ref" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"method" "mock"."payment_method" NOT NULL,
	"status" "mock"."payment_status" NOT NULL,
	"failure_reason" text,
	"provider_ref" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_ref_unique" UNIQUE("payment_ref")
);
--> statement-breakpoint
CREATE TABLE "mock"."refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_ref" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"status" "mock"."refund_status" NOT NULL,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_refund_ref_unique" UNIQUE("refund_ref"),
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "mock"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"status" "mock"."subscription_status" NOT NULL,
	"billing_cycle" "mock"."billing_cycle" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_subscription_ref_unique" UNIQUE("subscription_ref")
);
--> statement-breakpoint
CREATE TABLE "mock"."ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_type" "mock"."comment_author_type" NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock"."tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" "mock"."ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "mock"."ticket_priority" DEFAULT 'normal' NOT NULL,
	"category" "mock"."ticket_category" NOT NULL,
	"assignee" text,
	"related_invoice_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "platform"."approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_ref" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"type" "platform"."approval_type" NOT NULL,
	"status" "platform"."approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"customer_ref" text NOT NULL,
	"invoice_number" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"payload" jsonb NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"idempotency_key" text,
	"executed_refund_ref" text,
	CONSTRAINT "approvals_approval_ref_unique" UNIQUE("approval_ref"),
	CONSTRAINT "approvals_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "platform"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"user_id" text NOT NULL,
	"roles" text[] NOT NULL,
	"tool_name" text NOT NULL,
	"action_type" "platform"."audit_action_type" NOT NULL,
	"arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" "platform"."audit_outcome" NOT NULL,
	"result_summary" jsonb,
	"error_code" text,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."role_policies" (
	"role" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"allowed_tools" text[] NOT NULL,
	"direct_refund_limit_minor" integer DEFAULT 0 NOT NULL,
	"approval_refund_limit_minor" integer DEFAULT 0 NOT NULL,
	"can_approve_refunds" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mock"."contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "mock"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "mock"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "mock"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "mock"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."refunds" ADD CONSTRAINT "refunds_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "mock"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."refunds" ADD CONSTRAINT "refunds_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "mock"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock"."tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "mock"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_customer_idx" ON "mock"."contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "mock"."customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "mock"."customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "mock"."invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "mock"."invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_issued_idx" ON "mock"."invoices" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "mock"."payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "mock"."payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "mock"."refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_invoice_idx" ON "mock"."refunds" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "mock"."subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "mock"."ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_customer_idx" ON "mock"."tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "mock"."tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "platform"."approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approvals_requested_by_idx" ON "platform"."approvals" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "audit_occurred_idx" ON "platform"."audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "platform"."audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_tool_idx" ON "platform"."audit_log" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "audit_correlation_idx" ON "platform"."audit_log" USING btree ("correlation_id");