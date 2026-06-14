import type { AttendanceSummary } from "@/lib/api"

// ============================================================================
// TYPES
// ============================================================================

export interface ExportData {
  report: AttendanceSummary
  filteredByUser: AttendanceSummary["byUser"]
  filteredByLocation: AttendanceSummary["byLocation"]
  locationName?: string // "All Locations" or specific name
  orgName: string
}

// ============================================================================
// FILE NAMING (Industry standard: CompanyName_ReportType_DateRange.ext)
// ============================================================================

function getFileName(orgName: string, period: AttendanceSummary["period"], locationName: string | undefined, ext: string) {
  const start = period.startDate.replace(/\//g, "-")
  const end = period.endDate.replace(/\//g, "-")
  const sanitized = orgName.replace(/[^a-zA-Z0-9]/g, "_")
  const locSuffix = locationName ? `_${locationName.replace(/[^a-zA-Z0-9]/g, "_")}` : ""
  return `${sanitized}_Attendance${locSuffix}_${start}_to_${end}.${ext}`
}

// ============================================================================
// CSV EXPORT (Client-side, instant)
// ============================================================================

export function exportCSV({ report, filteredByUser, filteredByLocation, locationName, orgName }: ExportData) {
  const headers = [
    "Employee Name",
    "Email",
    "Total Hours",
    "Shifts",
    "Avg Shift (h)",
    "Auto Clock-Outs",
    "Locations",
  ]

  const rows = filteredByUser.map((u) => [
    `"${u.user.firstName} ${u.user.lastName}"`,
    u.user.email,
    u.totalHours,
    u.shifts,
    u.averageShiftHours,
    u.autoClockOuts,
    `"${u.locations.join(", ")}"`,
  ])

  // Add summary
  rows.push([])
  rows.push(["--- REPORT INFO ---"])
  rows.push(["Period", `${report.period.startDate} to ${report.period.endDate}`])
  rows.push(["Work Days", report.period.workDays])
  if (locationName) rows.push(["Location Filter", locationName])
  rows.push(["Total Technicians", filteredByUser.length])
  rows.push(["Total Hours", report.summary.totalHours])
  rows.push(["Standard Hours", report.summary.standardHours])
  rows.push(["Overtime Hours", report.summary.overtimeHours])
  rows.push(["Total Shifts", report.summary.totalShifts])
  rows.push(["Avg Shift", `${report.summary.averageShiftHours}h`])
  rows.push(["Auto Clock-Outs", report.summary.autoClockOuts])

  // Add location breakdown
  if (filteredByLocation.length > 0) {
    rows.push([])
    rows.push(["--- BY LOCATION ---"])
    rows.push(["Location", "Total Hours", "Shifts", "Employees"])
    for (const loc of filteredByLocation) {
      rows.push([`"${loc.location.name}"`, loc.totalHours, loc.shifts, loc.uniqueTechnicians])
    }
  }

  const csv = [headers.join(","), ...rows.map((r) => (r as any[]).join(","))].join("\n")
  downloadBlob(csv, getFileName(orgName, report.period, locationName, "csv"), "text/csv;charset=utf-8;")
}

// ============================================================================
// PDF EXPORT (Print-optimized new window)
// ============================================================================

export function exportPDF({ report, filteredByUser, filteredByLocation, locationName, orgName }: ExportData) {
  const win = window.open("", "_blank")
  if (!win) {
    alert("Please allow popups to generate PDF reports")
    return
  }

  const period = `${report.period.startDate} — ${report.period.endDate}`
  const generated = new Date().toLocaleString()
  const locationLabel = locationName || "All Locations"

  const userRows = filteredByUser
    .map(
      (u, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="name">${u.user.firstName} ${u.user.lastName}</td>
        <td>${u.user.email}</td>
        <td class="num">${u.totalHours}h</td>
        <td class="num">${u.shifts}</td>
        <td class="num">${u.averageShiftHours}h</td>
        <td class="num">${u.autoClockOuts > 0 ? `<span class="flag">${u.autoClockOuts}</span>` : "—"}</td>
        <td>${u.locations.join(", ")}</td>
      </tr>`
    )
    .join("")

  const locationRows = filteredByLocation
    .map(
      (l, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="name">${l.location.name}</td>
        <td class="num">${l.totalHours}h</td>
        <td class="num">${l.shifts}</td>
        <td class="num">${l.uniqueTechnicians}</td>
        <td class="num">${l.shifts > 0 ? (l.totalHours / l.shifts).toFixed(1) : "0"}h</td>
      </tr>`
    )
    .join("")

  // Recalculate summary for filtered data
  const filteredTotalHours = filteredByUser.reduce((s, u) => s + u.totalHours, 0)
  const filteredShifts = filteredByUser.reduce((s, u) => s + u.shifts, 0)
  const filteredAutoOuts = filteredByUser.reduce((s, u) => s + u.autoClockOuts, 0)
  const filteredAvg = filteredShifts > 0 ? (filteredTotalHours / filteredShifts).toFixed(1) : "0"

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Attendance Report — ${orgName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.5; padding: 0; background: #e5e7eb; }

    /* A4 Landscape page simulation */
    .page { width: 297mm; min-height: 210mm; margin: 0 auto; padding: 20mm; background: white; box-shadow: 0 2px 16px rgba(0,0,0,0.12); }

    @media print {
      body { padding: 0; background: white; }
      .no-print { display: none !important; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      @page { margin: 15mm; size: A4 landscape; }
    }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #0f172a; }
    .header-left h1 { font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; }
    .header-left p { color: #64748b; font-size: 12px; margin-top: 4px; }
    .header-left .location-badge { display: inline-block; margin-top: 6px; padding: 3px 10px; background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #bfdbfe; }
    .header-right { text-align: right; font-size: 11px; color: #64748b; }
    .header-right .org { font-size: 14px; font-weight: 600; color: #0f172a; }

    .summary { display: flex; gap: 16px; margin-bottom: 28px; }
    .kpi { flex: 1; padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .kpi .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; font-weight: 600; }
    .kpi .value { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .kpi .sub { font-size: 10px; color: #94a3b8; margin-top: 1px; }

    .section { margin-bottom: 24px; }
    .section h2 { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section .count { font-size: 11px; color: #94a3b8; font-weight: 400; text-transform: none; letter-spacing: 0; }

    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
    thead th.num { text-align: right; }
    tbody td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.name { font-weight: 500; }
    tbody tr.even { background: #fafbfc; }
    .flag { display: inline-block; background: #fef3c7; color: #92400e; font-weight: 600; padding: 1px 6px; border-radius: 10px; font-size: 10px; }

    .totals td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }

    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 10px; }

    .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: white; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; z-index: 100; font-size: 13px; }
    .print-bar button { background: #2563eb; color: white; border: none; padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .print-bar button:hover { background: #1d4ed8; }
    .print-spacer { height: 64px; }

    .signatures { margin-top: 40px; display: flex; gap: 60px; }
    .sig-block { flex: 1; }
    .sig-line { border-bottom: 1px solid #94a3b8; height: 32px; margin-bottom: 4px; }
    .sig-label { font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span>Preview — ${orgName} Attendance Report · ${locationLabel}</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="print-spacer no-print"></div>

  <div class="page">
  <div class="header">
    <div class="header-left">
      <h1>Attendance Report</h1>
      <p>${period} · ${report.period.workDays} work days</p>
      ${locationName ? `<span class="location-badge">${locationName}</span>` : ""}
    </div>
    <div class="header-right">
      <div class="org">${orgName}</div>
      <div>Generated: ${generated}</div>
    </div>
  </div>

  <div class="summary">
    <div class="kpi">
      <div class="label">Total Hours</div>
      <div class="value">${filteredTotalHours.toFixed(1)}h</div>
      <div class="sub">${filteredShifts} shifts</div>
    </div>
    <div class="kpi">
      <div class="label">Technicians</div>
      <div class="value">${filteredByUser.length}</div>
      <div class="sub">Active in period</div>
    </div>
    <div class="kpi">
      <div class="label">Avg Shift</div>
      <div class="value">${filteredAvg}h</div>
      <div class="sub">Per shift</div>
    </div>
    <div class="kpi">
      <div class="label">Auto Clock-Outs</div>
      <div class="value">${filteredAutoOuts}</div>
      <div class="sub">Missed</div>
    </div>
  </div>

  <div class="section">
    <h2>By Technician <span class="count">(${filteredByUser.length})</span></h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th class="num">Hours</th>
          <th class="num">Shifts</th>
          <th class="num">Avg</th>
          <th class="num">Auto-Out</th>
          <th>Locations</th>
        </tr>
      </thead>
      <tbody>
        ${userRows}
        <tr class="totals">
          <td colspan="2">Total</td>
          <td class="num">${filteredTotalHours.toFixed(1)}h</td>
          <td class="num">${filteredShifts}</td>
          <td class="num">${filteredAvg}h</td>
          <td class="num">${filteredAutoOuts}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${filteredByLocation.length > 0 ? `
  <div class="section">
    <h2>By Location <span class="count">(${filteredByLocation.length})</span></h2>
    <table>
      <thead>
        <tr>
          <th>Location</th>
          <th class="num">Hours</th>
          <th class="num">Shifts</th>
          <th class="num">Technicians</th>
          <th class="num">Avg/Shift</th>
        </tr>
      </thead>
      <tbody>${locationRows}</tbody>
    </table>
  </div>
  ` : ""}

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Manager Signature / Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Approved By / Date</div>
    </div>
  </div>

  <div class="footer">
    <span>Generated by HBCField · ${locationLabel}</span>
    <span>${period}</span>
  </div>
  </div><!-- .page -->
</body>
</html>`

  win.document.write(html)
  win.document.close()
}

// ============================================================================
// HELPERS
// ============================================================================

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob(["\uFEFF" + content], { type }) // BOM for Excel UTF-8 compat
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
