-- Production schema baseline: STRUCTURE ONLY, no data.
-- Taken 2026-10-11 with pg_dump --schema-only from production (PostgreSQL 16.4),
-- when production had applied every migration up to and including:
--   BASELINE_LAST_MIGRATION=20261010120000_platform_console_hardening
--
-- Used ONLY by create-fresh-db.ts to build a brand-new database. Production never
-- reads this file. See README.md in this folder before regenerating it.

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: tiger; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger;


--
-- Name: tiger_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger_data;


--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: postgis_tiger_geocoder; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder WITH SCHEMA tiger;


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: AccessLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccessLevel" AS ENUM (
    'NONE',
    'TASKS_ONLY',
    'TASKS_ASSIGN',
    'FULL'
);


--
-- Name: AlertSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AlertSeverity" AS ENUM (
    'INFO',
    'WARNING',
    'ERROR',
    'CRITICAL'
);


--
-- Name: AlertStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AlertStatus" AS ENUM (
    'ACTIVE',
    'ACKNOWLEDGED',
    'RESOLVED',
    'DISMISSED'
);


--
-- Name: ApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'AUTO'
);


--
-- Name: AssetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'MAINTENANCE',
    'RETIRED'
);


--
-- Name: AttachmentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttachmentType" AS ENUM (
    'IMAGE',
    'DOCUMENT',
    'OTHER'
);


--
-- Name: BillBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillBy" AS ENUM (
    'HOUR',
    'DAY',
    'BOTH'
);


--
-- Name: BillingAlertKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingAlertKind" AS ENUM (
    'DROP',
    'SYNC_FAILED',
    'CONTRACT_DRIFT',
    'CONTRACT_EXPIRING'
);


--
-- Name: BillingInterval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingInterval" AS ENUM (
    'MONTHLY',
    'ANNUAL'
);


--
-- Name: BillingMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingMode" AS ENUM (
    'AUTOMATIC',
    'INVOICE',
    'EXTERNAL'
);


--
-- Name: BreakType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BreakType" AS ENUM (
    'LUNCH',
    'SHORT',
    'OTHER'
);


--
-- Name: CalendarCallDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarCallDirection" AS ENUM (
    'OUTGOING',
    'INCOMING'
);


--
-- Name: CalendarEventKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarEventKind" AS ENUM (
    'APPOINTMENT',
    'REMINDER'
);


--
-- Name: CalendarMeetingMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarMeetingMode" AS ENUM (
    'IN_PERSON',
    'ONLINE',
    'PHONE'
);


--
-- Name: CalendarPlaceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarPlaceKind" AS ENUM (
    'OFFICE',
    'CLIENT_SITE',
    'ADDRESS'
);


--
-- Name: CalendarRsvp; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarRsvp" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'MAYBE',
    'DECLINED'
);


--
-- Name: CalendarVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarVisibility" AS ENUM (
    'BUSY',
    'DETAILS'
);


--
-- Name: ConversationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ConversationType" AS ENUM (
    'DIRECT',
    'GROUP'
);


--
-- Name: CustomFieldType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CustomFieldType" AS ENUM (
    'TEXT',
    'NUMBER',
    'DATE',
    'DROPDOWN',
    'CHECKBOX',
    'URL',
    'EMAIL'
);


--
-- Name: CustomerActivityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CustomerActivityType" AS ENUM (
    'NOTE',
    'CALL',
    'EMAIL',
    'MEETING',
    'REMINDER',
    'STATUS',
    'SYSTEM'
);


--
-- Name: DependencyType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DependencyType" AS ENUM (
    'FINISH_TO_START',
    'START_TO_START',
    'FINISH_TO_FINISH',
    'START_TO_FINISH'
);


--
-- Name: DocumentCadence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentCadence" AS ENUM (
    'MONTHLY',
    'ANNUAL',
    'ONE_OFF'
);


--
-- Name: DocumentDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentDirection" AS ENUM (
    'ISSUED',
    'SUPPLIED',
    'BOTH'
);


--
-- Name: DocumentEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentEventType" AS ENUM (
    'ISSUED',
    'DELIVERED',
    'OPENED',
    'DOWNLOADED',
    'CONSENTED',
    'SIGNED',
    'SEALED',
    'ACKNOWLEDGED',
    'VERIFIED',
    'REVOKED',
    'SUPERSEDED',
    'SUBMITTED',
    'REJECTED',
    'SENT_BACK',
    'VISIBILITY_CHANGED'
);


--
-- Name: DocumentSignerRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentSignerRole" AS ENUM (
    'MEMBER',
    'RESPONSIBLE',
    'ORG_REPRESENTATIVE',
    'SITE_SUPERVISOR',
    'CUSTOMER'
);


--
-- Name: DocumentSignerStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentSignerStatus" AS ENUM (
    'PENDING',
    'SIGNED',
    'SKIPPED'
);


--
-- Name: DocumentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'AWAITING_SIGNATURE',
    'SIGNED',
    'EXPIRED',
    'SUPERSEDED',
    'REVOKED',
    'PENDING_VERIFICATION',
    'REJECTED'
);


--
-- Name: GeofenceExcursionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GeofenceExcursionStatus" AS ENUM (
    'OUT_UNREPORTED',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'RETURNED',
    'EXPIRED'
);


--
-- Name: HoursBasis; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HoursBasis" AS ENUM (
    'COUNTED',
    'CLOCKED',
    'SHIFT'
);


--
-- Name: InvitationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvitationStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EXPIRED',
    'REVOKED'
);


--
-- Name: InvoiceLineKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvoiceLineKind" AS ENUM (
    'HOURS',
    'DAYS',
    'HEADING'
);


--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'SENT',
    'PAID',
    'OVERDUE',
    'CANCELED',
    'REFUNDED'
);


--
-- Name: JoinPolicy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinPolicy" AS ENUM (
    'OPEN',
    'INVITE_ONLY',
    'CLOSED'
);


--
-- Name: JoinRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELED'
);


--
-- Name: MonitoringEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MonitoringEventType" AS ENUM (
    'USER_LOGIN',
    'USER_LOGOUT',
    'USER_LOGIN_FAILED',
    'USER_CREATED',
    'USER_UPDATED',
    'USER_DELETED',
    'TASK_CREATED',
    'TASK_ASSIGNED',
    'TASK_UNASSIGNED',
    'TASK_STATUS_CHANGED',
    'TASK_COMPLETED',
    'TASK_DELETED',
    'NOTIFICATION_SENT',
    'NOTIFICATION_FAILED',
    'CLOCK_IN',
    'CLOCK_OUT',
    'GEOFENCE_VIOLATION',
    'TECHNICIAN_OFFLINE',
    'TASK_OVERDUE',
    'API_ERROR',
    'SERVICE_DOWN',
    'SERVICE_UP'
);


--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'EMAIL',
    'PUSH',
    'SMS',
    'SOCKET'
);


--
-- Name: NotificationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationStatus" AS ENUM (
    'PENDING',
    'SENT',
    'DELIVERED',
    'FAILED',
    'BOUNCED'
);


--
-- Name: OvertimeApprovalMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OvertimeApprovalMethod" AS ENUM (
    'REMOTE',
    'SIGNATURE',
    'MANAGER'
);


--
-- Name: OvertimeRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OvertimeRequestStatus" AS ENUM (
    'PENDING_TECHNICIAN',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'EXPIRED_NO_RESPONSE',
    'EXPIRED_NO_APPROVAL',
    'COMPLETED',
    'CANCELED'
);


--
-- Name: PlanTier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PlanTier" AS ENUM (
    'STARTER',
    'PROFESSIONAL',
    'BUSINESS',
    'ENTERPRISE'
);


--
-- Name: Platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Platform" AS ENUM (
    'WEB',
    'MOBILE',
    'BOTH'
);


--
-- Name: RateKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RateKind" AS ENUM (
    'BILL_HOUR',
    'COST_HOUR',
    'BILL_DAY',
    'COST_DAY'
);


--
-- Name: RateTarget; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RateTarget" AS ENUM (
    'ORGANIZATION',
    'SPACE',
    'MEMBER',
    'ASSIGNMENT',
    'ROLE'
);


--
-- Name: RecurrenceFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RecurrenceFrequency" AS ENUM (
    'DAILY',
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'YEARLY',
    'CUSTOM'
);


--
-- Name: ReportAttachmentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReportAttachmentType" AS ENUM (
    'BEFORE',
    'AFTER'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'EMPLOYEE',
    'CUSTOMER'
);


--
-- Name: RoleKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RoleKind" AS ENUM (
    'WORK',
    'MANAGEMENT'
);


--
-- Name: RoleScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RoleScope" AS ENUM (
    'ORG',
    'SPACE',
    'BOTH'
);


--
-- Name: ShareRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShareRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: ShareRequestType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShareRequestType" AS ENUM (
    'TASK',
    'WORKER'
);


--
-- Name: ShiftIssueEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShiftIssueEventType" AS ENUM (
    'CREATED',
    'MESSAGE',
    'ACKNOWLEDGED',
    'ASSIGNED',
    'STATUS_CHANGED',
    'RESOLVED',
    'REOPENED',
    'CLOSED'
);


--
-- Name: ShiftIssueSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShiftIssueSeverity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: ShiftIssueStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShiftIssueStatus" AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
    'CANCELED'
);


--
-- Name: ShiftRecurrence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShiftRecurrence" AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'ONE_OFF'
);


--
-- Name: ShiftReminderState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ShiftReminderState" AS ENUM (
    'NONE',
    'REMINDED',
    'OVERTIME_PENDING',
    'OVERTIME_APPROVED',
    'ESCALATED',
    'RESOLVED'
);


--
-- Name: SignatureMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignatureMode" AS ENUM (
    'NONE',
    'ACKNOWLEDGE',
    'IN_APP',
    'WET_INK'
);


--
-- Name: SpaceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpaceKind" AS ENUM (
    'PROJECT',
    'COMPANY',
    'CUSTOMER'
);


--
-- Name: SpaceShareLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpaceShareLevel" AS ENUM (
    'VIEW',
    'CONTRIBUTE',
    'CONTROL'
);


--
-- Name: SpaceShareStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpaceShareStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'REVOKED',
    'DECLINED'
);


--
-- Name: SprintStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SprintStatus" AS ENUM (
    'PLANNING',
    'ACTIVE',
    'COMPLETED'
);


--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'INCOMPLETE'
);


--
-- Name: SupportAuthorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportAuthorType" AS ENUM (
    'CUSTOMER',
    'AGENT',
    'SYSTEM'
);


--
-- Name: SupportCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportCategory" AS ENUM (
    'BILLING',
    'TECHNICAL',
    'HOWTO',
    'FEEDBACK',
    'OTHER'
);


--
-- Name: SupportChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportChannel" AS ENUM (
    'WEB',
    'MOBILE',
    'EMAIL',
    'LIVE_CHAT'
);


--
-- Name: SupportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportStatus" AS ENUM (
    'OPEN',
    'PENDING_AGENT',
    'PENDING_CUSTOMER',
    'RESOLVED',
    'CLOSED'
);


--
-- Name: SupportTeamRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportTeamRole" AS ENUM (
    'MANAGER',
    'AGENT'
);


--
-- Name: TaskAssigneeRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskAssigneeRole" AS ENUM (
    'LEAD',
    'MEMBER'
);


--
-- Name: TaskCreationScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskCreationScope" AS ENUM (
    'NONE',
    'SELF',
    'SPACE',
    'ORG'
);


--
-- Name: TaskEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskEventType" AS ENUM (
    'CREATED',
    'UPDATED',
    'ASSIGNED',
    'UNASSIGNED',
    'STATUS_CHANGED',
    'COMMENT_ADDED',
    'ATTACHMENT_ADDED',
    'ATTACHMENT_REMOVED',
    'ASSIGNEE_ADDED',
    'ASSIGNEE_REMOVED',
    'CHECKLIST_ITEM_ADDED',
    'CHECKLIST_ITEM_TOGGLED',
    'CHECKLIST_ITEM_REMOVED',
    'PAUSED',
    'RESUMED',
    'HANDOVER_ADDED',
    'CREW_JOINED',
    'CREW_LEFT',
    'SELF_BLOCKED',
    'SELF_RESUMED',
    'LEAD_CHANGED',
    'CHECKLIST_ITEM_ASSIGNED',
    'OPENED_TO_ROLE',
    'OFFERED',
    'TAKEN',
    'RETURNED_TO_ROLE'
);


--
-- Name: TaskPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'DRAFT',
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'BLOCKED',
    'COMPLETED',
    'CANCELED',
    'CLOSED',
    'ACCEPTED',
    'EN_ROUTE',
    'ARRIVED'
);


--
-- Name: TimeEntryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimeEntryStatus" AS ENUM (
    'CLOCKED_IN',
    'CLOCKED_OUT',
    'AUTO_OUT'
);


--
-- Name: TimeOffStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimeOffStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELED'
);


--
-- Name: TimeOffType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimeOffType" AS ENUM (
    'VACATION',
    'SICK',
    'FAMILY',
    'OTHER'
);


--
-- Name: WorkModel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkModel" AS ENUM (
    'NONE',
    'SHIFT',
    'FIXED',
    'TASK'
);


--
-- Name: platform_audit_logs_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_audit_logs_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only';
END;
$$;


--
-- Name: sync_record_tombstone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_record_tombstone() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  r jsonb := to_jsonb(OLD);
BEGIN
  INSERT INTO "sync_tombstones" ("entity", "entityId", "organizationId", "parentId", "userId")
  VALUES (
    TG_TABLE_NAME,
    r->>'id',
    r->>'organizationId',
    COALESCE(r->>'taskId', r->>'timeEntryId', r->>'reportId', r->>'noteId', r->>'conversationId', r->>'issueId'),
    r->>'userId'
  );
  RETURN OLD;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _attendance_minutes_fix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._attendance_minutes_fix (
    id text,
    old_total integer,
    "breakMinutes" integer
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id text NOT NULL,
    "eventType" text NOT NULL,
    "userId" text,
    "targetUserId" text,
    "resourceType" text,
    "resourceId" text,
    metadata jsonb,
    "ipAddress" text,
    "userAgent" text,
    "organizationId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id text NOT NULL,
    type text NOT NULL,
    severity public."AlertSeverity" DEFAULT 'WARNING'::public."AlertSeverity" NOT NULL,
    status public."AlertStatus" DEFAULT 'ACTIVE'::public."AlertStatus" NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    "userId" text,
    "taskId" text,
    "acknowledgedAt" timestamp(3) without time zone,
    "acknowledgedById" text,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedById" text,
    "organizationId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: asset_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_activities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetId" text NOT NULL,
    type text DEFAULT 'NOTE'::text NOT NULL,
    body text,
    "authorId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_categories (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text,
    config jsonb
);


--
-- Name: asset_custody; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_custody (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetId" text NOT NULL,
    "userId" text,
    "customerId" text,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "endedAt" timestamp(3) without time zone,
    reason text,
    "openedById" text,
    "closedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asset_holders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_holders (
    id text NOT NULL,
    "assetId" text NOT NULL,
    "userId" text,
    "customerId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT asset_holders_one_holder CHECK ((("userId" IS NOT NULL) <> ("customerId" IS NOT NULL)))
);


--
-- Name: asset_list_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_list_rows (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetId" text,
    list text NOT NULL,
    "values" jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "categoryId" text,
    CONSTRAINT asset_list_rows_one_owner CHECK ((("assetId" IS NOT NULL) <> ("categoryId" IS NOT NULL)))
);


--
-- Name: asset_log_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_log_reminders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetId" text NOT NULL,
    "logType" text NOT NULL,
    "windowKey" text NOT NULL,
    stage text NOT NULL,
    "sentAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asset_money; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_money (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetId" text NOT NULL,
    category text NOT NULL,
    direction text NOT NULL,
    "amountCents" integer NOT NULL,
    note text,
    "occurredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "authorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "receiptKey" text,
    "receiptName" text,
    "receiptMime" text,
    status text DEFAULT 'RECORDED'::text NOT NULL,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    "reviewNote" text,
    "logType" text,
    "values" jsonb,
    readings jsonb
);


