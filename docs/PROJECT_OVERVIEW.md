# HBCField — Project Overview

**HBCField** is a field-service and team management platform (SaaS). A company creates work, the office assigns it, the field worker does it on the phone, and everyone sees progress live.

- **Live:** https://hbcfield.com (web) · admin.hbcfield.com (operator) · iOS App Store + Google Play (1.0.6 live, 1.0.7 in progress)
- **Company:** HBC GmbH, Austria · Languages: English, German, Spanish, French, Italian

---

## Why a company needs it

Any company with people **out in the field** — technicians, installers, cleaners, drivers, facility and maintenance teams, sales reps — has the same problems:

- Work is handed out by phone calls, WhatsApp and paper, so jobs get lost or done twice.
- The office doesn't know **where people are**, whether they arrived, or when a job will be finished.
- Working hours are written by hand, so payroll is slow, disputed and hard to check.
- Proof of work (photos, signatures, parts used) is missing when the client asks or disputes an invoice.
- Clients, vehicles, equipment, contracts and staff documents live in five different tools or folders.
- Invoices go out late because nobody collected what was done.

HBCField replaces all of that with **one system: web for the office, an app for the field.**

## What the company gets

| Benefit | How |
|---|---|
| **Less time planning, fewer mistakes** | Create and assign jobs in seconds; the worker gets a push notification with address, details and checklist |
| **See everything live** | Live map, job status updating in real time, route history of every trip |
| **More jobs per day** | Route planner orders visits along real roads; less driving, less fuel |
| **Correct working hours** | GPS clock-in at the site, breaks and overtime rules applied automatically, ready for payroll |
| **Proof for every job** | Photos, signatures, parts and reports attached to the job — disputes end quickly |
| **Faster invoicing, faster cash** | Invoices built from the work actually done, sent as PDF in the client's language |
| **Happier clients** | Client portal to raise requests and follow progress without calling the office |
| **Everything in one place** | Clients (CRM), vehicles and equipment, expenses, staff documents and contracts, chat |
| **Always in control** | Roles and permissions per workspace, approvals, full audit log of who did what |
| **Works where the work is** | Phone app works offline, reads business cards, receipts and documents with the camera |
| **Pay only for what you use** | €9.99 per person, then switch on only the modules each site needs; 14-day free trial with everything |
| **Grows with the company** | One site or many, own staff plus clients' and partners' staff, 5 languages |

**In short:** less admin, fewer phone calls, no lost jobs, correct hours, proof of work, faster invoices — and the owner sees the whole business on one screen.

---

## 1. Who uses it

| Role | Where | What they do |
|---|---|---|
| **Admin** (owner) | Web + phone | Everything: tasks, members, billing, settings |
| **Manager / Dispatcher** | Web | Plans and assigns work, watches the live map, approves hours and leave |
| **Employee / Technician** | Phone | Does the jobs, clocks in/out, sends photos, reports, expenses |
| **External member** | Web | Client's or partner's staff: *Supervisor* (approves hours) or *Observer* (watches, raises jobs) |
| **Customer** | Client portal | A client of the company raising requests and following them |

Roles are editable per organization: permissions (create tasks, see all tasks, assign, manage users…) are granted **org-wide or per workspace**.

---

## 2. What the product does

- **Tasks & jobs** — create, assign, status flow (New → Assigned → En route → Arrived → In progress → Completed), custom workflows per workspace, comments, photos, attachments, checklists, subtasks, recurring tasks, appointment times.
- **Service reports** — work done, parts used, before/after photos, technician + customer signatures.
- **GPS tracking** — live map of the team, exact route recorded in the background, route planner that orders a day's visits along real roads.
- **Time & attendance** — clock in/out with geofence (circle or drawn boundary), planned breaks, overtime approval, working away from a site, counted time vs. actual time.
- **Schedules & leave** — weekly shifts, time-off requests with approval, a wallchart showing who covers whom.
- **Workspaces (spaces)** — each site/team/customer location is a workspace with its own modules, roles and members.
- **CRM** — clients, contact people, reminders, visits; a business-card scanner on the phone.
- **Assets** — vehicles/equipment, who holds what and when, expenses read from a photographed receipt, contracts that create the asset.
- **Documents (personnel file)** — contracts, payslips, licences; signing chain, verification, expiry read from the document, per-type visibility.
- **Invoicing** — invoices from work done, draft → issued → sent → paid, PDF in the client's language.
- **Client portal, chat (incl. between organizations), reports builder, audit log, push notifications, email.**
- **Offline mode on the phone** — built, rolling out per organization.

---

## 3. Pricing (module model)

```
bill = staff seats × €9.99  +  observer seats × €2
     + per workspace: modules (Tracking €25, Time Tracking €25, CRM €15, Assets €9 …) + usage ladders
     + org-wide Options (Workflows €29, Invoicing €19, Audit log €15 …)
```
14-day trial with everything on. Payment by card or invoice (Stripe), or a fixed agreed monthly price. VAT added on top.

---

## 4. How it is built

```
 Web app (Next.js)        Phone app (React Native / Expo)
          \                       /
           API Gateway (NestJS)  :4000/api/v1
     ┌──────────┬──────────┬───────────────┬──────────┐
  auth-service task-service notification   tracking-service
  (users,      (tasks,      (Socket.IO,     (GPS, routes)
   billing)     jobs queue)  push, email)
           PostgreSQL + PostGIS      Redis (cache, queues)
```

| Part | Tech |
|---|---|
| Web | Next.js 15, TypeScript, Tailwind + shadcn/ui, TanStack Query |
| Mobile | React Native + Expo SDK 54, EAS builds + over-the-air updates |
| Backend | NestJS microservices over Redis, BullMQ job queues |
| Database | PostgreSQL (Prisma ORM), Redis |
| Files | S3-compatible storage (Hetzner), presigned uploads |
| Maps | Google (geocoding, routes), MapTiler tiles |
| Payments | Stripe (cards, invoices, Stripe Tax) |
| Hosting | One Hetzner server, Docker Compose, nginx, Cloudflare in front, nightly backups to S3 |

Monorepo (pnpm): `apps/api/*` (services), `apps/web-app`, `apps/mobile`, `apps/admin-app`, `packages/shared` (types, rules, pricing, permissions shared by all).

---

## 5. Security

JWT access + rotating refresh tokens, bcrypt passwords, account lockout, rate limiting, per-workspace permission checks on the server, organizations isolated from each other, external members blocked from company property, documents refused with 404 (not 403) so nothing leaks, organization suspend switch.

---

## 6. Current status (2026-09-29)

- **Production:** `19bd61ec` — code cleanup + security upgrades, all services healthy.
- **iOS:** build 28 (1.0.7) fixes document/business-card scanning on iPhone (Apple Vision) — sent to App Store Connect for TestFlight testing.
- **Android:** 1.0.7 build waits for the EAS build quota (resets 1 Oct).
- **Open:** first real card payment, offline mode rollout, mobile route planner release.

Full technical reference: `CLAUDE.md` at the repository root.
