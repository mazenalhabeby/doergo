---
title: GPS clock-in and geofencing, explained for field teams
description: How geofenced clock-in works, what it does and doesn't track, and how to introduce it without your team feeling surveilled.
date: 2026-08-18
author: HBCField Team
tags: attendance, gps, geofencing
---

"Clock in when you get there" is a simple rule that's surprisingly hard to enforce fairly. Paper timesheets get rounded generously. Phone-call check-ins interrupt everyone. And accusing someone of clocking in from the car park is unpleasant when you can't prove it either way.

Geofenced clock-in solves this with two ingredients: the phone's GPS position and a **geofence** — a circle drawn around each work location.

## How it works

1. The company defines its locations — an office, a warehouse, a client site — each with a radius, typically 40–100 meters.
2. When a worker taps **Clock in**, the app reads the phone's current position once.
3. The server checks the distance to the assigned location. Inside the fence, the clock-in is recorded and verified. Outside it, the app says so immediately — no ambiguity, no argument later.
4. Clock-out works the same way, and the worked time lands on a timesheet automatically.

The important detail is in step 2: a **single position reading at the moment of clock-in**, not a continuous track of the employee's day. That distinction decides whether your team accepts the system.

## What about workers on the road?

Fixed geofences fit fixed workplaces. Mobile crews — installers, service technicians driving job to job — need a different model, and a good platform supports both:

- **Job-based status** replaces the fixed fence: the technician marks themselves en route, then arrived, then working — each step time-stamped.
- **Route recording** runs only while en route to a job, capturing the actual driving path for mileage and proof of visit, and stops on arrival.
- **Hybrid workers** get both: geofenced clock-in at the depot, job tracking in the field.

## The privacy conversation you should have

GPS features fail more often on trust than on technology. Three practices keep the system fair:

**Be explicit about when location is read.** In HBCField, that's at clock-in/out, and while actively en route to a job. Not on breaks, not after clock-out, not at home. Put that sentence in your policy verbatim.

**Make the data visible to the person it's about.** A worker should be able to open their own attendance history and see exactly what the manager sees. Symmetry defuses most objections.

**Use it for payroll, not for gotchas.** The point of verified times is that honest people get paid accurately and disputes get settled by data. If the first use of the system is disciplinary, adoption is over.

## What teams actually get out of it

- **Payroll that matches reality.** Worked hours flow into timesheets without transcription, rounding, or "I forgot to write it down."
- **Fewer check-in calls.** The dispatcher's map answers "has anyone arrived at the site yet?" without a single phone call.
- **Evidence when it matters.** Customer disputes about visit times, insurance questions about who was on site — answered in seconds from the history.
- **No-show alerts.** When someone scheduled for a shift hasn't clocked in, the system notices before the customer does.

## Rolling it out

Start with one location and a generous fence — GPS accuracy varies, and a fence that's too tight generates false "you're not here" errors that poison trust in week one. Fifty meters is a sensible floor for urban sites. Expand once the first crew's timesheets have run smoothly for a couple of pay periods, and let that crew tell the next one how it actually feels day to day.