--
-- Name: asset_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_proposals (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "raisedById" text NOT NULL,
    "holderUserId" text,
    "categoryId" text,
    fields jsonb NOT NULL,
    "documentKind" text DEFAULT 'asset-contract'::text NOT NULL,
    signals jsonb,
    "fileKey" text,
    "fileName" text,
    "fileMime" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    "reviewNote" text,
    "createdAssetId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asset_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_types (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "categoryId" text NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id text NOT NULL,
    name text NOT NULL,
    "serialNumber" text,
    model text,
    manufacturer text,
    status public."AssetStatus" DEFAULT 'ACTIVE'::public."AssetStatus" NOT NULL,
    "installDate" timestamp(3) without time zone,
    "warrantyExpiry" timestamp(3) without time zone,
    "locationAddress" text,
    "locationLat" double precision,
    "locationLng" double precision,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    "categoryId" text,
    "typeId" text,
    "holderUserId" text,
    "customerId" text,
    details jsonb,
    "logState" jsonb,
    "logRemindAt" timestamp(3) without time zone
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id text NOT NULL,
    "fileName" text NOT NULL,
    "fileUrl" text NOT NULL,
    "fileType" public."AttachmentType" NOT NULL,
    "fileSize" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "taskId" text NOT NULL,
    "uploadedById" text NOT NULL,
    "fileKey" text,
    "mimeType" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: billing_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_alerts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "fromCents" integer,
    "toCents" integer,
    "dropCents" integer,
    "acknowledgedAt" timestamp(3) without time zone,
    "acknowledgedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kind public."BillingAlertKind" DEFAULT 'DROP'::public."BillingAlertKind" NOT NULL,
    detail text,
    occurrences integer DEFAULT 1 NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_events (
    id text NOT NULL,
    "organizationId" text,
    "stripeEventId" text NOT NULL,
    type text NOT NULL,
    payload jsonb,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: blog_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_images (
    id text NOT NULL,
    mime text NOT NULL,
    "fileName" text,
    data bytea NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    content text NOT NULL,
    "coverUrl" text,
    author text DEFAULT 'HBCField Team'::text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    status text DEFAULT 'PUBLISHED'::text NOT NULL,
    "publishedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: break_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.break_rules (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text,
    "shiftId" text,
    name text NOT NULL,
    trigger text DEFAULT 'LOCAL_WINDOW'::text NOT NULL,
    "afterMinutes" integer,
    "earliestLocal" text,
    "latestLocal" text,
    "durationMinutes" integer DEFAULT 30 NOT NULL,
    "isPaid" boolean DEFAULT false NOT NULL,
    "isRequired" boolean DEFAULT true NOT NULL,
    remind boolean DEFAULT true NOT NULL,
    "snoozeMin" integer DEFAULT 15 NOT NULL,
    "maxSnoozes" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: breaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.breaks (
    id text NOT NULL,
    "timeEntryId" text NOT NULL,
    type public."BreakType" DEFAULT 'SHORT'::public."BreakType" NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "durationMinutes" integer,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "addedById" text,
    reason text,
    "ruleId" text,
    "isPaid" boolean DEFAULT false NOT NULL
);


--
-- Name: calendar_attendees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_attendees (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    "isOrganizer" boolean DEFAULT false NOT NULL,
    response public."CalendarRsvp" DEFAULT 'PENDING'::public."CalendarRsvp" NOT NULL,
    "respondedAt" timestamp(3) without time zone,
    "nextRemindAt" timestamp(3) without time zone,
    "remindOccurrence" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text,
    "createdById" text NOT NULL,
    kind public."CalendarEventKind" DEFAULT 'APPOINTMENT'::public."CalendarEventKind" NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    "meetingUrl" text,
    "customerId" text,
    "startAt" timestamp(3) without time zone NOT NULL,
    "endAt" timestamp(3) without time zone NOT NULL,
    "allDay" boolean DEFAULT false NOT NULL,
    timezone text NOT NULL,
    repeat jsonb,
    "seriesEndAt" timestamp(3) without time zone,
    "reminderOffsets" integer[] DEFAULT ARRAY[10],
    visibility public."CalendarVisibility" DEFAULT 'BUSY'::public."CalendarVisibility" NOT NULL,
    "canceledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "meetingMode" public."CalendarMeetingMode",
    "placeKind" public."CalendarPlaceKind",
    "placeSpaceId" text,
    room text,
    phone text,
    "callDirection" public."CalendarCallDirection"
);


--
-- Name: calendar_feed_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_feed_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone
);


--
-- Name: calendar_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_holidays (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text,
    "libraryKey" text,
    date date NOT NULL,
    days integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    "halfDay" boolean DEFAULT false NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    confirmed boolean DEFAULT false NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_items (
    id text NOT NULL,
    "taskId" text NOT NULL,
    text text NOT NULL,
    "isCompleted" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "assigneeId" text,
    "completedById" text,
    "completedAt" timestamp(3) without time zone
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id text NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "taskId" text NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: company_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_locations (
    id text NOT NULL,
    name text NOT NULL,
    address text,
    lat double precision,
    lng double precision,
    "geofenceRadius" integer DEFAULT 50 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    "enabledModules" jsonb,
    "workflowId" text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isRemote" boolean DEFAULT false NOT NULL,
    "workModel" public."WorkModel" DEFAULT 'NONE'::public."WorkModel" NOT NULL,
    "notifyRoleIds" text[] DEFAULT ARRAY[]::text[],
    "contactRoleIds" text[] DEFAULT ARRAY[]::text[],
    kind public."SpaceKind" DEFAULT 'COMPANY'::public."SpaceKind" NOT NULL,
    "contactName" text,
    "contactEmail" text,
    "contactPhone" text,
    "sourceCustomerId" text,
    "billableRateCents" integer,
    "approveRoleIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "geofencePolicy" text DEFAULT 'STRICT'::text NOT NULL,
    "geofencePolygon" jsonb,
    "minCover" integer DEFAULT 0 NOT NULL,
    "costRateCents" integer,
    "noShiftPolicy" text DEFAULT 'ALLOW'::text NOT NULL,
    "noShiftDailyMinutes" integer DEFAULT 480 NOT NULL,
    currency text,
    "workRoleIds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "roleOfferWidenMin" integer,
    "roleOfferAlertMin" integer,
    "weekendDays" integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    "holidayCountry" text,
    "holidayRegion" text,
    "detectedHolidayCountry" text,
    "detectedHolidayRegion" text,
    "holidayDetectedAt" timestamp(3) without time zone,
    "legalEntityId" text
);


--
-- Name: conversation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_members (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    "userId" text NOT NULL,
    "lastReadAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    type public."ConversationType" DEFAULT 'DIRECT'::public."ConversationType" NOT NULL,
    title text,
    "dmKey" text,
    "createdById" text NOT NULL,
    "lastMessageAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "originSpaceId" text
);


--
-- Name: cron_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_locks (
    name text NOT NULL,
    "lockedUntil" timestamp(3) without time zone NOT NULL,
    "lockedBy" text NOT NULL,
    "lastRunAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: custom_field_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_definitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    type public."CustomFieldType" NOT NULL,
    options jsonb,
    "isRequired" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "workflowId" text
);


--
-- Name: custom_field_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_values (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    "taskId" text NOT NULL,
    value text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: customer_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_activities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "customerId" text NOT NULL,
    type public."CustomerActivityType" DEFAULT 'NOTE'::public."CustomerActivityType" NOT NULL,
    body text,
    "authorId" text,
    "dueAt" timestamp(3) without time zone,
    "doneAt" timestamp(3) without time zone,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "notifiedAt" timestamp(3) without time zone,
    "reminderKind" text,
    "remindBeforeMin" integer DEFAULT 0,
    "notifyAt" timestamp(3) without time zone,
    "reminderAssigneeId" text,
    repeat text DEFAULT 'NONE'::text
);


--
-- Name: customer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contacts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "companyId" text NOT NULL,
    "personId" text NOT NULL,
    role text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: customer_sign_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_sign_links (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "customerId" text,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "lastSentAt" timestamp(3) without time zone,
    "sentCount" integer DEFAULT 0 NOT NULL,
    "firstOpenedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    email text NOT NULL
);


--
-- Name: customer_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_units (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "customerId" text,
    name text NOT NULL,
    label text,
    address text,
    lat double precision,
    lng double precision,
    "spaceId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "portalId" text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "contactName" text,
    "contactPhone" text,
    "residentUserId" text,
    details jsonb
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "contactName" text,
    email text,
    phone text,
    address text,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isPortalResident" boolean DEFAULT false NOT NULL,
    "portalId" text,
    "spaceId" text,
    "ownerId" text,
    status text DEFAULT 'LEAD'::text NOT NULL,
    type text DEFAULT 'PERSON'::text NOT NULL,
    "legalName" text,
    website text,
    industry text,
    "vatId" text,
    "regNumber" text,
    details jsonb,
    "managerIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "isContact" boolean DEFAULT false NOT NULL,
    locale text,
    currency text,
    "legalEntityId" text,
    "phoneKey" text,
    "emailKey" text
);


--
-- Name: daily_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_metrics (
    id text NOT NULL,
    date date NOT NULL,
    "organizationId" text NOT NULL,
    "tasksCreated" integer DEFAULT 0 NOT NULL,
    "tasksCompleted" integer DEFAULT 0 NOT NULL,
    "tasksCanceled" integer DEFAULT 0 NOT NULL,
    "tasksOverdue" integer DEFAULT 0 NOT NULL,
    "avgCompletionTime" double precision,
    "activeUsers" integer DEFAULT 0 NOT NULL,
    "loginCount" integer DEFAULT 0 NOT NULL,
    "failedLoginCount" integer DEFAULT 0 NOT NULL,
    "clockInCount" integer DEFAULT 0 NOT NULL,
    "avgWorkHours" double precision,
    "geofenceViolations" integer DEFAULT 0 NOT NULL,
    "emailsSent" integer DEFAULT 0 NOT NULL,
    "emailsFailed" integer DEFAULT 0 NOT NULL,
    "pushSent" integer DEFAULT 0 NOT NULL,
    "pushFailed" integer DEFAULT 0 NOT NULL,
    "alertsRaised" integer DEFAULT 0 NOT NULL,
    "alertsResolved" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: definition_of_done; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.definition_of_done (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workflowId" text,
    items jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: device_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_keys (
    id text NOT NULL,
    "userId" text NOT NULL,
    "deviceId" text NOT NULL,
    "publicKey" text NOT NULL,
    label text NOT NULL,
    platform text NOT NULL,
    "secureHardware" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone
);


--
-- Name: document_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_events (
    id text NOT NULL,
    "documentId" text NOT NULL,
    type public."DocumentEventType" NOT NULL,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actorId" text,
    ip text,
    "userAgent" text,
    "appVersion" text,
    lat double precision,
    lng double precision,
    meta jsonb
);


--
-- Name: document_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_signatures (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "userId" text,
    "signatureKey" text NOT NULL,
    "signatureSha256" text NOT NULL,
    "consentText" text NOT NULL,
    "consentAt" timestamp(3) without time zone NOT NULL,
    "signedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "hashBefore" text NOT NULL,
    "hashAfter" text NOT NULL,
    "sealedAt" timestamp(3) without time zone,
    "idempotencyKey" text NOT NULL,
    "signerId" text,
    "customerId" text,
    "signerName" text,
    "signerRole" text,
    "batchId" text,
    CONSTRAINT document_signatures_signer_present CHECK ((("userId" IS NOT NULL) OR ("customerId" IS NOT NULL)))
);


--
-- Name: document_signers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_signers (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "order" integer NOT NULL,
    role public."DocumentSignerRole" NOT NULL,
    "userId" text,
    "customerId" text,
    email text,
    status public."DocumentSignerStatus" DEFAULT 'PENDING'::public."DocumentSignerStatus" NOT NULL,
    "notifiedAt" timestamp(3) without time zone,
    "signedAt" timestamp(3) without time zone,
    "tokenHash" text,
    "tokenExpiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "openedAt" timestamp(3) without time zone,
    "contactName" text,
    "eligibleUserIds" text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "typeId" text NOT NULL,
    name text NOT NULL,
    body text NOT NULL,
    "appliesToRoleId" text,
    "appliesToPosition" text,
    "signatureMode" public."SignatureMode" DEFAULT 'IN_APP'::public."SignatureMode" NOT NULL,
    "offerValidDays" integer DEFAULT 14,
    version integer DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_types (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    cadence public."DocumentCadence" DEFAULT 'ONE_OFF'::public."DocumentCadence" NOT NULL,
    direction public."DocumentDirection" DEFAULT 'ISSUED'::public."DocumentDirection" NOT NULL,
    "retentionMonths" integer,
    "signatureMode" public."SignatureMode" DEFAULT 'NONE'::public."SignatureMode" NOT NULL,
    "isCredential" boolean DEFAULT false NOT NULL,
    "hasExpiry" boolean DEFAULT false NOT NULL,
    "requiredForWorkflowIds" text[] DEFAULT ARRAY[]::text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "requiredFromAll" boolean DEFAULT false NOT NULL,
    "requiredFromRoleIds" text[] DEFAULT ARRAY[]::text[],
    "twoSided" boolean DEFAULT false NOT NULL,
    "scanShape" text DEFAULT 'CARD'::text NOT NULL,
    "signerRoute" jsonb,
    "visibleToRoleIds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "multiPage" boolean DEFAULT false NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "typeId" text NOT NULL,
    "templateId" text,
    title text NOT NULL,
    "periodYear" integer,
    "periodMonth" integer,
    "storageKey" text NOT NULL,
    sha256 text NOT NULL,
    "sizeBytes" integer NOT NULL,
    "mimeType" text DEFAULT 'application/pdf'::text NOT NULL,
    status public."DocumentStatus" DEFAULT 'ISSUED'::public."DocumentStatus" NOT NULL,
    "issuedById" text,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deliveredAt" timestamp(3) without time zone,
    "firstOpenedAt" timestamp(3) without time zone,
    "expiresOn" date,
    "verifiedAt" timestamp(3) without time zone,
    "verifiedById" text,
    "retentionUntil" timestamp(3) without time zone,
    "supersedesId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "rejectionReason" text,
    "scanFormat" text,
    "scanVerdict" text,
    "scanData" jsonb,
    "scanChecks" jsonb,
    "holderName" text,
    "documentNumber" text,
    "dateOfBirth" date,
    "issuingState" text,
    "originalKey" text,
    "originalSha256" text,
    "hiddenFromMember" boolean DEFAULT false NOT NULL,
    "rolesOverridden" boolean DEFAULT false NOT NULL,
    "visibleToRoleIds" text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: epics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epics (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#8b5cf6'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "organizationId" text NOT NULL,
    "startDate" timestamp(3) without time zone,
    "targetDate" timestamp(3) without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "spaceId" text
);


--
-- Name: geofence_excursions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geofence_excursions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "timeEntryId" text NOT NULL,
    "userId" text NOT NULL,
    "spaceId" text NOT NULL,
    status public."GeofenceExcursionStatus" DEFAULT 'OUT_UNREPORTED'::public."GeofenceExcursionStatus" NOT NULL,
    reason text,
    "requestedMinutes" integer,
    "grantedMinutes" integer,
    "leftRingAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reportedAt" timestamp(3) without time zone,
    "decidedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    "resolvedAt" timestamp(3) without time zone,
    "approvedById" text,
    "timerExpired" boolean DEFAULT false NOT NULL,
    "lastDistanceM" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: health_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.health_metrics (
    id text NOT NULL,
    "serviceName" text NOT NULL,
    "metricType" text NOT NULL,
    value double precision NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata jsonb
);


--
-- Name: intake_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intake_categories (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    icon text,
    color text,
    urgent boolean DEFAULT false NOT NULL,
    team text,
    "defaultPriority" text,
    issues text[] DEFAULT ARRAY[]::text[],
    "position" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "spaceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "portalId" text
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id text NOT NULL,
    "codeHash" text NOT NULL,
    "targetRole" public."Role" NOT NULL,
    "organizationId" text NOT NULL,
    specialty text,
    "maxDailyJobs" integer,
    status public."InvitationStatus" DEFAULT 'PENDING'::public."InvitationStatus" NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "acceptedById" text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    code text,
    "position" text,
    "enabledModules" jsonb,
    "scheduleType" text,
    schedule jsonb,
    "monthlyHourBudget" integer,
    "spaceId" text,
    "customerId" text,
    "unitId" text,
    "portalId" text,
    "accessProfile" jsonb,
    "memberRoleId" text,
    "assetId" text,
    "isExternal" boolean DEFAULT false NOT NULL
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    description text NOT NULL,
    quantity double precision DEFAULT 1 NOT NULL,
    "unitPrice" double precision DEFAULT 0 NOT NULL,
    amount double precision DEFAULT 0 NOT NULL,
    "taskId" text,
    "reportId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "billRateCents" integer,
    "costRateCents" integer,
    "billedHours" double precision,
    "billedDays" double precision,
    "lineKind" public."InvoiceLineKind",
    "workerId" text,
    "dayFrom" date,
    "dayTo" date,
    "taskIds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "hoursBasis" public."HoursBasis"
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "invoiceNumber" text NOT NULL,
    status public."InvoiceStatus" DEFAULT 'DRAFT'::public."InvoiceStatus" NOT NULL,
    "clientName" text NOT NULL,
    "clientEmail" text,
    "clientAddress" text,
    subtotal double precision DEFAULT 0 NOT NULL,
    "taxRate" double precision,
    "taxAmount" double precision DEFAULT 0 NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    total double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "issueDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueDate" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    notes text,
    "organizationId" text NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "spaceId" text,
    "servicePeriodFrom" timestamp(3) without time zone,
    "servicePeriodTo" timestamp(3) without time zone,
    "exchangeRate" double precision,
    "exchangeRateSource" text,
    "exchangeRateDate" date,
    "baseCurrency" text,
    "showLineTags" boolean DEFAULT true NOT NULL,
    "legalEntityId" text,
    issuer jsonb
);


--
-- Name: join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.join_requests (
    id text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    message text,
    status public."JoinRequestStatus" DEFAULT 'PENDING'::public."JoinRequestStatus" NOT NULL,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    "rejectionReason" text,
    "assignedRole" public."Role",
    "assignedPlatform" public."Platform",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: legal_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_entities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "legalName" text NOT NULL,
    label text,
    "addressLine1" text,
    "addressLine2" text,
    "postalCode" text,
    city text,
    state text,
    country text,
    "vatId" text,
    "taxId" text,
    "registerNumber" text,
    email text,
    phone text,
    website text,
    "logoUrl" text,
    currency text,
    "invoicePrefix" text DEFAULT 'INV'::text NOT NULL,
    "isMain" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: legal_entity_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_entity_bank_accounts (
    id text NOT NULL,
    "legalEntityId" text NOT NULL,
    "organizationId" text NOT NULL,
    label text,
    holder text,
    "bankName" text,
    iban text,
    bic text,
    "accountNumber" text,
    "routingNumber" text,
    currency text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: location_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_history (
    id text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    accuracy double precision,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text NOT NULL,
    "taskId" text
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    "senderId" text NOT NULL,
    body text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "editedAt" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp(3) without time zone
);


--
-- Name: module_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_prices (
    id text NOT NULL,
    "configId" text NOT NULL,
    "moduleKey" text NOT NULL,
    "monthlyCents" integer NOT NULL,
    "annualCents" integer NOT NULL,
    "billingScope" text DEFAULT 'per_org'::text NOT NULL,
    "stripePriceId" text
);


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_deliveries (
    id text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    status public."NotificationStatus" DEFAULT 'PENDING'::public."NotificationStatus" NOT NULL,
    "recipientId" text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb,
    "sentAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "failureReason" text,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "organizationId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "readAt" timestamp(3) without time zone
);


--
-- Name: notification_watches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_watches (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "subjectUserId" text NOT NULL,
    "watcherUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: organization_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_access (
    id text NOT NULL,
    "grantorOrgId" text NOT NULL,
    "granteeOrgId" text NOT NULL,
    "accessLevel" public."AccessLevel" DEFAULT 'NONE'::public."AccessLevel" NOT NULL,
    "canViewTasks" boolean DEFAULT false NOT NULL,
    "canAssignWorkers" boolean DEFAULT false NOT NULL,
    "canViewWorkers" boolean DEFAULT false NOT NULL,
    "canViewTracking" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "joinCodeHash" text,
    "joinPolicy" public."JoinPolicy" DEFAULT 'INVITE_ONLY'::public."JoinPolicy" NOT NULL,
    "profileBadges" jsonb,
    industry text,
    address text,
    phone text,
    email text,
    website text,
    timezone text DEFAULT 'Europe/Vienna'::text,
    "logoUrl" text,
    "notificationPrefs" jsonb,
    "securitySettings" jsonb,
    "joinCode" text,
    "enabledModules" jsonb,
    "addressLine1" text,
    "addressLine2" text,
    city text,
    country text,
    "postalCode" text,
    state text,
    "billingEmail" text,
    "billingInterval" public."BillingInterval" DEFAULT 'MONTHLY'::public."BillingInterval" NOT NULL,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "currentPeriodEnd" timestamp(3) without time zone,
    "planTier" public."PlanTier",
    "stripeCustomerId" text,
    "subStatus" public."SubscriptionStatus" DEFAULT 'TRIALING'::public."SubscriptionStatus" NOT NULL,
    "trialEndsAt" timestamp(3) without time zone,
    "vatId" text,
    "customerPortalEnabled" boolean DEFAULT false NOT NULL,
    "customerPortalConfig" jsonb,
    "usesExternalWorkers" boolean DEFAULT false NOT NULL,
    "billableRateCents" integer,
    "suspendedAt" timestamp(3) without time zone,
    "supportTeamId" text,
    "addOns" text[] DEFAULT '{}'::text[] NOT NULL,
    "billedExternally" boolean DEFAULT false NOT NULL,
    "defaultLeaveAllowance" integer DEFAULT 25 NOT NULL,
    "ownerId" text,
    "billingMode" public."BillingMode" DEFAULT 'AUTOMATIC'::public."BillingMode" NOT NULL,
    "invoiceDueDays" integer DEFAULT 14 NOT NULL,
    "agreedMonthlyCents" integer,
    "agreedListCents" integer,
    "agreedUntil" timestamp(3) without time zone,
    "agreedNote" text,
    "agreedSetAt" timestamp(3) without time zone,
    "agreedSetById" text,
    "costRateCents" integer,
    "offlineMode" boolean DEFAULT true NOT NULL,
    "crewMode" boolean DEFAULT false NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    "weekendDays" integer[] DEFAULT ARRAY[0, 6] NOT NULL,
    "holidayCountry" text,
    "holidayRegion" text,
    "calendarFeedsEnabled" boolean DEFAULT true NOT NULL
);


--
-- Name: overtime_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.overtime_requests (
    id text NOT NULL,
    "technicianId" text NOT NULL,
    "timeEntryId" text NOT NULL,
    "locationId" text NOT NULL,
    status public."OvertimeRequestStatus" DEFAULT 'PENDING_TECHNICIAN'::public."OvertimeRequestStatus" NOT NULL,
    "technicianRespondedAt" timestamp(3) without time zone,
    "technicianReason" text,
    "approvalMethod" public."OvertimeApprovalMethod",
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectedAt" timestamp(3) without time zone,
    "rejectionReason" text,
    "approverNotes" text,
    "leaderName" text,
    "leaderSignature" text,
    "maxDurationMinutes" integer,
    "overtimeStartAt" timestamp(3) without time zone,
    "overtimeEndAt" timestamp(3) without time zone,
    "actualEndAt" timestamp(3) without time zone,
    "overtimeMinutes" integer,
    "technicianTimeoutAt" timestamp(3) without time zone,
    "approvalTimeoutAt" timestamp(3) without time zone,
    "organizationId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    cycle integer DEFAULT 1 NOT NULL,
    "signedById" text,
    "signedAt" timestamp(3) without time zone
);


--
-- Name: parts_used; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parts_used (
    id text NOT NULL,
    "reportId" text NOT NULL,
    name text NOT NULL,
    "partNumber" text,
    quantity integer DEFAULT 1 NOT NULL,
    "unitCost" double precision,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phases (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    type text DEFAULT 'phase'::text NOT NULL,
    "organizationId" text NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "spaceId" text
);


--
-- Name: platform_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_logs (
    id text NOT NULL,
    "actorType" text NOT NULL,
    "actorId" text,
    "actorLabel" text,
    "actorRole" text,
    "ipAddress" text,
    "userAgent" text,
    method text NOT NULL,
    route text NOT NULL,
    action text NOT NULL,
    "targetOrganizationId" text,
    summary jsonb,
    ok boolean NOT NULL,
    "statusCode" integer,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: platform_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    role text DEFAULT 'SUPPORT'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "twoFactorSecret" text,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "failedLoginAttempts" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp(3) without time zone,
    "lastLoginAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "twoFactorLastStep" integer,
    "tokensValidAfter" timestamp(3) without time zone,
    "twoFactorPendingSecret" text
);


--
-- Name: portals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portals (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "templateKey" text NOT NULL,
    "entityLabel" text NOT NULL,
    "contactLabel" text,
    accent text,
    features jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "coverImageUrl" text,
    "spaceId" text
);


--
-- Name: pricing_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_configs (
    id text NOT NULL,
    version integer NOT NULL,
    currency text DEFAULT 'eur'::text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    note text,
    "createdBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: rate_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_history (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    target public."RateTarget" NOT NULL,
    "targetId" text NOT NULL,
    "spaceId" text,
    kind public."RateKind" NOT NULL,
    cents integer,
    "effectiveFrom" date NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: recurring_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_task_templates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    title text NOT NULL,
    description text,
    priority public."TaskPriority" DEFAULT 'MEDIUM'::public."TaskPriority" NOT NULL,
    "locationLat" double precision,
    "locationLng" double precision,
    "locationAddress" text,
    "assigneeIds" jsonb,
    "estimatedHours" double precision,
    checklist jsonb,
    frequency public."RecurrenceFrequency" NOT NULL,
    "customDays" integer,
    "dayOfWeek" integer,
    "dayOfMonth" integer,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "lastGeneratedAt" timestamp(3) without time zone,
    "nextRunAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "spaceId" text,
    "workflowId" text,
    "customerId" text
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text NOT NULL,
    "cachedAccessToken" text,
    "replacedByTokenHash" text,
    "usedAt" timestamp(3) without time zone,
    "cachedRefreshToken" text,
    "ipAddress" text,
    "userAgent" text
);


--
-- Name: report_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_attachments (
    id text NOT NULL,
    "reportId" text NOT NULL,
    type public."ReportAttachmentType" NOT NULL,
    "fileName" text NOT NULL,
    "fileUrl" text NOT NULL,
    "fileSize" integer NOT NULL,
    caption text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "fileKey" text,
    "mimeType" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: report_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_definitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    dataset text NOT NULL,
    config jsonb NOT NULL,
    "isShared" boolean DEFAULT true NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: report_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_schedules (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "reportDefinitionId" text NOT NULL,
    cadence text NOT NULL,
    hour integer DEFAULT 7 NOT NULL,
    "dayOfWeek" integer,
    "dayOfMonth" integer,
    recipients text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastRunAt" timestamp(3) without time zone,
    "nextRunAt" timestamp(3) without time zone NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    color text DEFAULT '#6b7280'::text,
    scope public."RoleScope" DEFAULT 'BOTH'::public."RoleScope" NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    "legacyKind" text,
    "position" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    permissions jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isCustomized" boolean DEFAULT false NOT NULL,
    kind public."RoleKind" DEFAULT 'MANAGEMENT'::public."RoleKind" NOT NULL
);


--
-- Name: schedule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_templates (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    entries jsonb NOT NULL,
    "organizationId" text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: seat_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seat_prices (
    id text NOT NULL,
    "configId" text NOT NULL,
    "seatType" text NOT NULL,
    tier text,
    "monthlyCents" integer NOT NULL,
    "annualCents" integer NOT NULL,
    "stripePriceId" text
);


--
-- Name: service_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_reports (
    id text NOT NULL,
    "taskId" text NOT NULL,
    "assetId" text,
    summary text NOT NULL,
    "workPerformed" text,
    "workDuration" integer NOT NULL,
    "technicianSignature" text,
    "customerSignature" text,
    "customerName" text,
    "completedAt" timestamp(3) without time zone NOT NULL,
    "completedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    "customerId" text
);


--
-- Name: shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_assignments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "spaceId" text NOT NULL,
    "shiftId" text NOT NULL,
    recurrence public."ShiftRecurrence" DEFAULT 'WEEKLY'::public."ShiftRecurrence" NOT NULL,
    "daysOfWeek" integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    "daysOfMonth" integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    dates timestamp(3) without time zone[] DEFAULT (ARRAY[]::timestamp without time zone[])::timestamp(3) without time zone[] NOT NULL,
    "effectiveFrom" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "effectiveTo" timestamp(3) without time zone,
    priority integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: shift_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_instances (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text NOT NULL,
    "userId" text NOT NULL,
    "shiftId" text NOT NULL,
    "localDate" text NOT NULL,
    "expectedClockInAt" timestamp(3) without time zone NOT NULL,
    "expectedClockOutAt" timestamp(3) without time zone NOT NULL,
    state text DEFAULT 'PENDING'::text NOT NULL,
    "reminderCount" integer DEFAULT 0 NOT NULL,
    "nextRemindAt" timestamp(3) without time zone,
    "timeEntryId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "excuseReason" text,
    "excusedById" text
);


--
-- Name: shift_issue_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_issue_events (
    id text NOT NULL,
    "issueId" text NOT NULL,
    type public."ShiftIssueEventType" NOT NULL,
    "actorId" text,
    body text,
    metadata jsonb,
    attachments jsonb,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: shift_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_issues (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "timeEntryId" text,
    "spaceId" text,
    "reportedById" text NOT NULL,
    "assignedToId" text,
    title text NOT NULL,
    description text,
    severity public."ShiftIssueSeverity" DEFAULT 'MEDIUM'::public."ShiftIssueSeverity" NOT NULL,
    status public."ShiftIssueStatus" DEFAULT 'OPEN'::public."ShiftIssueStatus" NOT NULL,
    "acknowledgedById" text,
    "acknowledgedAt" timestamp(3) without time zone,
    "resolvedById" text,
    "resolvedAt" timestamp(3) without time zone,
    "resolutionNote" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "spaceId" text,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3b82f6'::text,
    "startLocal" text NOT NULL,
    "endLocal" text NOT NULL,
    "crossesMidnight" boolean DEFAULT false NOT NULL,
    "breakMinutes" integer DEFAULT 0 NOT NULL,
    "graceMin" integer DEFAULT 5 NOT NULL,
    "reminderIntervalMin" integer DEFAULT 5 NOT NULL,
    "maxReminders" integer DEFAULT 3 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "flagToleranceMin" integer DEFAULT 10 NOT NULL
);


--
-- Name: space_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_assignments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "spaceId" text NOT NULL,
    "roleId" text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    schedule text[] DEFAULT ARRAY[]::text[],
    "effectiveFrom" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "effectiveTo" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "notifyRoleIds" text[] DEFAULT ARRAY[]::text[],
    "notifyUserIds" text[] DEFAULT ARRAY[]::text[],
    "contactRoleIds" text[] DEFAULT ARRAY[]::text[],
    "contactUserIds" text[] DEFAULT ARRAY[]::text[],
    "approveRoleIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "approveUserIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "allowRemote" boolean,
    "billRateCents" integer,
    "costRateCents" integer,
    "workRoleId" text,
    "allowSecondRole" boolean DEFAULT false NOT NULL,
    "billBy" public."BillBy",
    "hoursBasis" public."HoursBasis"
);


--
-- Name: space_share_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_share_requests (
    id text NOT NULL,
    "shareId" text NOT NULL,
    "spaceId" text NOT NULL,
    "guestOrgId" text NOT NULL,
    "requestedById" text NOT NULL,
    type public."ShareRequestType" NOT NULL,
    title text NOT NULL,
    note text,
    status public."ShareRequestStatus" DEFAULT 'PENDING'::public."ShareRequestStatus" NOT NULL,
    "resolvedById" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: space_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_shares (
    id text NOT NULL,
    "spaceId" text NOT NULL,
    "ownerOrgId" text NOT NULL,
    "guestOrgId" text NOT NULL,
    level public."SpaceShareLevel" DEFAULT 'VIEW'::public."SpaceShareLevel" NOT NULL,
    status public."SpaceShareStatus" DEFAULT 'PENDING'::public."SpaceShareStatus" NOT NULL,
    "showWorkers" boolean DEFAULT true NOT NULL,
    "showAttendance" boolean DEFAULT false NOT NULL,
    "showTracking" boolean DEFAULT false NOT NULL,
    "showReports" boolean DEFAULT false NOT NULL,
    "allowRequests" boolean DEFAULT true NOT NULL,
    "createdById" text NOT NULL,
    "acceptedById" text,
    "acceptedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: space_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_workflows (
    id text NOT NULL,
    "spaceId" text NOT NULL,
    "workflowId" text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sprint_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprint_reports (
    id text NOT NULL,
    "sprintId" text NOT NULL,
    "organizationId" text NOT NULL,
    "committedPoints" integer DEFAULT 0 NOT NULL,
    "completedPoints" integer DEFAULT 0 NOT NULL,
    "committedTasks" integer DEFAULT 0 NOT NULL,
    "completedTasks" integer DEFAULT 0 NOT NULL,
    "carriedOverTasks" integer DEFAULT 0 NOT NULL,
    "carriedOverPoints" integer DEFAULT 0 NOT NULL,
    "addedMidSprint" integer DEFAULT 0 NOT NULL,
    "removedMidSprint" integer DEFAULT 0 NOT NULL,
    velocity double precision DEFAULT 0 NOT NULL,
    "dailyBurndown" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprints (
    id text NOT NULL,
    name text NOT NULL,
    goal text,
    "organizationId" text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    status public."SprintStatus" DEFAULT 'PLANNING'::public."SprintStatus" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "spaceId" text
);


--
-- Name: status_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_workflows (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "ownerSpaceId" text,
    capabilities text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "stripeSubscriptionId" text,
    "planTier" public."PlanTier" NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'TRIALING'::public."SubscriptionStatus" NOT NULL,
    "interval" public."BillingInterval" DEFAULT 'MONTHLY'::public."BillingInterval" NOT NULL,
    "officeSeats" integer DEFAULT 0 NOT NULL,
    "fieldSeats" integer DEFAULT 0 NOT NULL,
    "currentPeriodStart" timestamp(3) without time zone,
    "currentPeriodEnd" timestamp(3) without time zone,
    "trialEndsAt" timestamp(3) without time zone,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "canceledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "fieldInhouseSeats" integer DEFAULT 0 NOT NULL,
    "lastBilledCents" integer DEFAULT 0 NOT NULL
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    "authorId" text,
    "authorType" public."SupportAuthorType" NOT NULL,
    body text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isInternalNote" boolean DEFAULT false NOT NULL,
    "readByCustomerAt" timestamp(3) without time zone,
    "readByAgentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_routing_rules (
    id text NOT NULL,
    "teamId" text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: support_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_team_members (
    id text NOT NULL,
    "teamId" text NOT NULL,
    "platformUserId" text NOT NULL,
    "teamRole" public."SupportTeamRole" DEFAULT 'AGENT'::public."SupportTeamRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_teams (
    id text NOT NULL,
    name text NOT NULL,
    color text,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "createdById" text NOT NULL,
    subject text NOT NULL,
    category public."SupportCategory" DEFAULT 'OTHER'::public."SupportCategory" NOT NULL,
    channel public."SupportChannel" DEFAULT 'WEB'::public."SupportChannel" NOT NULL,
    status public."SupportStatus" DEFAULT 'OPEN'::public."SupportStatus" NOT NULL,
    priority integer DEFAULT 4 NOT NULL,
    "planTierAtCreation" text,
    "assignedAgentId" text,
    "slaFirstResponseDueAt" timestamp(3) without time zone,
    "firstRespondedAt" timestamp(3) without time zone,
    "slaBreached" boolean DEFAULT false NOT NULL,
    "lastCustomerMessageAt" timestamp(3) without time zone,
    "lastAgentMessageAt" timestamp(3) without time zone,
    "resolvedAt" timestamp(3) without time zone,
    "closedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "assignedTeamId" text
);


--
-- Name: sync_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_tombstones (
    id bigint NOT NULL,
    entity text NOT NULL,
    "entityId" text NOT NULL,
    "organizationId" text,
    "parentId" text,
    "userId" text,
    "deletedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sync_tombstones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_tombstones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_tombstones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_tombstones_id_seq OWNED BY public.sync_tombstones.id;


--
-- Name: task_assignees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_assignees (
    id text NOT NULL,
    "taskId" text NOT NULL,
    "userId" text NOT NULL,
    role public."TaskAssigneeRole" DEFAULT 'MEMBER'::public."TaskAssigneeRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    id text NOT NULL,
    "predecessorId" text NOT NULL,
    "successorId" text NOT NULL,
    type public."DependencyType" DEFAULT 'FINISH_TO_START'::public."DependencyType" NOT NULL,
    "lagDays" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: task_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_events (
    id text NOT NULL,
    "eventType" public."TaskEventType" NOT NULL,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "taskId" text NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: task_handovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_handovers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "taskId" text NOT NULL,
    "authorId" text NOT NULL,
    note text NOT NULL,
    "attachmentIds" text[] DEFAULT ARRAY[]::text[],
    "workedMinutes" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: task_step_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_step_submissions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "taskId" text NOT NULL,
    "statusKey" text NOT NULL,
    "formVersion" integer NOT NULL,
    form jsonb NOT NULL,
    answers jsonb NOT NULL,
    "submittedById" text NOT NULL,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'NEW'::text NOT NULL,
    priority public."TaskPriority" DEFAULT 'MEDIUM'::public."TaskPriority" NOT NULL,
    "dueDate" timestamp(3) without time zone,
    "locationLat" double precision,
    "locationLng" double precision,
    "locationAddress" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    "createdById" text NOT NULL,
    "assignedToId" text,
    "routeDistance" double precision,
    "routeEndedAt" timestamp(3) without time zone,
    "routeStartedAt" timestamp(3) without time zone,
    "assetId" text,
    depth integer DEFAULT 0 NOT NULL,
    "epicId" text,
    "estimatedHours" double precision,
    "parentId" text,
    "phaseId" text,
    "position" integer DEFAULT 0 NOT NULL,
    "spaceId" text,
    "sprintId" text,
    "startDate" timestamp(3) without time zone,
    "storyPoints" integer,
    "workflowId" text,
    "customerId" text,
    source text DEFAULT 'INTERNAL'::text NOT NULL,
    "unitId" text,
    triaged boolean DEFAULT true NOT NULL,
    "departureNotifiedAt" timestamp(3) without time zone,
    "pausedAt" timestamp(3) without time zone,
    "pausedById" text,
    "handoverDueById" text,
    "leadOverrideId" text,
    "leadOverrideUntil" timestamp(3) without time zone,
    "leadNoticeOn" text,
    "openRoleId" text,
    "openSpots" integer,
    "openSpotsLeft" integer,
    "openedAt" timestamp(3) without time zone,
    "openWave" integer DEFAULT 0 NOT NULL
);


--
-- Name: technician_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technician_schedules (
    id text NOT NULL,
    "technicianId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id text NOT NULL,
    "userId" text NOT NULL,
    "locationId" text NOT NULL,
    status public."TimeEntryStatus" DEFAULT 'CLOCKED_IN'::public."TimeEntryStatus" NOT NULL,
    "clockInAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "clockInLat" double precision NOT NULL,
    "clockInLng" double precision NOT NULL,
    "clockInAccuracy" double precision,
    "clockOutAt" timestamp(3) without time zone,
    "clockOutLat" double precision,
    "clockOutLng" double precision,
    "clockOutAccuracy" double precision,
    "clockInWithinGeofence" boolean DEFAULT true NOT NULL,
    "clockOutWithinGeofence" boolean,
    "totalMinutes" integer,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "organizationId" text NOT NULL,
    "approvalNotes" text,
    "approvalStatus" public."ApprovalStatus" DEFAULT 'PENDING'::public."ApprovalStatus" NOT NULL,
    "approvedAt" timestamp(3) without time zone,
    "approvedById" text,
    "breakMinutes" integer DEFAULT 0 NOT NULL,
    "editReason" text,
    "editedAt" timestamp(3) without time zone,
    "editedById" text,
    "isEdited" boolean DEFAULT false NOT NULL,
    "originalClockIn" timestamp(3) without time zone,
    "originalClockOut" timestamp(3) without time zone,
    "flagReasons" text[] DEFAULT ARRAY[]::text[],
    "isRemote" boolean DEFAULT false NOT NULL,
    "clockInPlace" text,
    "clockOutPlace" text,
    "shiftId" text,
    "expectedClockOutAt" timestamp(3) without time zone,
    "reminderState" public."ShiftReminderState" DEFAULT 'NONE'::public."ShiftReminderState" NOT NULL,
    "nextRemindAt" timestamp(3) without time zone,
    "reminderCount" integer DEFAULT 0 NOT NULL,
    timezone text,
    "expectedClockInAt" timestamp(3) without time zone,
    "countedStartAt" timestamp(3) without time zone,
    "countedEndAt" timestamp(3) without time zone,
    "paidMinutes" integer,
    "unpaidBreakMinutes" integer DEFAULT 0 NOT NULL,
    "breakPlan" jsonb,
    "nextBreakRemindAt" timestamp(3) without time zone,
    "awayReason" text,
    "clockOutProvisional" boolean DEFAULT false NOT NULL,
    "clockOutBasis" text,
    "endIsDailyLimit" boolean DEFAULT false NOT NULL,
    presence text,
    "presenceReason" text,
    "presenceAt" timestamp(3) without time zone,
    "lastSeenAt" timestamp(3) without time zone
);


--
-- Name: time_entry_note_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entry_note_attachments (
    id text NOT NULL,
    "noteId" text NOT NULL,
    "organizationId" text NOT NULL,
    "fileKey" text NOT NULL,
    "fileUrl" text NOT NULL,
    "fileName" text NOT NULL,
    "fileSize" integer NOT NULL,
    "mimeType" text NOT NULL,
    width integer,
    height integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: time_entry_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entry_notes (
    id text NOT NULL,
    "timeEntryId" text NOT NULL,
    "userId" text NOT NULL,
    "organizationId" text NOT NULL,
    body text NOT NULL,
    at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "taskId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "authorId" text
);


--
-- Name: time_entry_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entry_presence (
    id text NOT NULL,
    "timeEntryId" text NOT NULL,
    "organizationId" text NOT NULL,
    at timestamp(3) without time zone NOT NULL,
    presence text NOT NULL,
    reason text NOT NULL,
    "sentLate" boolean DEFAULT false NOT NULL,
    "anchorLat" double precision,
    "anchorLng" double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: time_off_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_off_requests (
    id text NOT NULL,
    "technicianId" text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    reason text,
    status public."TimeOffStatus" DEFAULT 'PENDING'::public."TimeOffStatus" NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectionReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    type public."TimeOffType" DEFAULT 'VACATION'::public."TimeOffType" NOT NULL,
    "workingDays" double precision
);


--
-- Name: unit_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_activities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "unitId" text NOT NULL,
    type text DEFAULT 'NOTE'::text NOT NULL,
    body text,
    "authorId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_tokens (
    id text NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    "deviceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    role public."Role" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "failedLoginAttempts" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp(3) without time zone,
    "organizationId" text,
    "maxDailyJobs" integer DEFAULT 5,
    rating double precision DEFAULT 5.0,
    "ratingCount" integer DEFAULT 0,
    specialty text,
    "canAssignTasks" boolean DEFAULT false NOT NULL,
    "canCreateTasks" boolean DEFAULT false NOT NULL,
    "canManageUsers" boolean DEFAULT false NOT NULL,
    "canViewAllTasks" boolean DEFAULT false NOT NULL,
    "onboardingCompleted" boolean DEFAULT true NOT NULL,
    "avatarUrl" text,
    "profileBadges" jsonb,
    "position" text,
    "enabledModules" jsonb,
    "taskCreationScope" public."TaskCreationScope" DEFAULT 'NONE'::public."TaskCreationScope" NOT NULL,
    "scheduleType" text DEFAULT 'NONE'::text,
    "monthlyHourBudget" double precision,
    "allowRemote" boolean DEFAULT false NOT NULL,
    presence text,
    contactable boolean DEFAULT true NOT NULL,
    "contactScope" text DEFAULT 'NONE'::text NOT NULL,
    "contactAllowedIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "lastActiveAt" timestamp(3) without time zone,
    "notificationPrefs" jsonb,
    "showInManagement" boolean DEFAULT false NOT NULL,
    "canViewReports" boolean DEFAULT false NOT NULL,
    "timeFormat" text DEFAULT '24h'::text,
    "customerId" text,
    "unitId" text,
    "guidesSeen" boolean DEFAULT false NOT NULL,
    "memberRoleId" text,
    "employmentType" text DEFAULT 'EXTERNAL'::text,
    timezone text,
    "assetId" text,
    "leaveAllowance" integer,
    "employmentStartDate" date,
    "lastAppVersion" text,
    "lastAppPlatform" text,
    "lastAppSeenAt" timestamp(3) without time zone,
    "isExternal" boolean DEFAULT false NOT NULL,
    "dateOfBirth" date,
    "billRateCents" integer,
    "costRateCents" integer,
    locale text,
    "assignedHome" jsonb,
    "employerEntityId" text,
    "tokensValidAfter" timestamp(3) without time zone
);


--
-- Name: worker_last_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_last_locations (
    id text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    accuracy double precision,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: workflow_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_statuses (
    id text NOT NULL,
    "workflowId" text NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    icon text,
    "position" integer DEFAULT 0 NOT NULL,
    "isFinal" boolean DEFAULT false NOT NULL,
    "isCanceled" boolean DEFAULT false NOT NULL,
    transitions text[],
    capabilities text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "nameKey" text,
    form jsonb
);


--
-- Name: workflow_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_templates (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    industry text,
    icon text,
    "position" integer DEFAULT 0 NOT NULL,
    "isPublished" boolean DEFAULT false NOT NULL,
    "isBuiltIn" boolean DEFAULT false NOT NULL,
    definition jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "submittedByOrgId" text,
    "submittedAt" timestamp(3) without time zone,
    "sourceKey" text
);


--
-- Name: sync_tombstones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_tombstones ALTER COLUMN id SET DEFAULT nextval('public.sync_tombstones_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: asset_activities asset_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_activities
    ADD CONSTRAINT asset_activities_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: asset_custody asset_custody_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_custody
    ADD CONSTRAINT asset_custody_pkey PRIMARY KEY (id);


--
-- Name: asset_holders asset_holders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_holders
    ADD CONSTRAINT asset_holders_pkey PRIMARY KEY (id);


--
-- Name: asset_list_rows asset_list_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_list_rows
    ADD CONSTRAINT asset_list_rows_pkey PRIMARY KEY (id);


--
-- Name: asset_log_reminders asset_log_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_log_reminders
    ADD CONSTRAINT asset_log_reminders_pkey PRIMARY KEY (id);


--
-- Name: asset_money asset_money_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_money
    ADD CONSTRAINT asset_money_pkey PRIMARY KEY (id);


--
-- Name: asset_proposals asset_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_proposals
    ADD CONSTRAINT asset_proposals_pkey PRIMARY KEY (id);


--
-- Name: asset_types asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: billing_alerts billing_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);


--
-- Name: blog_images blog_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_images
    ADD CONSTRAINT blog_images_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: break_rules break_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.break_rules
    ADD CONSTRAINT break_rules_pkey PRIMARY KEY (id);


--
-- Name: breaks breaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breaks
    ADD CONSTRAINT breaks_pkey PRIMARY KEY (id);


--
-- Name: calendar_attendees calendar_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_attendees
    ADD CONSTRAINT calendar_attendees_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_feed_tokens calendar_feed_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feed_tokens
    ADD CONSTRAINT calendar_feed_tokens_pkey PRIMARY KEY (id);


--
-- Name: calendar_holidays calendar_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_pkey PRIMARY KEY (id);


--
-- Name: checklist_items checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items
    ADD CONSTRAINT checklist_items_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: company_locations company_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_locations
    ADD CONSTRAINT company_locations_pkey PRIMARY KEY (id);


--
-- Name: conversation_members conversation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT conversation_members_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: cron_locks cron_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_locks
    ADD CONSTRAINT cron_locks_pkey PRIMARY KEY (name);


--
-- Name: custom_field_definitions custom_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);


--
-- Name: custom_field_values custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_pkey PRIMARY KEY (id);


--
-- Name: customer_activities customer_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_activities
    ADD CONSTRAINT customer_activities_pkey PRIMARY KEY (id);


--
-- Name: customer_contacts customer_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);


--
-- Name: customer_sign_links customer_sign_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sign_links
    ADD CONSTRAINT customer_sign_links_pkey PRIMARY KEY (id);


--
-- Name: customer_units customer_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_units
    ADD CONSTRAINT customer_units_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: daily_metrics daily_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metrics
    ADD CONSTRAINT daily_metrics_pkey PRIMARY KEY (id);


--
-- Name: definition_of_done definition_of_done_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.definition_of_done
    ADD CONSTRAINT definition_of_done_pkey PRIMARY KEY (id);


--
-- Name: device_keys device_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_keys
    ADD CONSTRAINT device_keys_pkey PRIMARY KEY (id);


--
-- Name: document_events document_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT document_events_pkey PRIMARY KEY (id);


--
-- Name: document_signatures document_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT document_signatures_pkey PRIMARY KEY (id);


--
-- Name: document_signers document_signers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT document_signers_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: epics epics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT epics_pkey PRIMARY KEY (id);


--
-- Name: geofence_excursions geofence_excursions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_excursions
    ADD CONSTRAINT geofence_excursions_pkey PRIMARY KEY (id);


--
-- Name: health_metrics health_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.health_metrics
    ADD CONSTRAINT health_metrics_pkey PRIMARY KEY (id);


--
-- Name: intake_categories intake_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intake_categories
    ADD CONSTRAINT intake_categories_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: join_requests join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_pkey PRIMARY KEY (id);


--
-- Name: legal_entities legal_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities
    ADD CONSTRAINT legal_entities_pkey PRIMARY KEY (id);


--
-- Name: legal_entity_bank_accounts legal_entity_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entity_bank_accounts
    ADD CONSTRAINT legal_entity_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: location_history location_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: module_prices module_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_prices
    ADD CONSTRAINT module_prices_pkey PRIMARY KEY (id);


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: notification_watches notification_watches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_watches
    ADD CONSTRAINT notification_watches_pkey PRIMARY KEY (id);


--
-- Name: organization_access organization_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_access
    ADD CONSTRAINT organization_access_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: overtime_requests overtime_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT overtime_requests_pkey PRIMARY KEY (id);


--
-- Name: parts_used parts_used_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parts_used
    ADD CONSTRAINT parts_used_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: phases phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_pkey PRIMARY KEY (id);


--
-- Name: platform_audit_logs platform_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_logs
    ADD CONSTRAINT platform_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_users platform_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_pkey PRIMARY KEY (id);


--
-- Name: portals portals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portals
    ADD CONSTRAINT portals_pkey PRIMARY KEY (id);


--
-- Name: pricing_configs pricing_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_configs
    ADD CONSTRAINT pricing_configs_pkey PRIMARY KEY (id);


--
-- Name: rate_history rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_history
    ADD CONSTRAINT rate_history_pkey PRIMARY KEY (id);


--
-- Name: recurring_task_templates recurring_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: report_attachments report_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_attachments
    ADD CONSTRAINT report_attachments_pkey PRIMARY KEY (id);


--
-- Name: report_definitions report_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_definitions
    ADD CONSTRAINT report_definitions_pkey PRIMARY KEY (id);


--
-- Name: report_schedules report_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schedule_templates schedule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT schedule_templates_pkey PRIMARY KEY (id);


--
-- Name: seat_prices seat_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_prices
    ADD CONSTRAINT seat_prices_pkey PRIMARY KEY (id);


--
-- Name: service_reports service_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT service_reports_pkey PRIMARY KEY (id);


--
-- Name: shift_assignments shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: shift_instances shift_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_instances
    ADD CONSTRAINT shift_instances_pkey PRIMARY KEY (id);


--
-- Name: shift_issue_events shift_issue_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_issue_events
    ADD CONSTRAINT shift_issue_events_pkey PRIMARY KEY (id);


--
-- Name: shift_issues shift_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_issues
    ADD CONSTRAINT shift_issues_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: space_assignments space_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT space_assignments_pkey PRIMARY KEY (id);


--
-- Name: space_share_requests space_share_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_share_requests
    ADD CONSTRAINT space_share_requests_pkey PRIMARY KEY (id);


--
-- Name: space_shares space_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_shares
    ADD CONSTRAINT space_shares_pkey PRIMARY KEY (id);


--
-- Name: space_workflows space_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_workflows
    ADD CONSTRAINT space_workflows_pkey PRIMARY KEY (id);


--
-- Name: sprint_reports sprint_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_reports
    ADD CONSTRAINT sprint_reports_pkey PRIMARY KEY (id);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: status_workflows status_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_workflows
    ADD CONSTRAINT status_workflows_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_routing_rules support_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_routing_rules
    ADD CONSTRAINT support_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: support_team_members support_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_team_members
    ADD CONSTRAINT support_team_members_pkey PRIMARY KEY (id);


--
-- Name: support_teams support_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_teams
    ADD CONSTRAINT support_teams_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: sync_tombstones sync_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_tombstones
    ADD CONSTRAINT sync_tombstones_pkey PRIMARY KEY (id);


--
-- Name: task_assignees task_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);


--
-- Name: task_events task_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_pkey PRIMARY KEY (id);


--
-- Name: task_handovers task_handovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_handovers
    ADD CONSTRAINT task_handovers_pkey PRIMARY KEY (id);


--
-- Name: task_step_submissions task_step_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_step_submissions
    ADD CONSTRAINT task_step_submissions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: technician_schedules technician_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_schedules
    ADD CONSTRAINT technician_schedules_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: time_entry_note_attachments time_entry_note_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_note_attachments
    ADD CONSTRAINT time_entry_note_attachments_pkey PRIMARY KEY (id);


--
-- Name: time_entry_notes time_entry_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_notes
    ADD CONSTRAINT time_entry_notes_pkey PRIMARY KEY (id);


--
-- Name: time_entry_presence time_entry_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_presence
    ADD CONSTRAINT time_entry_presence_pkey PRIMARY KEY (id);


--
-- Name: time_off_requests time_off_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_off_requests
    ADD CONSTRAINT time_off_requests_pkey PRIMARY KEY (id);


--
-- Name: unit_activities unit_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_activities
    ADD CONSTRAINT unit_activities_pkey PRIMARY KEY (id);


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worker_last_locations worker_last_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_last_locations
    ADD CONSTRAINT worker_last_locations_pkey PRIMARY KEY (id);


--
-- Name: workflow_statuses workflow_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_statuses
    ADD CONSTRAINT workflow_statuses_pkey PRIMARY KEY (id);


--
-- Name: workflow_templates workflow_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_pkey PRIMARY KEY (id);


--
-- Name: activity_logs_eventType_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_logs_eventType_createdAt_idx" ON public.activity_logs USING btree ("eventType", "createdAt");


--
-- Name: activity_logs_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_logs_organizationId_createdAt_idx" ON public.activity_logs USING btree ("organizationId", "createdAt");


--
-- Name: activity_logs_resourceId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_logs_resourceId_createdAt_idx" ON public.activity_logs USING btree ("resourceId", "createdAt");


--
-- Name: activity_logs_resourceType_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_logs_resourceType_resourceId_idx" ON public.activity_logs USING btree ("resourceType", "resourceId");


--
-- Name: activity_logs_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "activity_logs_userId_createdAt_idx" ON public.activity_logs USING btree ("userId", "createdAt");


--
-- Name: alerts_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_organizationId_status_idx" ON public.alerts USING btree ("organizationId", status);


--
-- Name: alerts_severity_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_severity_status_idx ON public.alerts USING btree (severity, status);


--
-- Name: alerts_type_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_type_createdAt_idx" ON public.alerts USING btree (type, "createdAt");


--
-- Name: alerts_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alerts_userId_idx" ON public.alerts USING btree ("userId");


--
-- Name: asset_activities_assetId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_activities_assetId_createdAt_idx" ON public.asset_activities USING btree ("assetId", "createdAt");


--
-- Name: asset_categories_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_categories_organizationId_idx" ON public.asset_categories USING btree ("organizationId");


--
-- Name: asset_categories_organizationId_spaceId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_categories_organizationId_spaceId_name_key" ON public.asset_categories USING btree ("organizationId", "spaceId", name);


--
-- Name: asset_categories_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_categories_spaceId_idx" ON public.asset_categories USING btree ("spaceId");


--
-- Name: asset_custody_assetId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_custody_assetId_startedAt_idx" ON public.asset_custody USING btree ("assetId", "startedAt");


--
-- Name: asset_custody_customerId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_custody_customerId_startedAt_idx" ON public.asset_custody USING btree ("customerId", "startedAt");


--
-- Name: asset_custody_userId_endedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_custody_userId_endedAt_idx" ON public.asset_custody USING btree ("userId", "endedAt");


--
-- Name: asset_custody_userId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_custody_userId_startedAt_idx" ON public.asset_custody USING btree ("userId", "startedAt");


--
-- Name: asset_holders_assetId_customerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_holders_assetId_customerId_key" ON public.asset_holders USING btree ("assetId", "customerId");


--
-- Name: asset_holders_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_holders_assetId_idx" ON public.asset_holders USING btree ("assetId");


--
-- Name: asset_holders_assetId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_holders_assetId_userId_key" ON public.asset_holders USING btree ("assetId", "userId");


--
-- Name: asset_holders_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_holders_customerId_idx" ON public.asset_holders USING btree ("customerId");


--
-- Name: asset_holders_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_holders_userId_idx" ON public.asset_holders USING btree ("userId");


--
-- Name: asset_list_rows_assetId_list_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_list_rows_assetId_list_position_idx" ON public.asset_list_rows USING btree ("assetId", list, "position");


--
-- Name: asset_list_rows_categoryId_list_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_list_rows_categoryId_list_position_idx" ON public.asset_list_rows USING btree ("categoryId", list, "position");


--
-- Name: asset_log_reminders_assetId_logType_windowKey_stage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_log_reminders_assetId_logType_windowKey_stage_key" ON public.asset_log_reminders USING btree ("assetId", "logType", "windowKey", stage);


--
-- Name: asset_money_assetId_logType_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_money_assetId_logType_occurredAt_idx" ON public.asset_money USING btree ("assetId", "logType", "occurredAt");


--
-- Name: asset_money_assetId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_money_assetId_occurredAt_idx" ON public.asset_money USING btree ("assetId", "occurredAt");


--
-- Name: asset_money_authorId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_money_authorId_occurredAt_idx" ON public.asset_money USING btree ("authorId", "occurredAt");


--
-- Name: asset_money_organizationId_status_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_money_organizationId_status_occurredAt_idx" ON public.asset_money USING btree ("organizationId", status, "occurredAt");


--
-- Name: asset_proposals_organizationId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_proposals_organizationId_status_createdAt_idx" ON public.asset_proposals USING btree ("organizationId", status, "createdAt");


--
-- Name: asset_proposals_raisedById_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_proposals_raisedById_createdAt_idx" ON public.asset_proposals USING btree ("raisedById", "createdAt");


--
-- Name: asset_types_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_types_categoryId_idx" ON public.asset_types USING btree ("categoryId");


--
-- Name: asset_types_categoryId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_types_categoryId_name_key" ON public.asset_types USING btree ("categoryId", name);


--
-- Name: assets_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_categoryId_idx" ON public.assets USING btree ("categoryId");


--
-- Name: assets_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_customerId_idx" ON public.assets USING btree ("customerId");


--
-- Name: assets_holderUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_holderUserId_idx" ON public.assets USING btree ("holderUserId");


--
-- Name: assets_logRemindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_logRemindAt_idx" ON public.assets USING btree ("logRemindAt");


--
-- Name: assets_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_organizationId_idx" ON public.assets USING btree ("organizationId");


--
-- Name: assets_serialNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_serialNumber_idx" ON public.assets USING btree ("serialNumber");


--
-- Name: assets_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_status_idx ON public.assets USING btree (status);


--
-- Name: assets_typeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assets_typeId_idx" ON public.assets USING btree ("typeId");


--
-- Name: attachments_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachments_taskId_idx" ON public.attachments USING btree ("taskId");


--
-- Name: billing_alerts_acknowledgedAt_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "billing_alerts_acknowledgedAt_createdAt_idx" ON public.billing_alerts USING btree ("acknowledgedAt", "createdAt");


--
-- Name: billing_alerts_org_kind_ack_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_alerts_org_kind_ack_idx ON public.billing_alerts USING btree ("organizationId", kind, "acknowledgedAt");


--
-- Name: billing_alerts_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "billing_alerts_organizationId_createdAt_idx" ON public.billing_alerts USING btree ("organizationId", "createdAt");


--
-- Name: billing_events_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "billing_events_organizationId_createdAt_idx" ON public.billing_events USING btree ("organizationId", "createdAt");


--
-- Name: billing_events_stripeEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "billing_events_stripeEventId_key" ON public.billing_events USING btree ("stripeEventId");


--
-- Name: blog_posts_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blog_posts_slug_key ON public.blog_posts USING btree (slug);


--
-- Name: blog_posts_status_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "blog_posts_status_publishedAt_idx" ON public.blog_posts USING btree (status, "publishedAt");


--
-- Name: break_rules_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "break_rules_organizationId_isActive_idx" ON public.break_rules USING btree ("organizationId", "isActive");


--
-- Name: break_rules_shiftId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "break_rules_shiftId_isActive_idx" ON public.break_rules USING btree ("shiftId", "isActive");


--
-- Name: break_rules_spaceId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "break_rules_spaceId_isActive_idx" ON public.break_rules USING btree ("spaceId", "isActive");


--
-- Name: breaks_addedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "breaks_addedById_idx" ON public.breaks USING btree ("addedById") WHERE ("addedById" IS NOT NULL);


--
-- Name: breaks_endedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "breaks_endedAt_idx" ON public.breaks USING btree ("endedAt");


--
-- Name: breaks_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "breaks_startedAt_idx" ON public.breaks USING btree ("startedAt");


--
-- Name: breaks_timeEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "breaks_timeEntryId_idx" ON public.breaks USING btree ("timeEntryId");


--
-- Name: calendar_attendees_eventId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "calendar_attendees_eventId_userId_key" ON public.calendar_attendees USING btree ("eventId", "userId");


--
-- Name: calendar_attendees_nextRemindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_attendees_nextRemindAt_idx" ON public.calendar_attendees USING btree ("nextRemindAt");


--
-- Name: calendar_attendees_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_attendees_userId_idx" ON public.calendar_attendees USING btree ("userId");


--
-- Name: calendar_events_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_events_createdById_idx" ON public.calendar_events USING btree ("createdById");


--
-- Name: calendar_events_organizationId_startAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_events_organizationId_startAt_idx" ON public.calendar_events USING btree ("organizationId", "startAt");


--
-- Name: calendar_feed_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "calendar_feed_tokens_tokenHash_key" ON public.calendar_feed_tokens USING btree ("tokenHash");


--
-- Name: calendar_feed_tokens_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "calendar_feed_tokens_userId_key" ON public.calendar_feed_tokens USING btree ("userId");


--
-- Name: calendar_holidays_organizationId_spaceId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_holidays_organizationId_spaceId_date_idx" ON public.calendar_holidays USING btree ("organizationId", "spaceId", date);


--
-- Name: checklist_items_assigneeId_isCompleted_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_items_assigneeId_isCompleted_taskId_idx" ON public.checklist_items USING btree ("assigneeId", "isCompleted", "taskId");


--
-- Name: checklist_items_completedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_items_completedById_idx" ON public.checklist_items USING btree ("completedById");


--
-- Name: checklist_items_taskId_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_items_taskId_position_idx" ON public.checklist_items USING btree ("taskId", "position");


--
-- Name: comments_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_taskId_idx" ON public.comments USING btree ("taskId");


--
-- Name: comments_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_userId_idx" ON public.comments USING btree ("userId");


--
-- Name: company_locations_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_locations_isActive_idx" ON public.company_locations USING btree ("isActive");


--
-- Name: company_locations_organizationId_kind_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_locations_organizationId_kind_name_idx" ON public.company_locations USING btree ("organizationId", kind, name);


--
-- Name: company_locations_sourceCustomerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_locations_sourceCustomerId_idx" ON public.company_locations USING btree ("sourceCustomerId");


--
-- Name: conversation_members_conversationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conversation_members_conversationId_idx" ON public.conversation_members USING btree ("conversationId");


--
-- Name: conversation_members_conversationId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "conversation_members_conversationId_userId_key" ON public.conversation_members USING btree ("conversationId", "userId");


--
-- Name: conversation_members_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conversation_members_userId_idx" ON public.conversation_members USING btree ("userId");


--
-- Name: conversations_organizationId_dmKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "conversations_organizationId_dmKey_key" ON public.conversations USING btree ("organizationId", "dmKey");


--
-- Name: conversations_organizationId_lastMessageAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conversations_organizationId_lastMessageAt_idx" ON public.conversations USING btree ("organizationId", "lastMessageAt");


--
-- Name: conversations_originSpaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conversations_originSpaceId_idx" ON public.conversations USING btree ("originSpaceId");


--
-- Name: cron_locks_lockedUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cron_locks_lockedUntil_idx" ON public.cron_locks USING btree ("lockedUntil");


--
-- Name: custom_field_definitions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "custom_field_definitions_organizationId_idx" ON public.custom_field_definitions USING btree ("organizationId");


--
-- Name: custom_field_definitions_organizationId_workflowId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "custom_field_definitions_organizationId_workflowId_key_key" ON public.custom_field_definitions USING btree ("organizationId", "workflowId", key);


--
-- Name: custom_field_definitions_workflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "custom_field_definitions_workflowId_idx" ON public.custom_field_definitions USING btree ("workflowId");


--
-- Name: custom_field_values_definitionId_taskId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "custom_field_values_definitionId_taskId_key" ON public.custom_field_values USING btree ("definitionId", "taskId");


--
-- Name: custom_field_values_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "custom_field_values_taskId_idx" ON public.custom_field_values USING btree ("taskId");


--
-- Name: customer_activities_customerId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_activities_customerId_createdAt_idx" ON public.customer_activities USING btree ("customerId", "createdAt");


--
-- Name: customer_activities_notifyAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_activities_notifyAt_idx" ON public.customer_activities USING btree ("notifyAt");


--
-- Name: customer_activities_organizationId_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_activities_organizationId_dueAt_idx" ON public.customer_activities USING btree ("organizationId", "dueAt");


--
-- Name: customer_activities_organizationId_type_doneAt_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_activities_organizationId_type_doneAt_dueAt_idx" ON public.customer_activities USING btree ("organizationId", type, "doneAt", "dueAt");


--
-- Name: customer_activities_reminder_sweep_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_activities_reminder_sweep_idx ON public.customer_activities USING btree ("dueAt") WHERE ((type = 'REMINDER'::public."CustomerActivityType") AND ("doneAt" IS NULL) AND ("notifiedAt" IS NULL));


--
-- Name: customer_contacts_companyId_isPrimary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_contacts_companyId_isPrimary_idx" ON public.customer_contacts USING btree ("companyId", "isPrimary");


--
-- Name: customer_contacts_companyId_personId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "customer_contacts_companyId_personId_key" ON public.customer_contacts USING btree ("companyId", "personId");


--
-- Name: customer_contacts_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_contacts_personId_idx" ON public.customer_contacts USING btree ("personId");


--
-- Name: customer_sign_links_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_sign_links_expiresAt_idx" ON public.customer_sign_links USING btree ("expiresAt");


--
-- Name: customer_sign_links_organizationId_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "customer_sign_links_organizationId_email_key" ON public.customer_sign_links USING btree ("organizationId", email);


--
-- Name: customer_sign_links_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "customer_sign_links_tokenHash_key" ON public.customer_sign_links USING btree ("tokenHash");


--
-- Name: customer_units_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_units_customerId_idx" ON public.customer_units USING btree ("customerId");


--
-- Name: customer_units_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_units_organizationId_isActive_idx" ON public.customer_units USING btree ("organizationId", "isActive");


--
-- Name: customer_units_portalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_units_portalId_idx" ON public.customer_units USING btree ("portalId");


--
-- Name: customer_units_residentUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_units_residentUserId_idx" ON public.customer_units USING btree ("residentUserId");


--
-- Name: customer_units_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customer_units_spaceId_idx" ON public.customer_units USING btree ("spaceId");


--
-- Name: customers_organizationId_emailKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_organizationId_emailKey_idx" ON public.customers USING btree ("organizationId", "emailKey");


--
-- Name: customers_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_organizationId_isActive_idx" ON public.customers USING btree ("organizationId", "isActive");


--
-- Name: customers_organizationId_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_organizationId_name_idx" ON public.customers USING btree ("organizationId", name);


--
-- Name: customers_organizationId_phoneKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_organizationId_phoneKey_idx" ON public.customers USING btree ("organizationId", "phoneKey");


--
-- Name: customers_organizationId_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_organizationId_spaceId_idx" ON public.customers USING btree ("organizationId", "spaceId");


--
-- Name: customers_portalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "customers_portalId_idx" ON public.customers USING btree ("portalId");


--
-- Name: daily_metrics_date_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "daily_metrics_date_organizationId_key" ON public.daily_metrics USING btree (date, "organizationId");


--
-- Name: daily_metrics_organizationId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "daily_metrics_organizationId_date_idx" ON public.daily_metrics USING btree ("organizationId", date);


--
-- Name: definition_of_done_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "definition_of_done_organizationId_idx" ON public.definition_of_done USING btree ("organizationId");


--
-- Name: device_keys_userId_deviceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "device_keys_userId_deviceId_key" ON public.device_keys USING btree ("userId", "deviceId");


--
-- Name: device_keys_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_keys_userId_idx" ON public.device_keys USING btree ("userId");


--
-- Name: document_events_documentId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_events_documentId_at_idx" ON public.document_events USING btree ("documentId", at);


--
-- Name: document_signatures_batchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_signatures_batchId_idx" ON public.document_signatures USING btree ("batchId");


--
-- Name: document_signatures_documentId_signedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_signatures_documentId_signedAt_idx" ON public.document_signatures USING btree ("documentId", "signedAt");


--
-- Name: document_signatures_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_signatures_idempotencyKey_key" ON public.document_signatures USING btree ("idempotencyKey");


--
-- Name: document_signatures_signerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_signatures_signerId_key" ON public.document_signatures USING btree ("signerId");


--
-- Name: document_signatures_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_signatures_userId_idx" ON public.document_signatures USING btree ("userId");


--
-- Name: document_signers_documentId_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_signers_documentId_order_key" ON public.document_signers USING btree ("documentId", "order");


--
-- Name: document_signers_documentId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_signers_documentId_status_idx" ON public.document_signers USING btree ("documentId", status);


--
-- Name: document_signers_eligible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_signers_eligible_idx ON public.document_signers USING gin ("eligibleUserIds");


--
-- Name: document_signers_email_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_signers_email_status_idx ON public.document_signers USING btree (email, status);


--
-- Name: document_signers_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_signers_tokenHash_key" ON public.document_signers USING btree ("tokenHash");


--
-- Name: document_signers_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_signers_userId_status_idx" ON public.document_signers USING btree ("userId", status);


--
-- Name: document_templates_organizationId_appliesToRoleId_appliesToP_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_templates_organizationId_appliesToRoleId_appliesToP_id" ON public.document_templates USING btree ("organizationId", "appliesToRoleId", "appliesToPosition");


--
-- Name: document_templates_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_templates_organizationId_isActive_idx" ON public.document_templates USING btree ("organizationId", "isActive");


--
-- Name: document_types_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_types_organizationId_isActive_idx" ON public.document_types USING btree ("organizationId", "isActive");


--
-- Name: document_types_organizationId_isCredential_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_types_organizationId_isCredential_idx" ON public.document_types USING btree ("organizationId", "isCredential");


--
-- Name: document_types_organizationId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_types_organizationId_key_key" ON public.document_types USING btree ("organizationId", key);


--
-- Name: documents_draft_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_draft_created_idx ON public.documents USING btree ("createdAt") WHERE (status = 'DRAFT'::public."DocumentStatus");


--
-- Name: documents_org_document_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_org_document_number_idx ON public.documents USING btree ("organizationId", "documentNumber");


--
-- Name: documents_organizationId_expiresOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_expiresOn_idx" ON public.documents USING btree ("organizationId", "expiresOn");


--
-- Name: documents_organizationId_sha256_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_sha256_idx" ON public.documents USING btree ("organizationId", sha256);


--
-- Name: documents_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_status_idx" ON public.documents USING btree ("organizationId", status);


--
-- Name: documents_supersedesId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "documents_supersedesId_key" ON public.documents USING btree ("supersedesId");


--
-- Name: documents_userId_hiddenFromMember_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_userId_hiddenFromMember_idx" ON public.documents USING btree ("userId", "hiddenFromMember");


--
-- Name: documents_userId_typeId_periodYear_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_userId_typeId_periodYear_idx" ON public.documents USING btree ("userId", "typeId", "periodYear");


--
-- Name: epics_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "epics_organizationId_idx" ON public.epics USING btree ("organizationId");


--
-- Name: epics_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "epics_spaceId_idx" ON public.epics USING btree ("spaceId");


--
-- Name: geofence_excursions_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "geofence_excursions_organizationId_status_idx" ON public.geofence_excursions USING btree ("organizationId", status);


--
-- Name: geofence_excursions_status_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "geofence_excursions_status_expiresAt_idx" ON public.geofence_excursions USING btree (status, "expiresAt");


--
-- Name: geofence_excursions_timeEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "geofence_excursions_timeEntryId_idx" ON public.geofence_excursions USING btree ("timeEntryId");


--
-- Name: geofence_excursions_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "geofence_excursions_userId_status_idx" ON public.geofence_excursions USING btree ("userId", status);


--
-- Name: health_metrics_metricType_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "health_metrics_metricType_timestamp_idx" ON public.health_metrics USING btree ("metricType", "timestamp");


--
-- Name: health_metrics_serviceName_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "health_metrics_serviceName_timestamp_idx" ON public.health_metrics USING btree ("serviceName", "timestamp");


--
-- Name: intake_categories_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "intake_categories_organizationId_isActive_idx" ON public.intake_categories USING btree ("organizationId", "isActive");


--
-- Name: intake_categories_portalId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "intake_categories_portalId_isActive_idx" ON public.intake_categories USING btree ("portalId", "isActive");


--
-- Name: intake_categories_portalId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "intake_categories_portalId_key_key" ON public.intake_categories USING btree ("portalId", key);


--
-- Name: invitations_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitations_assetId_idx" ON public.invitations USING btree ("assetId");


--
-- Name: invitations_codeHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "invitations_codeHash_key" ON public.invitations USING btree ("codeHash");


--
-- Name: invitations_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitations_createdById_idx" ON public.invitations USING btree ("createdById");


--
-- Name: invitations_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitations_expiresAt_idx" ON public.invitations USING btree ("expiresAt");


--
-- Name: invitations_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitations_organizationId_status_idx" ON public.invitations USING btree ("organizationId", status);


--
-- Name: invitations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_status_idx ON public.invitations USING btree (status);


--
-- Name: invoice_items_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoice_items_invoiceId_idx" ON public.invoice_items USING btree ("invoiceId");


--
-- Name: invoice_items_workerId_dayFrom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoice_items_workerId_dayFrom_idx" ON public.invoice_items USING btree ("workerId", "dayFrom");


--
-- Name: invoices_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_createdAt_idx" ON public.invoices USING btree ("organizationId", "createdAt");


--
-- Name: invoices_organizationId_invoiceNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "invoices_organizationId_invoiceNumber_key" ON public.invoices USING btree ("organizationId", "invoiceNumber");


--
-- Name: invoices_organizationId_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_spaceId_idx" ON public.invoices USING btree ("organizationId", "spaceId");


--
-- Name: invoices_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_status_idx" ON public.invoices USING btree ("organizationId", status);


--
-- Name: join_requests_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "join_requests_organizationId_status_idx" ON public.join_requests USING btree ("organizationId", status);


--
-- Name: join_requests_reviewedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "join_requests_reviewedById_idx" ON public.join_requests USING btree ("reviewedById");


--
-- Name: join_requests_userId_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "join_requests_userId_organizationId_status_idx" ON public.join_requests USING btree ("userId", "organizationId", status);


--
-- Name: legal_entities_one_main; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX legal_entities_one_main ON public.legal_entities USING btree ("organizationId") WHERE "isMain";


--
-- Name: legal_entities_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_entities_organizationId_idx" ON public.legal_entities USING btree ("organizationId");


--
-- Name: legal_entity_bank_accounts_legalEntityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_entity_bank_accounts_legalEntityId_idx" ON public.legal_entity_bank_accounts USING btree ("legalEntityId");


--
-- Name: location_history_taskId_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "location_history_taskId_timestamp_idx" ON public.location_history USING btree ("taskId", "timestamp");


--
-- Name: location_history_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_history_timestamp_idx ON public.location_history USING btree ("timestamp");


--
-- Name: location_history_userId_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "location_history_userId_timestamp_idx" ON public.location_history USING btree ("userId", "timestamp");


--
-- Name: messages_conversationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_conversationId_createdAt_idx" ON public.messages USING btree ("conversationId", "createdAt");


--
-- Name: module_prices_configId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "module_prices_configId_idx" ON public.module_prices USING btree ("configId");


--
-- Name: notification_deliveries_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_deliveries_channel_status_idx ON public.notification_deliveries USING btree (channel, status);


--
-- Name: notification_deliveries_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_createdAt_idx" ON public.notification_deliveries USING btree ("createdAt");


--
-- Name: notification_deliveries_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_eventType_idx" ON public.notification_deliveries USING btree ("eventType");


--
-- Name: notification_deliveries_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_organizationId_createdAt_idx" ON public.notification_deliveries USING btree ("organizationId", "createdAt");


--
-- Name: notification_deliveries_recipientId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_recipientId_createdAt_idx" ON public.notification_deliveries USING btree ("recipientId", "createdAt");


--
-- Name: notification_deliveries_recipientId_readAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_recipientId_readAt_idx" ON public.notification_deliveries USING btree ("recipientId", "readAt");


--
-- Name: notification_watches_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_watches_organizationId_idx" ON public.notification_watches USING btree ("organizationId");


--
-- Name: notification_watches_subjectUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_watches_subjectUserId_idx" ON public.notification_watches USING btree ("subjectUserId");


--
-- Name: notification_watches_subjectUserId_watcherUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notification_watches_subjectUserId_watcherUserId_key" ON public.notification_watches USING btree ("subjectUserId", "watcherUserId");


--
-- Name: notification_watches_watcherUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_watches_watcherUserId_idx" ON public.notification_watches USING btree ("watcherUserId");


--
-- Name: organization_access_granteeOrgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_access_granteeOrgId_idx" ON public.organization_access USING btree ("granteeOrgId");


--
-- Name: organization_access_grantorOrgId_granteeOrgId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_access_grantorOrgId_granteeOrgId_key" ON public.organization_access USING btree ("grantorOrgId", "granteeOrgId");


--
-- Name: organization_access_grantorOrgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_access_grantorOrgId_idx" ON public.organization_access USING btree ("grantorOrgId");


--
-- Name: organizations_addOns_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organizations_addOns_idx" ON public.organizations USING gin ("addOns");


--
-- Name: organizations_agreed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_agreed_idx ON public.organizations USING btree ("agreedMonthlyCents") WHERE ("agreedMonthlyCents" IS NOT NULL);


--
-- Name: organizations_billingMode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organizations_billingMode_idx" ON public.organizations USING btree ("billingMode");


--
-- Name: organizations_joinCodeHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organizations_joinCodeHash_key" ON public.organizations USING btree ("joinCodeHash");


--
-- Name: organizations_ownerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organizations_ownerId_key" ON public.organizations USING btree ("ownerId");


--
-- Name: organizations_stripeCustomerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON public.organizations USING btree ("stripeCustomerId");


--
-- Name: organizations_supportTeamId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organizations_supportTeamId_idx" ON public.organizations USING btree ("supportTeamId");


--
-- Name: overtime_requests_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "overtime_requests_organizationId_status_idx" ON public.overtime_requests USING btree ("organizationId", status);


--
-- Name: overtime_requests_status_approvalTimeoutAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "overtime_requests_status_approvalTimeoutAt_idx" ON public.overtime_requests USING btree (status, "approvalTimeoutAt");


--
-- Name: overtime_requests_status_technicianTimeoutAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "overtime_requests_status_technicianTimeoutAt_idx" ON public.overtime_requests USING btree (status, "technicianTimeoutAt");


--
-- Name: overtime_requests_technicianId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "overtime_requests_technicianId_status_idx" ON public.overtime_requests USING btree ("technicianId", status);


--
-- Name: overtime_requests_timeEntryId_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "overtime_requests_timeEntryId_cycle_idx" ON public.overtime_requests USING btree ("timeEntryId", cycle);


--
-- Name: parts_used_reportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "parts_used_reportId_idx" ON public.parts_used USING btree ("reportId");


--
-- Name: password_reset_tokens_tokenHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "password_reset_tokens_tokenHash_idx" ON public.password_reset_tokens USING btree ("tokenHash");


--
-- Name: password_reset_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON public.password_reset_tokens USING btree ("tokenHash");


--
-- Name: password_reset_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "password_reset_tokens_userId_idx" ON public.password_reset_tokens USING btree ("userId");


--
-- Name: phases_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "phases_organizationId_idx" ON public.phases USING btree ("organizationId");


--
-- Name: phases_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "phases_spaceId_idx" ON public.phases USING btree ("spaceId");


--
-- Name: platform_audit_logs_actorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "platform_audit_logs_actorId_createdAt_idx" ON public.platform_audit_logs USING btree ("actorId", "createdAt");


--
-- Name: platform_audit_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "platform_audit_logs_createdAt_idx" ON public.platform_audit_logs USING btree ("createdAt");


--
-- Name: platform_audit_logs_targetOrganizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "platform_audit_logs_targetOrganizationId_createdAt_idx" ON public.platform_audit_logs USING btree ("targetOrganizationId", "createdAt");


--
-- Name: platform_users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_users_email_key ON public.platform_users USING btree (email);


--
-- Name: portals_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "portals_organizationId_isActive_idx" ON public.portals USING btree ("organizationId", "isActive");


--
-- Name: pricing_configs_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_configs_version_key ON public.pricing_configs USING btree (version);


--
-- Name: rate_history_organizationId_target_targetId_kind_effectiveF_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rate_history_organizationId_target_targetId_kind_effectiveF_idx" ON public.rate_history USING btree ("organizationId", target, "targetId", kind, "effectiveFrom");


--
-- Name: recurring_task_templates_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recurring_task_templates_customerId_idx" ON public.recurring_task_templates USING btree ("customerId");


--
-- Name: recurring_task_templates_nextRunAt_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recurring_task_templates_nextRunAt_isActive_idx" ON public.recurring_task_templates USING btree ("nextRunAt", "isActive");


--
-- Name: recurring_task_templates_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recurring_task_templates_organizationId_idx" ON public.recurring_task_templates USING btree ("organizationId");


--
-- Name: recurring_task_templates_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recurring_task_templates_spaceId_idx" ON public.recurring_task_templates USING btree ("spaceId");


--
-- Name: recurring_task_templates_workflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "recurring_task_templates_workflowId_idx" ON public.recurring_task_templates USING btree ("workflowId");


--
-- Name: refresh_tokens_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_expiresAt_idx" ON public.refresh_tokens USING btree ("expiresAt");


--
-- Name: refresh_tokens_tokenHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_tokenHash_idx" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: refresh_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: refresh_tokens_usedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_usedAt_idx" ON public.refresh_tokens USING btree ("usedAt");


--
-- Name: refresh_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_userId_idx" ON public.refresh_tokens USING btree ("userId");


--
-- Name: report_attachments_reportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_attachments_reportId_idx" ON public.report_attachments USING btree ("reportId");


--
-- Name: report_definitions_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_definitions_organizationId_createdAt_idx" ON public.report_definitions USING btree ("organizationId", "createdAt");


--
-- Name: report_schedules_isActive_nextRunAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_schedules_isActive_nextRunAt_idx" ON public.report_schedules USING btree ("isActive", "nextRunAt");


--
-- Name: report_schedules_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_schedules_organizationId_idx" ON public.report_schedules USING btree ("organizationId");


--
-- Name: report_schedules_reportDefinitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "report_schedules_reportDefinitionId_idx" ON public.report_schedules USING btree ("reportDefinitionId");


--
-- Name: roles_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "roles_organizationId_idx" ON public.roles USING btree ("organizationId");


--
-- Name: roles_organizationId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "roles_organizationId_slug_key" ON public.roles USING btree ("organizationId", slug);


--
-- Name: schedule_templates_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "schedule_templates_organizationId_idx" ON public.schedule_templates USING btree ("organizationId");


--
-- Name: schedule_templates_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "schedule_templates_organizationId_name_key" ON public.schedule_templates USING btree ("organizationId", name);


--
-- Name: seat_prices_configId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seat_prices_configId_idx" ON public.seat_prices USING btree ("configId");


--
-- Name: service_reports_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_assetId_idx" ON public.service_reports USING btree ("assetId");


--
-- Name: service_reports_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_completedAt_idx" ON public.service_reports USING btree ("completedAt");


--
-- Name: service_reports_completedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_completedById_idx" ON public.service_reports USING btree ("completedById");


--
-- Name: service_reports_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_customerId_idx" ON public.service_reports USING btree ("customerId");


--
-- Name: service_reports_organizationId_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_organizationId_completedAt_idx" ON public.service_reports USING btree ("organizationId", "completedAt");


--
-- Name: service_reports_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_reports_taskId_idx" ON public.service_reports USING btree ("taskId");


--
-- Name: service_reports_taskId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "service_reports_taskId_key" ON public.service_reports USING btree ("taskId");


--
-- Name: shift_assignments_isActive_effectiveFrom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_assignments_isActive_effectiveFrom_idx" ON public.shift_assignments USING btree ("isActive", "effectiveFrom");


--
-- Name: shift_assignments_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_assignments_organizationId_idx" ON public.shift_assignments USING btree ("organizationId");


--
-- Name: shift_assignments_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_assignments_spaceId_idx" ON public.shift_assignments USING btree ("spaceId");


--
-- Name: shift_assignments_userId_spaceId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_assignments_userId_spaceId_isActive_idx" ON public.shift_assignments USING btree ("userId", "spaceId", "isActive");


--
-- Name: shift_instances_organizationId_expectedClockInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_instances_organizationId_expectedClockInAt_idx" ON public.shift_instances USING btree ("organizationId", "expectedClockInAt");


--
-- Name: shift_instances_organizationId_spaceId_localDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_instances_organizationId_spaceId_localDate_idx" ON public.shift_instances USING btree ("organizationId", "spaceId", "localDate");


--
-- Name: shift_instances_state_nextRemindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_instances_state_nextRemindAt_idx" ON public.shift_instances USING btree (state, "nextRemindAt");


--
-- Name: shift_instances_userId_localDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_instances_userId_localDate_idx" ON public.shift_instances USING btree ("userId", "localDate");


--
-- Name: shift_instances_userId_spaceId_shiftId_localDate_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "shift_instances_userId_spaceId_shiftId_localDate_key" ON public.shift_instances USING btree ("userId", "spaceId", "shiftId", "localDate");


--
-- Name: shift_issue_events_issueId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_issue_events_issueId_at_idx" ON public.shift_issue_events USING btree ("issueId", at);


--
-- Name: shift_issues_assignedToId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_issues_assignedToId_idx" ON public.shift_issues USING btree ("assignedToId");


--
-- Name: shift_issues_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_issues_organizationId_status_idx" ON public.shift_issues USING btree ("organizationId", status);


--
-- Name: shift_issues_reportedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shift_issues_reportedById_idx" ON public.shift_issues USING btree ("reportedById");


--
-- Name: shifts_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shifts_organizationId_idx" ON public.shifts USING btree ("organizationId");


--
-- Name: shifts_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "shifts_spaceId_idx" ON public.shifts USING btree ("spaceId");


--
-- Name: space_assignments_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_assignments_organizationId_idx" ON public.space_assignments USING btree ("organizationId");


--
-- Name: space_assignments_roleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_assignments_roleId_idx" ON public.space_assignments USING btree ("roleId");


--
-- Name: space_assignments_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_assignments_spaceId_idx" ON public.space_assignments USING btree ("spaceId");


--
-- Name: space_assignments_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_assignments_userId_idx" ON public.space_assignments USING btree ("userId");


--
-- Name: space_assignments_userId_spaceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "space_assignments_userId_spaceId_key" ON public.space_assignments USING btree ("userId", "spaceId");


--
-- Name: space_assignments_workRoleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_assignments_workRoleId_idx" ON public.space_assignments USING btree ("workRoleId");


--
-- Name: space_share_requests_guestOrgId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_share_requests_guestOrgId_status_idx" ON public.space_share_requests USING btree ("guestOrgId", status);


--
-- Name: space_share_requests_shareId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_share_requests_shareId_idx" ON public.space_share_requests USING btree ("shareId");


--
-- Name: space_share_requests_spaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_share_requests_spaceId_status_idx" ON public.space_share_requests USING btree ("spaceId", status);


--
-- Name: space_shares_guestOrgId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_shares_guestOrgId_status_idx" ON public.space_shares USING btree ("guestOrgId", status);


--
-- Name: space_shares_ownerOrgId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_shares_ownerOrgId_status_idx" ON public.space_shares USING btree ("ownerOrgId", status);


--
-- Name: space_shares_spaceId_guestOrgId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "space_shares_spaceId_guestOrgId_key" ON public.space_shares USING btree ("spaceId", "guestOrgId");


--
-- Name: space_shares_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_shares_spaceId_idx" ON public.space_shares USING btree ("spaceId");


--
-- Name: space_workflows_one_default_per_space; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX space_workflows_one_default_per_space ON public.space_workflows USING btree ("spaceId") WHERE "isDefault";


--
-- Name: space_workflows_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_workflows_spaceId_idx" ON public.space_workflows USING btree ("spaceId");


--
-- Name: space_workflows_spaceId_workflowId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "space_workflows_spaceId_workflowId_key" ON public.space_workflows USING btree ("spaceId", "workflowId");


--
-- Name: space_workflows_workflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "space_workflows_workflowId_idx" ON public.space_workflows USING btree ("workflowId");


--
-- Name: sprint_reports_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sprint_reports_organizationId_idx" ON public.sprint_reports USING btree ("organizationId");


--
-- Name: sprint_reports_sprintId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "sprint_reports_sprintId_key" ON public.sprint_reports USING btree ("sprintId");


--
-- Name: sprints_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sprints_organizationId_status_idx" ON public.sprints USING btree ("organizationId", status);


--
-- Name: sprints_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sprints_spaceId_idx" ON public.sprints USING btree ("spaceId");


--
-- Name: status_workflows_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "status_workflows_organizationId_idx" ON public.status_workflows USING btree ("organizationId");


--
-- Name: status_workflows_ownerSpaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "status_workflows_ownerSpaceId_idx" ON public.status_workflows USING btree ("ownerSpaceId");


--
-- Name: subscriptions_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON public.subscriptions USING btree ("organizationId");


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: subscriptions_stripeSubscriptionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON public.subscriptions USING btree ("stripeSubscriptionId");


--
-- Name: support_messages_ticketId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_messages_ticketId_createdAt_idx" ON public.support_messages USING btree ("ticketId", "createdAt");


--
-- Name: support_routing_rules_isActive_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_routing_rules_isActive_order_idx" ON public.support_routing_rules USING btree ("isActive", "order");


--
-- Name: support_team_members_platformUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_team_members_platformUserId_idx" ON public.support_team_members USING btree ("platformUserId");


--
-- Name: support_team_members_teamId_platformUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "support_team_members_teamId_platformUserId_key" ON public.support_team_members USING btree ("teamId", "platformUserId");


--
-- Name: support_tickets_assignedAgentId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_assignedAgentId_status_idx" ON public.support_tickets USING btree ("assignedAgentId", status);


--
-- Name: support_tickets_assignedTeamId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_assignedTeamId_status_idx" ON public.support_tickets USING btree ("assignedTeamId", status);


--
-- Name: support_tickets_createdById_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_createdById_updatedAt_idx" ON public.support_tickets USING btree ("createdById", "updatedAt");


--
-- Name: support_tickets_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_organizationId_status_idx" ON public.support_tickets USING btree ("organizationId", status);


--
-- Name: support_tickets_slaBreached_slaFirstResponseDueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_slaBreached_slaFirstResponseDueAt_idx" ON public.support_tickets USING btree ("slaBreached", "slaFirstResponseDueAt");


--
-- Name: support_tickets_status_priority_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_status_priority_createdAt_idx" ON public.support_tickets USING btree (status, priority, "createdAt");


--
-- Name: sync_tombstones_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sync_tombstones_deletedAt_idx" ON public.sync_tombstones USING btree ("deletedAt");


--
-- Name: sync_tombstones_org_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sync_tombstones_org_deletedAt_idx" ON public.sync_tombstones USING btree ("organizationId", "deletedAt");


--
-- Name: sync_tombstones_parent_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sync_tombstones_parent_deletedAt_idx" ON public.sync_tombstones USING btree ("parentId", "deletedAt");


--
-- Name: sync_tombstones_user_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sync_tombstones_user_deletedAt_idx" ON public.sync_tombstones USING btree ("userId", "deletedAt");


--
-- Name: task_assignees_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_assignees_taskId_idx" ON public.task_assignees USING btree ("taskId");


--
-- Name: task_assignees_taskId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "task_assignees_taskId_userId_key" ON public.task_assignees USING btree ("taskId", "userId");


--
-- Name: task_assignees_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_assignees_userId_idx" ON public.task_assignees USING btree ("userId");


--
-- Name: task_dependencies_predecessorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_dependencies_predecessorId_idx" ON public.task_dependencies USING btree ("predecessorId");


--
-- Name: task_dependencies_predecessorId_successorId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "task_dependencies_predecessorId_successorId_key" ON public.task_dependencies USING btree ("predecessorId", "successorId");


--
-- Name: task_dependencies_successorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_dependencies_successorId_idx" ON public.task_dependencies USING btree ("successorId");


--
-- Name: task_events_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_events_createdAt_idx" ON public.task_events USING btree ("createdAt");


--
-- Name: task_events_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_events_eventType_idx" ON public.task_events USING btree ("eventType");


--
-- Name: task_events_taskId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_events_taskId_createdAt_idx" ON public.task_events USING btree ("taskId", "createdAt");


--
-- Name: task_events_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_events_userId_createdAt_idx" ON public.task_events USING btree ("userId", "createdAt");


--
-- Name: task_handovers_taskId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_handovers_taskId_createdAt_idx" ON public.task_handovers USING btree ("taskId", "createdAt");


--
-- Name: task_step_submissions_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_step_submissions_organizationId_idx" ON public.task_step_submissions USING btree ("organizationId");


--
-- Name: task_step_submissions_taskId_submittedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_step_submissions_taskId_submittedAt_idx" ON public.task_step_submissions USING btree ("taskId", "submittedAt");


--
-- Name: tasks_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_assetId_idx" ON public.tasks USING btree ("assetId");


--
-- Name: tasks_assignedToId_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_assignedToId_dueDate_idx" ON public.tasks USING btree ("assignedToId", "dueDate");


--
-- Name: tasks_assignedToId_status_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_assignedToId_status_updatedAt_idx" ON public.tasks USING btree ("assignedToId", status, "updatedAt");


--
-- Name: tasks_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_createdAt_idx" ON public.tasks USING btree ("createdAt");


--
-- Name: tasks_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_createdById_idx" ON public.tasks USING btree ("createdById");


--
-- Name: tasks_customerId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_customerId_createdAt_idx" ON public.tasks USING btree ("customerId", "createdAt");


--
-- Name: tasks_departure_sweep_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_departure_sweep_idx ON public.tasks USING btree ("dueDate") WHERE (("departureNotifiedAt" IS NULL) AND ("assignedToId" IS NOT NULL));


--
-- Name: tasks_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_dueDate_idx" ON public.tasks USING btree ("dueDate");


--
-- Name: tasks_epicId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_epicId_idx" ON public.tasks USING btree ("epicId");


--
-- Name: tasks_handoverDueById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_handoverDueById_idx" ON public.tasks USING btree ("handoverDueById");


--
-- Name: tasks_openRoleId_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_openRoleId_spaceId_idx" ON public.tasks USING btree ("openRoleId", "spaceId");


--
-- Name: tasks_organizationId_source_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_organizationId_source_createdAt_idx" ON public.tasks USING btree ("organizationId", source, "createdAt");


--
-- Name: tasks_organizationId_source_triaged_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_organizationId_source_triaged_idx" ON public.tasks USING btree ("organizationId", source, triaged);


--
-- Name: tasks_organizationId_spaceId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_organizationId_spaceId_status_idx" ON public.tasks USING btree ("organizationId", "spaceId", status);


--
-- Name: tasks_organizationId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_organizationId_status_createdAt_idx" ON public.tasks USING btree ("organizationId", status, "createdAt");


--
-- Name: tasks_organizationId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_organizationId_updatedAt_idx" ON public.tasks USING btree ("organizationId", "updatedAt");


--
-- Name: tasks_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_parentId_idx" ON public.tasks USING btree ("parentId");


--
-- Name: tasks_pausedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_pausedById_idx" ON public.tasks USING btree ("pausedById");


--
-- Name: tasks_phaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_phaseId_idx" ON public.tasks USING btree ("phaseId");


--
-- Name: tasks_spaceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_spaceId_idx" ON public.tasks USING btree ("spaceId");


--
-- Name: tasks_sprintId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_sprintId_idx" ON public.tasks USING btree ("sprintId");


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: tasks_unitId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_unitId_idx" ON public.tasks USING btree ("unitId");


--
-- Name: tasks_workflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_workflowId_idx" ON public.tasks USING btree ("workflowId");


--
-- Name: technician_schedules_dayOfWeek_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "technician_schedules_dayOfWeek_isActive_idx" ON public.technician_schedules USING btree ("dayOfWeek", "isActive");


--
-- Name: technician_schedules_technicianId_dayOfWeek_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "technician_schedules_technicianId_dayOfWeek_key" ON public.technician_schedules USING btree ("technicianId", "dayOfWeek");


--
-- Name: technician_schedules_technicianId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "technician_schedules_technicianId_idx" ON public.technician_schedules USING btree ("technicianId");


--
-- Name: time_entries_approvalStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_approvalStatus_idx" ON public.time_entries USING btree ("approvalStatus");


--
-- Name: time_entries_locationId_clockInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_locationId_clockInAt_idx" ON public.time_entries USING btree ("locationId", "clockInAt");


--
-- Name: time_entries_one_open_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX time_entries_one_open_per_user ON public.time_entries USING btree ("userId") WHERE (status = 'CLOCKED_IN'::public."TimeEntryStatus");


--
-- Name: time_entries_open_expected_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_open_expected_end ON public.time_entries USING btree ("expectedClockOutAt") WHERE ((status = 'CLOCKED_IN'::public."TimeEntryStatus") AND ("expectedClockOutAt" IS NOT NULL));


--
-- Name: time_entries_open_unplanned_since; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_open_unplanned_since ON public.time_entries USING btree ("clockInAt") WHERE ((status = 'CLOCKED_IN'::public."TimeEntryStatus") AND ("expectedClockOutAt" IS NULL));


--
-- Name: time_entries_organizationId_approvalStatus_clockInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_organizationId_approvalStatus_clockInAt_idx" ON public.time_entries USING btree ("organizationId", "approvalStatus", "clockInAt");


--
-- Name: time_entries_organizationId_clockInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_organizationId_clockInAt_idx" ON public.time_entries USING btree ("organizationId", "clockInAt");


--
-- Name: time_entries_organizationId_reminderState_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_organizationId_reminderState_idx" ON public.time_entries USING btree ("organizationId", "reminderState");


--
-- Name: time_entries_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_organizationId_status_idx" ON public.time_entries USING btree ("organizationId", status);


--
-- Name: time_entries_provisional_by_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_provisional_by_user ON public.time_entries USING btree ("userId", "clockOutAt") WHERE ("clockOutProvisional" = true);


--
-- Name: time_entries_status_nextBreakRemindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_status_nextBreakRemindAt_idx" ON public.time_entries USING btree (status, "nextBreakRemindAt");


--
-- Name: time_entries_status_nextRemindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_status_nextRemindAt_idx" ON public.time_entries USING btree (status, "nextRemindAt");


--
-- Name: time_entries_userId_clockInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_userId_clockInAt_idx" ON public.time_entries USING btree ("userId", "clockInAt");


--
-- Name: time_entries_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_userId_status_idx" ON public.time_entries USING btree ("userId", status);


--
-- Name: time_entries_userId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entries_userId_updatedAt_idx" ON public.time_entries USING btree ("userId", "updatedAt");


--
-- Name: time_entry_note_attachments_noteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entry_note_attachments_noteId_idx" ON public.time_entry_note_attachments USING btree ("noteId");


--
-- Name: time_entry_notes_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entry_notes_organizationId_idx" ON public.time_entry_notes USING btree ("organizationId");


--
-- Name: time_entry_notes_timeEntryId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entry_notes_timeEntryId_at_idx" ON public.time_entry_notes USING btree ("timeEntryId", at);


--
-- Name: time_entry_presence_timeEntryId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_entry_presence_timeEntryId_at_idx" ON public.time_entry_presence USING btree ("timeEntryId", at);


--
-- Name: time_off_requests_approvedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_off_requests_approvedById_idx" ON public.time_off_requests USING btree ("approvedById");


--
-- Name: time_off_requests_startDate_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_off_requests_startDate_endDate_idx" ON public.time_off_requests USING btree ("startDate", "endDate");


--
-- Name: time_off_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_off_requests_status_idx ON public.time_off_requests USING btree (status);


--
-- Name: time_off_requests_technicianId_status_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_off_requests_technicianId_status_startDate_idx" ON public.time_off_requests USING btree ("technicianId", status, "startDate");


--
-- Name: time_off_requests_technicianId_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_off_requests_technicianId_type_status_idx" ON public.time_off_requests USING btree ("technicianId", type, status);


--
-- Name: unit_activities_unitId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "unit_activities_unitId_createdAt_idx" ON public.unit_activities USING btree ("unitId", "createdAt");


--
-- Name: user_push_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_push_tokens_token_idx ON public.user_push_tokens USING btree (token);


--
-- Name: user_push_tokens_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_push_tokens_token_key ON public.user_push_tokens USING btree (token);


--
-- Name: user_push_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_push_tokens_userId_idx" ON public.user_push_tokens USING btree ("userId");


--
-- Name: users_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_assetId_idx" ON public.users USING btree ("assetId");


--
-- Name: users_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_customerId_idx" ON public.users USING btree ("customerId");


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_memberRoleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_memberRoleId_idx" ON public.users USING btree ("memberRoleId");


--
-- Name: users_organizationId_lastAppVersion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_organizationId_lastAppVersion_idx" ON public.users USING btree ("organizationId", "lastAppVersion");


--
-- Name: users_organizationId_role_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_organizationId_role_isActive_idx" ON public.users USING btree ("organizationId", role, "isActive");


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: worker_last_locations_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "worker_last_locations_userId_key" ON public.worker_last_locations USING btree ("userId");


--
-- Name: workflow_statuses_workflowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "workflow_statuses_workflowId_idx" ON public.workflow_statuses USING btree ("workflowId");


--
-- Name: workflow_statuses_workflowId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "workflow_statuses_workflowId_key_key" ON public.workflow_statuses USING btree ("workflowId", key);


--
-- Name: workflow_templates_isPublished_industry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "workflow_templates_isPublished_industry_idx" ON public.workflow_templates USING btree ("isPublished", industry);


--
-- Name: workflow_templates_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workflow_templates_slug_key ON public.workflow_templates USING btree (slug);


--
-- Name: workflow_templates_sourceKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "workflow_templates_sourceKey_key" ON public.workflow_templates USING btree ("sourceKey");


--
-- Name: platform_audit_logs platform_audit_logs_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_audit_logs_no_update BEFORE DELETE OR UPDATE ON public.platform_audit_logs FOR EACH ROW EXECUTE FUNCTION public.platform_audit_logs_append_only();


--
-- Name: attachments sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: breaks sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.breaks FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: comments sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: company_locations sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.company_locations FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: report_attachments sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.report_attachments FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: service_reports sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.service_reports FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: shift_instances sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.shift_instances FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: space_assignments sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.space_assignments FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: task_assignees sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: tasks sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: time_entries sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: time_entry_note_attachments sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.time_entry_note_attachments FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: time_entry_notes sync_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_tombstone AFTER DELETE ON public.time_entry_notes FOR EACH ROW EXECUTE FUNCTION public.sync_record_tombstone();


--
-- Name: activity_logs activity_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_targetUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT "activity_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: activity_logs activity_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: alerts alerts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: alerts alerts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: asset_activities asset_activities_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_activities
    ADD CONSTRAINT "asset_activities_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_categories asset_categories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_categories asset_categories_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_custody asset_custody_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_custody
    ADD CONSTRAINT "asset_custody_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_holders asset_holders_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_holders
    ADD CONSTRAINT "asset_holders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_holders asset_holders_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_holders
    ADD CONSTRAINT "asset_holders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_list_rows asset_list_rows_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_list_rows
    ADD CONSTRAINT "asset_list_rows_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_list_rows asset_list_rows_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_list_rows
    ADD CONSTRAINT "asset_list_rows_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.asset_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_log_reminders asset_log_reminders_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_log_reminders
    ADD CONSTRAINT "asset_log_reminders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_money asset_money_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_money
    ADD CONSTRAINT "asset_money_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_types asset_types_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT "asset_types_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.asset_categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assets assets_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.asset_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assets assets_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT "assets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assets assets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assets assets_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT "assets_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public.asset_types(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attachments attachments_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachments attachments_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_alerts billing_alerts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT "billing_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: billing_events billing_events_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT "billing_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: break_rules break_rules_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.break_rules
    ADD CONSTRAINT "break_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: break_rules break_rules_shiftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.break_rules
    ADD CONSTRAINT "break_rules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES public.shifts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: break_rules break_rules_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.break_rules
    ADD CONSTRAINT "break_rules_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: breaks breaks_addedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breaks
    ADD CONSTRAINT "breaks_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: breaks breaks_timeEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breaks
    ADD CONSTRAINT "breaks_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_attendees calendar_attendees_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_attendees
    ADD CONSTRAINT "calendar_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public.calendar_events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_attendees calendar_attendees_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_attendees
    ADD CONSTRAINT "calendar_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_placeSpaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_placeSpaceId_fkey" FOREIGN KEY ("placeSpaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: calendar_feed_tokens calendar_feed_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feed_tokens
    ADD CONSTRAINT "calendar_feed_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_holidays calendar_holidays_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT "calendar_holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_holidays calendar_holidays_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT "calendar_holidays_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: checklist_items checklist_items_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items
    ADD CONSTRAINT "checklist_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: checklist_items checklist_items_completedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items
    ADD CONSTRAINT "checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: checklist_items checklist_items_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items
    ADD CONSTRAINT "checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: company_locations company_locations_legalEntityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_locations
    ADD CONSTRAINT "company_locations_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES public.legal_entities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: company_locations company_locations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_locations
    ADD CONSTRAINT "company_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: company_locations company_locations_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_locations
    ADD CONSTRAINT "company_locations_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: conversation_members conversation_members_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT "conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversation_members conversation_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT "conversation_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversations conversations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_field_definitions custom_field_definitions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT "custom_field_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_field_definitions custom_field_definitions_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT "custom_field_definitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_field_values custom_field_values_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT "custom_field_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.custom_field_definitions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: custom_field_values custom_field_values_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT "custom_field_values_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_activities customer_activities_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_activities
    ADD CONSTRAINT "customer_activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_contacts customer_contacts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT "customer_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_contacts customer_contacts_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT "customer_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_sign_links customer_sign_links_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sign_links
    ADD CONSTRAINT "customer_sign_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customer_sign_links customer_sign_links_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sign_links
    ADD CONSTRAINT "customer_sign_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_units customer_units_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_units
    ADD CONSTRAINT "customer_units_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customer_units customer_units_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_units
    ADD CONSTRAINT "customer_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_units customer_units_portalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_units
    ADD CONSTRAINT "customer_units_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES public.portals(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customer_units customer_units_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_units
    ADD CONSTRAINT "customer_units_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customers customers_legalEntityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "customers_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES public.legal_entities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customers customers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customers customers_portalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "customers_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES public.portals(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: customers customers_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "customers_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: daily_metrics daily_metrics_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metrics
    ADD CONSTRAINT "daily_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: definition_of_done definition_of_done_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.definition_of_done
    ADD CONSTRAINT "definition_of_done_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: device_keys device_keys_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_keys
    ADD CONSTRAINT "device_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_events document_events_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT "document_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_events document_events_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT "document_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_signatures document_signatures_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT "document_signatures_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_signatures document_signatures_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT "document_signatures_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_signatures document_signatures_signerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT "document_signatures_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES public.document_signers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_signatures document_signatures_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signatures
    ADD CONSTRAINT "document_signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_signers document_signers_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT "document_signers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_signers document_signers_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT "document_signers_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_signers document_signers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_signers
    ADD CONSTRAINT "document_signers_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_templates document_templates_appliesToRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT "document_templates_appliesToRoleId_fkey" FOREIGN KEY ("appliesToRoleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_templates document_templates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT "document_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_templates document_templates_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT "document_templates_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public.document_types(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_types document_types_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT "document_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_issuedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_supersedesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.document_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public.document_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: epics epics_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT "epics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: epics epics_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT "epics_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: geofence_excursions geofence_excursions_timeEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_excursions
    ADD CONSTRAINT "geofence_excursions_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: intake_categories intake_categories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intake_categories
    ADD CONSTRAINT "intake_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: intake_categories intake_categories_portalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intake_categories
    ADD CONSTRAINT "intake_categories_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES public.portals(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: intake_categories intake_categories_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intake_categories
    ADD CONSTRAINT "intake_categories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invitations invitations_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT "invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invitations invitations_memberRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT "invitations_memberRoleId_fkey" FOREIGN KEY ("memberRoleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invitations invitations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoices invoices_legalEntityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES public.legal_entities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invoices invoices_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: join_requests join_requests_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT "join_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: join_requests join_requests_reviewedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT "join_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: join_requests join_requests_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT "join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: legal_entities legal_entities_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities
    ADD CONSTRAINT "legal_entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: legal_entity_bank_accounts legal_entity_bank_accounts_legalEntityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entity_bank_accounts
    ADD CONSTRAINT "legal_entity_bank_accounts_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES public.legal_entities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: location_history location_history_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT "location_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: location_history location_history_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT "location_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: module_prices module_prices_configId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_prices
    ADD CONSTRAINT "module_prices_configId_fkey" FOREIGN KEY ("configId") REFERENCES public.pricing_configs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT "notification_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_recipientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT "notification_deliveries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_watches notification_watches_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_watches
    ADD CONSTRAINT "notification_watches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_watches notification_watches_subjectUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_watches
    ADD CONSTRAINT "notification_watches_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_watches notification_watches_watcherUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_watches
    ADD CONSTRAINT "notification_watches_watcherUserId_fkey" FOREIGN KEY ("watcherUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_access organization_access_granteeOrgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_access
    ADD CONSTRAINT "organization_access_granteeOrgId_fkey" FOREIGN KEY ("granteeOrgId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_access organization_access_grantorOrgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_access
    ADD CONSTRAINT "organization_access_grantorOrgId_fkey" FOREIGN KEY ("grantorOrgId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organizations organizations_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: organizations organizations_supportTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_supportTeamId_fkey" FOREIGN KEY ("supportTeamId") REFERENCES public.support_teams(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: overtime_requests overtime_requests_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT "overtime_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: overtime_requests overtime_requests_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT "overtime_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: overtime_requests overtime_requests_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT "overtime_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: overtime_requests overtime_requests_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT "overtime_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: overtime_requests overtime_requests_timeEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT "overtime_requests_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: parts_used parts_used_reportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parts_used
    ADD CONSTRAINT "parts_used_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES public.service_reports(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: phases phases_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT "phases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: phases phases_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT "phases_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: portals portals_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portals
    ADD CONSTRAINT "portals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rate_history rate_history_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_history
    ADD CONSTRAINT "rate_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: recurring_task_templates recurring_task_templates_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT "recurring_task_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: recurring_task_templates recurring_task_templates_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT "recurring_task_templates_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT "recurring_task_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: recurring_task_templates recurring_task_templates_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT "recurring_task_templates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT "recurring_task_templates_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: report_attachments report_attachments_reportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_attachments
    ADD CONSTRAINT "report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES public.service_reports(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: report_definitions report_definitions_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_definitions
    ADD CONSTRAINT "report_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: report_definitions report_definitions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_definitions
    ADD CONSTRAINT "report_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: report_schedules report_schedules_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT "report_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: report_schedules report_schedules_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT "report_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: report_schedules report_schedules_reportDefinitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT "report_schedules_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES public.report_definitions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: roles roles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule_templates schedule_templates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT "schedule_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: seat_prices seat_prices_configId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_prices
    ADD CONSTRAINT "seat_prices_configId_fkey" FOREIGN KEY ("configId") REFERENCES public.pricing_configs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: service_reports service_reports_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT "service_reports_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_reports service_reports_completedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT "service_reports_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_reports service_reports_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT "service_reports_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_reports service_reports_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT "service_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_reports service_reports_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_reports
    ADD CONSTRAINT "service_reports_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT "shift_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_shiftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES public.shifts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT "shift_assignments_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT "shift_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shift_issue_events shift_issue_events_issueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_issue_events
    ADD CONSTRAINT "shift_issue_events_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES public.shift_issues(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shifts shifts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shifts shifts_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "shifts_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_assignments space_assignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT "space_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_assignments space_assignments_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT "space_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: space_assignments space_assignments_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT "space_assignments_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_assignments space_assignments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT "space_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_assignments space_assignments_workRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_assignments
    ADD CONSTRAINT "space_assignments_workRoleId_fkey" FOREIGN KEY ("workRoleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: space_share_requests space_share_requests_shareId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_share_requests
    ADD CONSTRAINT "space_share_requests_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES public.space_shares(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_workflows space_workflows_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_workflows
    ADD CONSTRAINT "space_workflows_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: space_workflows space_workflows_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_workflows
    ADD CONSTRAINT "space_workflows_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sprint_reports sprint_reports_sprintId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_reports
    ADD CONSTRAINT "sprint_reports_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES public.sprints(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sprints sprints_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT "sprints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sprints sprints_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT "sprints_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: status_workflows status_workflows_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_workflows
    ADD CONSTRAINT "status_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: status_workflows status_workflows_ownerSpaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_workflows
    ADD CONSTRAINT "status_workflows_ownerSpaceId_fkey" FOREIGN KEY ("ownerSpaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_routing_rules support_routing_rules_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_routing_rules
    ADD CONSTRAINT "support_routing_rules_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.support_teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_team_members support_team_members_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_team_members
    ADD CONSTRAINT "support_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.support_teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_tickets support_tickets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_assignees task_assignees_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_assignees task_assignees_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_predecessorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "task_dependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_successorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "task_dependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_events task_events_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT "task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_events task_events_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT "task_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: task_handovers task_handovers_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_handovers
    ADD CONSTRAINT "task_handovers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_handovers task_handovers_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_handovers
    ADD CONSTRAINT "task_handovers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: task_step_submissions task_step_submissions_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_step_submissions
    ADD CONSTRAINT "task_step_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tasks tasks_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tasks tasks_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_epicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES public.epics(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_openRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_openRoleId_fkey" FOREIGN KEY ("openRoleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tasks tasks_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tasks tasks_phaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES public.phases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_spaceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_sprintId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES public.sprints(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.customer_units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: technician_schedules technician_schedules_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technician_schedules
    ADD CONSTRAINT "technician_schedules_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entries time_entries_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: time_entries time_entries_editedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: time_entries time_entries_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public.company_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: time_entries time_entries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: time_entries time_entries_shiftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES public.shifts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: time_entries time_entries_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entry_note_attachments time_entry_note_attachments_noteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_note_attachments
    ADD CONSTRAINT "time_entry_note_attachments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES public.time_entry_notes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entry_notes time_entry_notes_timeEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_notes
    ADD CONSTRAINT "time_entry_notes_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_entry_presence time_entry_presence_timeEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry_presence
    ADD CONSTRAINT "time_entry_presence_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES public.time_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_off_requests time_off_requests_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_off_requests
    ADD CONSTRAINT "time_off_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: time_off_requests time_off_requests_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_off_requests
    ADD CONSTRAINT "time_off_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: unit_activities unit_activities_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_activities
    ADD CONSTRAINT "unit_activities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.customer_units(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_push_tokens user_push_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT "user_push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_employerEntityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_employerEntityId_fkey" FOREIGN KEY ("employerEntityId") REFERENCES public.legal_entities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_memberRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_memberRoleId_fkey" FOREIGN KEY ("memberRoleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.customer_units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: worker_last_locations worker_last_locations_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_last_locations
    ADD CONSTRAINT "worker_last_locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflow_statuses workflow_statuses_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_statuses
    ADD CONSTRAINT "workflow_statuses_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.status_workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

