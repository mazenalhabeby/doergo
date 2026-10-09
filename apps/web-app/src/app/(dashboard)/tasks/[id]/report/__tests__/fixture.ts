import type { TaskReport, TaskReportPerson } from "@hbcfield/shared/client"

/** An office report with every section filled — the shape task-service sends. */
export const ana: TaskReportPerson = { id: "u1", firstName: "Ana", lastName: "Berger" }
export const ben: TaskReportPerson = { id: "u2", firstName: "Ben", lastName: "Koller" }

const file = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, fileName: `${id}.jpg`, mimeType: "image/jpeg", fileSize: 120_000, url: `https://files.example.com/${id}.jpg?sig=1`, createdAt: at, by: ana, ...extra,
})

export function officeReport(): TaskReport {
  return {
    meta: { copy: "office", generatedAt: "2026-10-09T18:00:00.000Z", sections: [
      "header", "request", "work", "time", "photos", "checklist", "stepAnswers", "parts", "route", "history", "comments", "handovers", "documents", "details", "signatures",
    ], historyTruncated: false },
    header: {
      taskId: "task-1", reference: "#AB12CD", title: "Boiler service", status: "COMPLETED", priority: "HIGH",
      issuer: { name: "HBC GmbH", logoUrl: null, addressLines: ["Hauptstrasse 1", "4663 Laakirchen"], vatId: "ATU12345678", taxId: null, registerNumber: null, email: "office@hbc.example", phone: null, website: null },
      client: { id: "c1", name: "Müller & Söhne", type: "COMPANY", restricted: false, legalName: null, vatId: null, address: null, email: null, phone: null },
      contact: { name: "Eva Müller", role: null, phone: "+43 1", email: null },
      site: { address: "Ring 5, Wien", lat: 48.2, lng: 16.37 },
      unit: null,
      asset: { id: "a1", name: "Boiler B2", serialNumber: "SN-77", model: null, manufacturer: null, category: null, type: null },
      workspace: { id: "space-1", name: "Vienna", address: null, timezone: "Europe/Vienna" },
      createdAt: "2026-10-08T06:00:00.000Z", createdBy: ana,
      dueDate: "2026-10-09T07:00:00.000Z", startedAt: "2026-10-09T06:10:00.000Z", startedBy: { id: "u-mike", firstName: "Mike", lastName: "Weber" }, taskType: "Field Service", finishedAt: "2026-10-09T15:44:00.000Z",
      totalMinutes: 574, lead: ana, crew: [{ person: ana, role: "LEAD" }, { person: ben, role: "MEMBER" }],
      statuses: [
        { key: "IN_PROGRESS", name: "Working", color: "#f59e0b", isFinal: false, isCanceled: false },
        { key: "COMPLETED", name: "Done", color: "#16a34a", isFinal: true, isCanceled: false },
      ],
      currency: "EUR",
    },
    request: { description: "Boiler makes noise.", origin: { kind: "CUSTOMER_PORTAL", portalReference: "#AB12CD", recurringTemplate: null, parent: null } },
    work: { summary: "Replaced the pump.", workPerformed: "1. Drained the system\n2. Replaced the pump\n3. Refilled", customerName: "Eva Müller", completedAt: "2026-10-09T15:44:00.000Z", completedBy: ana },
    time: {
      asOf: "2026-10-09T18:00:00.000Z",
      total: { travel: 40, working: 500, blocked: 34 },
      byPerson: [{ person: ana, travel: 20, working: 300, blocked: 0 }, { person: ben, travel: 20, working: 200, blocked: 34 }],
      ownStops: [{ person: ben, at: "2026-10-09T10:00:00.000Z", reason: "Waiting for the secret part", resumedAt: "2026-10-09T10:34:00.000Z" }],
    },
    photos: [
      { ...file("p1", "2026-10-09T06:20:00.000Z"), source: "BEFORE", caption: "Old pump", statusKey: null, fieldLabel: null },
      { ...file("p2", "2026-10-09T15:30:00.000Z"), source: "AFTER", caption: "New pump", statusKey: null, fieldLabel: null },
      { ...file("p3", "2026-10-09T12:00:00.000Z"), source: "TASK", caption: null, statusKey: null, fieldLabel: null },
    ],
    checklist: [
      { id: "k1", text: "Check pressure", isCompleted: true, owner: ben, completedBy: ben, completedAt: "2026-10-09T09:00:00.000Z" },
      { id: "k2", text: "Clean filter", isCompleted: false, owner: null, completedBy: null, completedAt: null },
    ],
    stepAnswers: [{
      id: "s1", statusKey: "IN_PROGRESS", submittedAt: "2026-10-09T08:00:00.000Z", submittedBy: ana,
      fields: [
        { id: "f1", label: "Pressure (bar)", type: "number", value: 1.5, files: [] },
        { id: "f2", label: "Site photos", type: "photos", value: ["x1", "x2"], files: [file("x1", "2026-10-09T08:00:00.000Z"), file("x2", "2026-10-09T08:00:00.000Z")] },
      ],
    }],
    parts: [{ id: "pt1", name: "Pump P-200", partNumber: "P200", quantity: 1, notes: null, unitPrice: 240, lineTotal: 240 }],
    route: {
      distanceMeters: 12400, startedAt: "2026-10-09T06:10:00.000Z", endedAt: "2026-10-09T06:30:00.000Z", durationSeconds: 1200, pointCount: 3,
      points: [{ lat: 48.1, lng: 16.3, timestamp: "2026-10-09T06:10:00.000Z" }, { lat: 48.15, lng: 16.33, timestamp: "2026-10-09T06:20:00.000Z" }, { lat: 48.2, lng: 16.37, timestamp: "2026-10-09T06:30:00.000Z" }],
      matchedPath: null, arrivalDistanceMeters: 40,
    },
    history: [
      { id: "e1", type: "CREATED", at: "2026-10-08T21:30:00.000Z", actor: ana, refs: {}, data: {} },
      { id: "e2", type: "STATUS_CHANGED", at: "2026-10-09T06:10:00.000Z", actor: ana, refs: {}, data: { oldStatus: "ASSIGNED", newStatus: "IN_PROGRESS" } },
      { id: "e3", type: "COMMENT_ADDED", at: "2026-10-09T09:00:00.000Z", actor: ben, refs: {}, data: {} },
      { id: "e4", type: "STATUS_CHANGED", at: "2026-10-09T15:44:00.000Z", actor: ana, refs: {}, data: { oldStatus: "IN_PROGRESS", newStatus: "COMPLETED" } },
    ],
    comments: [{ id: "c1", content: "Internal: client was rude", createdAt: "2026-10-09T09:00:00.000Z", author: ben }],
    handovers: [{ id: "h1", note: "Left the old pump in the van", createdAt: "2026-10-09T15:40:00.000Z", author: ben, workedMinutes: 254 }],
    documents: [{ id: "d1", fileName: "manual.pdf", mimeType: "application/pdf", fileSize: 2_400_000, url: "https://files.example.com/d1.pdf", createdAt: "2026-10-09T07:00:00.000Z", by: ana }],
    details: [{ id: "cf1", name: "Boiler type", key: "boiler_type", type: "TEXT", value: "Gas" }],
    signatures: [
      { kind: "TECHNICIAN", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", url: null, name: "Ana Berger", person: ana, signedAt: "2026-10-09T15:44:00.000Z", statusKey: null, fieldLabel: null },
      { kind: "STEP", dataUrl: null, url: "https://files.example.com/sig.png", name: null, person: ana, signedAt: "2026-10-09T08:00:00.000Z", statusKey: "IN_PROGRESS", fieldLabel: "Supervisor" },
    ],
  }
}
