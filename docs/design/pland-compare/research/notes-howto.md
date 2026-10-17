# PlanD — how the product really works (from tutorials, onboarding lessons, PlanD University)

Sources: `/scratchpad/pland/clean/` — 22 `onboardings__*`, 5 `onboarding-user__*`, `pland-university.txt`, 25 `tutorials__*`, 2 `tutorials-1__*` (51 files, all read in full).
File names below are shortened: `onb:` = `onboardings__…txt`, `tut:` = `tutorials__…txt`, `tut1:` = `tutorials-1__…txt`, `role:` = `onboarding-user__…txt`, `uni` = `pland-university.txt`.

**What the sources are, and how much they say** — this decides how far each note can be trusted:
- The **`onboardings__*` lessons are the real product evidence.** They are transcripts of the video lessons (narration), 1–15 min each, organised as "Schulung Tag 1–4" + "Angebote & Rechnungen" + "Mikro Lektionen". They name screens, buttons and settings.
- **`pland-university.txt` repeats the same lesson texts.** Diffed line by line: the only new lines are course blurbs and durations (Tag 1 = 23 min, Tag 2 = 16 min, Tag 3 = 18 min, Faktura = 15 min).
- **The `tutorials__*` pages are SEO / business-advice articles** ("how to found a cleaning company"). They hold almost no product detail. The few product claims in them are marketing, and are marked as such below.
- **`tutorials-1__webinare.txt`** gives the 2026 webinar series, which reveals newer features (Aufgaben-Management, Sammelrechnungen, Geräteverwaltung).
- **The five role pages (`onboarding-user__*`) are empty shells**: a heading and a blurb, no lessons listed. The Servicekraft one literally says "No items found."; the Geschäftsführung heading is empty.
- **Two lessons have no text at all** (video only): "Einführung in die Mitarbeiter App" (`onb:mitarbeiter-app`) and "Export von Stammdaten" (`onb:export-von-stammdaten`). **The staff app is therefore the WORST-documented part** — see §3.

---

## 1. Data model (objects, fields, relations)

### Platform split
- Two surfaces: the **Dashboard (web)** at `cloud.pland.app`, used by Innendienst and Objektleitung "for organisation and planning", and the **PlanD App (mobile)**, used by cleaning staff and Objektleiter for time tracking, documentation and communication. (`onb:einfuhrung-in-die-pland-software`)

### Mitarbeiter (employee)
- **Created with**: Mitarbeiternummer, Name, Zugriffsrechte (access rights), Handynummer. (`onb:mitarbeiter-in-pland-erstellen`)
- **Further fields after creation**:
  - Profilbild, Adresse, Kontaktdaten.
  - **Vertrag** (contract): Anstellungsart (employment type), Mitarbeitergruppe, Wochenstunden, and *which weekdays for how many hours* the person can be planned.
  - **Account**: number and access rights, editable later; Status **aktiv/passiv** (passive = hidden from the system and cannot log in).
  - **Dokumente**: free upload, e.g. the Arbeitsvertrag. (`onb:mitarbeiter-in-pland-erstellen`)
- **Vertrag also holds a "Fahrzeiterfassung erlauben" switch** (travel-time recording is allowed per employee). (`onb:fahrzeiterfassung-mit-pland`)
- **Lohnart (wage type) + hourly wage** can be set under Mitarbeiter → Informationen. (`onb:lohnarten-und-zuschlage-in-pland`)
- **"Lohnzeit" tab per employee** = the approved wage-time list ("Lohnliste"). It shows Plan-Zeit, erfasste Zeit and Lohn-Zeit; surcharges are marked with an icon and summed on the left; travel time appears here. (`onb:lohnarten-und-zuschlage-in-pland`, `onb:freigabe-von-zeiterfassungen`, `onb:fahrzeiterfassung-mit-pland`)
- **Availability**: grey areas in the planner mark days the person is not available. Only the configured weekdays/hours are released for assignment. (`onb:auftrage-und-einsatzplanung-in-pland`)
- **Implementation status categories** on the Dashboard home: "Nutzer mit Einsätzen" (has assignments), "Eingeladene Nutzer" (invited **by SMS**), "Eingeloggte Nutzer" (has logged into the app), "Implementierte Nutzer" (has done several time records). (`onb:einfuhrung-in-die-pland-software`)
- **Birthdays** appear in notifications. (`onb:einfuhrung…`)

### Kunde (customer)
- **Fields**: Name, Ansprechpartner (contact person), Anschrift (address). The address is *optional* for the customer. (`onb:kunden-objekte-in-pland`)
- **Checkbox "Objekt automatisch erstellen"**: creates an Objekt with the same address. (`onb:kunden-objekte-in-pland`)
- **Customer list lives UNDER Objekte** in the navigation (Objekte → Kunden). (`onb:kunden-objekte-in-pland`)

### Objekt (site / property) — belongs to a Kunde
- **Objektleiter**: only employees whose access right is Administrator or Objektleiter can be chosen.
- **Anschrift is MANDATORY**, because the app compares the employee's GPS location with the site address when time is recorded.
- **Tabs**:
  - **Vertrag**: Vertragsende (end of contract).
  - **Sonstiges**: free info, e.g. the door access code.
  - **Materialwesen**: per-object article "Materialschrank" with monthly budgets — see Material below.
  - **Kunden-Dashboard**: QR code + link — see Ticket below. (`onb:kunden-objekte-in-pland`, `onb:materialbestellungen-in-pland`, `onb:ticket-system-in-pland`)
- *Marketing only, not shown in any lesson:* a "digitale Objektmappe" for Objektleiter on the phone. (`role:objektleiter`, `tut:warum-sollte-man…`) Leistungsverzeichnisse per Objekt are also mentioned only in marketing. (`tut:worauf-sollte-man…`)

### Auftragsart (job type)
- Examples: Glasreinigung, Unterhaltsreinigung.
- Defined in Einstellungen, or created inline while creating an Einsatz.
- **Used as a planner filter** ("has done this Auftragsart before"). (`onb:auftrage-und-einsatzplanung-in-pland`)

### Auftrag (order / contract) — Objekt + Auftragsart, Start- and Enddatum
- **Created one-click from an accepted Angebot**. Objekt and Auftragsart are prefilled from the quote. (`onb:wiederholende-rechnungen-mit-pland-erstellen`)
- **Rechnungseinstellungen per Auftrag**:
  - Abrechnung **Manuell** or **Wiederkehrend**, plus the interval (e.g. monthly).
  - Output as **Entwurf** (draft, reviewed by hand) or **Fertigstellen** (sent automatically to the customer).
  - Positions are carried over from the quote. (`onb:wiederholende-rechnungen…`)
- **Auftrag list filters**: Manuell / Wiederkehrend / **Ohne Abrechnung** (no billing). (`onb:wiederholende-rechnungen…`)
- **Tab "Rechnungen"** inside an Auftrag lists its invoices. (`onb:wiederholende-rechnungen…`)
- **Dynamische Positionen** (dynamic line items) are set on the Auftrag — see Rechnung below. (`onb:dynamische-positionen…`)

### Einsatz (scheduled visit / shift instance) — Objekt + Auftrag(-sart) + Mitarbeiter(s) + date/time
- **Einmalig** (one-off) or **Wiederholend** (repeating: weekly, every 2 weeks on Tuesday, monthly…).
- **Optional fields**: Kommentar; attached Dokument (e.g. access code); "notify the employee now" checkbox. (`onb:auftrage-und-einsatzplanung-in-pland`)
- **Teameinsatz**: several Mitarbeiter on one Einsatz ("Mitarbeiter → Hinzufügen"). (`onb:auftrage…`)
- **Offene Schicht (open shift) / unbesetzter Einsatz**: an Einsatz with nobody assigned. (`onb:abwesenheiten-in-pland`)
- **Vertretungseinsatz** (substitute assignment): marked with a small airplane icon. (`onb:abwesenheiten-in-pland`)
- **Status colours**: green = abgeschlossen (completed), red = nicht abgeschlossen (past, not completed), blue = future. Icons show team and repeating. (`onb:auftrage…`)

### Zeiterfassung (time record) — against an Einsatz, or "einfache Zeiterfassung"
- **Carries**: Check-in and check-out time and location (GPS), Soll-Zeit (planned) vs Ist-Zeit (recorded). (`onb:freigabe-von-zeiterfassungen`)
- **Approved value** ("Freigabe") = **Vorgabe** (plan), **Erfassung** (recorded) or **Custom**. (`onb:freigabe…`)
- **Kinds**:
  - planned Einsatz;
  - "einfache Zeiterfassung" (unplanned, e.g. check-in by **QR code**);
  - "nachgetragene Zeiten" (added later via the app's **Stundenzettel**);
  - Fahrzeit (travel time). (`onb:freigabe…`, `onb:fahrzeiterfassung…`)
- *Marketing only:* breaks (Pausen) are recorded too. (`tut1:webinare`)

### Lohnart (wage type) and Zuschlag (surcharge)
- **Lohnart**: name (e.g. "Glasreiniger") + Stundenlohn. Created under Mitarbeiter → Informationen or under Einstellungen → Lohn. (`onb:lohnarten…`)
- **Zuschläge** are defined in Einstellungen → Lohn:
  - Types: weekday (e.g. Sonntag), Feiertag, Nachtarbeit, "besondere Arbeiten".
  - Settings: percentage + which **Lohngruppe** it applies to.
  - Applied automatically to all future Einsätze.
  - **When Nacht, Feiertag and Sonntag coincide, only the HIGHEST applies** ("siehe Lohntarifvertrag"). (`onb:lohnarten…`)
- **The sources use "Lohngruppe" and "Lohnart" interchangeably** (inference: they are the same object).

### Abwesenheit (absence) and Abwesenheitsart (absence type)
- **Abwesenheit**: Mitarbeiter, Abwesenheitsart (Urlaub, Krankheit, …), Zeitraum (period), **Entgeltfortzahlung** (continued pay) basis. (`onb:abwesenheiten-in-pland`)
- **Abwesenheitsart** (created via "Abwesenheitsart erstellen", or Einstellungen → Abwesenheiten):
  - name (e.g. unbezahlter Urlaub);
  - **Lohnnummer** (payroll code);
  - "Mitarbeiter can request it themselves?" (yes/no);
  - "reduces the leave entitlement?" (yes/no). (`onb:abwesenheiten-in-pland`)
- **Entgeltfortzahlung options**:
  - **Vertragsstunden**: the hours in the contract.
  - **Planstunden**: the hours planned in that period.
  - **Stundendurchschnitt**: the average hours worked over the **last 3 months**. (`onb:abwesenheiten-in-pland`)
- **"Betroffene Einsätze"** (affected visits) are listed on the absence. (`onb:abwesenheiten-in-pland`)

### Urlaubsanspruch (leave entitlement)
- **Org setting** (Einstellungen → Abwesenheiten → Urlaubsanspruch): days per year (the Rahmentarifvertrag figure of **30** is cited), a **Wartezeit** for new hires, and how unused days **carry over** into the next cycle. (`onb:einstellungen-fur-die-urlaubstageberechnung`)
- **Per-employee "Anpassungen"** (adjustments): e.g. overtime from year X granted as extra leave days in year X+1. Adjustments are listed and can be deleted; each deletion recalculates the entitlement. (`onb:urlaubsanspruch-von-mitarbeitern`)
- **Effective days** are calculated from the number of working days per week. (`onb:urlaubsanspruch…`)

### Ticket (customer request / complaint / extra-service booking)
- **Fields seen**: Anliegen (category / description), customer **E-Mail** (all updates go there), Fotos, assigned Mitarbeiter, resolution photo + Bemerkung. (`onb:ticket-system-in-pland`)
- **Statuses seen**: created → zugewiesen (assigned) → erledigt / abgeschlossen (done). (`onb:ticket…`)
- *Also described as used for "Buchung von Zusatzleistungen"* (booking extra services). (`onb:ticket…`)

### Aufgabe (task) — NEW in 2026
- **Distinct from Ticket**; can **repeat**; linked to the Kunden-Dashboard. Known only from a webinar blurb. (`tut1:webinare`)

### Kunden-Dashboard (customer portal)
- **Per Objekt**, reached by a QR code (downloadable) or a link sent by e-mail.
- **Shows Leistungsnachweise** (proof-of-service records) and lets the customer **create Tickets**.
- **No login is mentioned** (inference: link/QR-based access). (`onb:ticket-system-in-pland`)

### Material
- **Artikel**: own photo or one from a built-in **Mediathek** of cleaning-product images, further info, **Lieferant** (supplier: name + E-Mail), Gruppe (e.g. Tücher, Chemie). Prices are set in the settings (Produkte, Artikel). (`onb:materialbestellungen-in-pland`, `onb:die-wichtigsten-faktura-einstellungen`)
- **Materialschrank per Objekt** (Objekte → Materialwesen): the articles allowed there, with a **monthly budget** quantity — "Verbrauch bezieht sich immer auf einen Monat".
  - Budget **0 = unlimited**.
  - **No articles assigned = staff may order ANY article.** (`onb:materialbestellungen…`)
- **Materialbestellung**: articles + Bemerkung → list under Materialwesen → detail → **Lieferschein** (delivery note, download, sent to the customer to sign) → abschließen (→ tab "Erledigt") → convertible into a **Rechnung** via the Faktura tool. (`onb:materialbestellungen…`)
- *Marketing claim:* orders go to suppliers automatically ("automatisch Lieferscheine und Bestellungen schicken"). (`onb:materialbestellungen…`)
- **Geräteverwaltung** (equipment management) in the app — known only from a webinar blurb. (`tut1:webinare`)

### Faktura (quotes and invoices)
- **Angebot** (quote). **Rechnung** (invoice). **Gutschrift** (credit note). **Stornorechnung** (cancellation invoice). (`onb:die-wichtigsten-faktura-einstellungen`)
- **Produkte & Dienstleistungen**: a catalogue with default prices (e.g. Unterhaltsreinigung). Picking one in a quote auto-fills the line; the price can be overridden per document. (`onb:die-wichtigsten-faktura…`)
- **Settings per document type**: Briefpapier / background image, Kürzel (prefix), next number (auto-increment), Kopf- and Fußtext (header and footer text, editable per document), Zahlungsziel (payment term). Plus Bankverbindung, company data + logo (in the footer), and tax settings: Währung, USt-Nr., Geschäftsführer. (`onb:die-wichtigsten-faktura…`)
- **Dynamische Position** (on an Auftrag): a product billed after the fact by one of three bases:
  - **Soll-Zeit**: the planned Einsätze in the month.
  - **Lohnzeit**: the approved paid hours of staff on that Auftrag.
  - **nach Termin**: per visit (e.g. Anfahrt / travel charge).
  - The invoice for a chosen **Leistungszeitraum** (service period) lists the dates of the visits. (`onb:dynamische-positionen…`)
- **Sammelrechnungen** (collective invoices), sending invoices by e-mail, Filter and Vorlagen (templates), and **Terminausfälle** (cancelled visits) via dynamic positions — webinar blurb only. (`tut1:webinare`)
- *Marketing only:* customers confirm a quote "with one click"; an overview of open/unpaid invoices and daily revenue. (`tut1:webinare`)

### Other objects
- **Chat**: 1:1 and groups (green pen). (`onb:einfuhrung…`)
- **Benachrichtigungen** (bell): tickets edited, Einsätze commented, birthdays. (`onb:einfuhrung…`)
- **Settings tabs seen**: Einstellungen → Firmendaten/Logo, Steuer, Rechnungen (Angebote/Gutschriften/Storno…), Bankverbindung, Produkte/Artikel/Dienstleistungen, Lohn (Lohnarten, Zuschläge), Abwesenheiten (Abwesenheitsart, Urlaubsanspruch), **E-Mail Benachrichtigung**, Zeiterfassung (incl. Fahrzeit, GPS-Erfassung), Auftragsarten. (multiple `onb:*` files)
- **NOT seen in any how-to: "Arbeitsschein", "Qualitätscheck/Qualitätskontrolle", "Checklisten", "Controlling-Modul", "Mahnung/Mahnwesen" (dunning)** — they appear only in marketing articles (`tut:warum-sollte-man…`, `tut:was-sind-vorteile…`), or not at all for dunning. No lesson shows how they work.

---

## 2. Workflows step by step

### 2.1 Dashboard login, navigation, chat (`onb:einfuhrung-in-die-pland-software`)
1. Log in at `cloud.pland.app`. The landing page is the **implementation list** (4 adoption categories); the PlanD icon top-left returns there.
2. The left navigation holds everything from Einsatzplanung to Materialbestellungen, plus Support.
3. Bell icon = notifications. Chat icon bottom-right = PlanD Chat: search a person, or the green pen → group.

### 2.2 Creating an employee (`onb:mitarbeiter-in-pland-erstellen`, `onb:einfuhrung…`)
1. Mitarbeiter → "Mitarbeiter erstellen". Enter number, name, access rights (Servicekraft / Objektleiter / Innendienst / Administrator) and mobile number.
2. Then fill the profile photo, address and contact; the Vertrag (Anstellungsart, Mitarbeitergruppe, Wochenstunden, per-weekday hours); and Dokumente.
3. The employee is invited **by SMS**. Logging into the app moves them through the adoption categories. (inference from the categories: the phone number is the login identity)
4. When someone leaves, set them **passiv** — they disappear and cannot log in.

### 2.3 Customer and site (`onb:kunden-objekte-in-pland`)
1. Objekte → Kunden → "Kunden erstellen": name, contact, address. Optionally tick "Objekt automatisch erstellen".
2. Manually: Objekte → create → choose the Kunde, Objektleiter (admins/Objektleiter only) and **mandatory address** (used for the GPS check).
3. In the Objekt: Vertrag → Vertragsende; Sonstiges → door code etc.

### 2.4 Planning: Einsatzplaner / Dienstplan (`onb:auftrage-und-einsatzplanung-in-pland`)
- **The overview is a calendar**: Tag/Woche toggle top right, date picker top left, blue button "Einsatz erstellen".
- **Filters next to search**: Mitarbeitergruppen, Objekte, plus "Objekterfahrung" (has worked at this site) and "Auftragsarten" (has done this kind of job).
- **Magnifier = show all unbesetzte Einsätze** → drag and drop them onto a free employee.
- **Eye = expand all Einsätze per day** when someone has several.
- **Capacity bar under each name**: hover shows planned vs remaining hours for the rest of the week and month; it turns **red when exceeded**.
- **One-off Einsatz**:
  1. In the day view, **drag across the time range** → choose Objekt + Auftrag (or create a new Auftragsart inline).
  2. Choose Einmalig, date and time; add a comment or document; tick "notify employee".
  3. Afterwards the Einsatz can be dragged to move or reassign it.
- **Repeating Einsatz**:
  1. In the week view, click the employee → Objekt + Auftragsart → "Wiederholend".
  2. Set the interval (weekly / every 2 weeks on Tue / monthly) → Erstellen.
- **Editing a series**: drag and drop, or open the Einsatz.
  - PlanD asks with a checkbox: **only this one or all following**.
  - Changes to a series affect **only the future**.
  - Occurrences already split off ("herausgetrennt") are **no longer affected by series changes**.
- **Team Einsatz**: open the Einsatz → Mitarbeiter → Hinzufügen. For a series, every occurrence appears for the added people.
  - Deleting one occurrence asks two questions: (a) also following dates? (b) also for the other members?
  - This allows removing one person for one day, or the whole team for one day.

### 2.5 Absences, substitutes, open shifts (`onb:abwesenheiten-in-pland`)
1. Navigation → Abwesenheiten → "Abwesenheit erstellen": Mitarbeiter, Art (Urlaub / Krankheit / custom), Zeitraum.
2. **PlanD computes the absence days from the employee's contract.**
3. Choose Entgeltfortzahlung: Vertragsstunden / Planstunden / Stundendurchschnitt (last 3 months).
4. View as **Kalender or Liste**; click an absence for details or to edit.
5. **"Betroffene Einsätze"** (affected visits): each can be **reassigned immediately** to another employee, who gets a **push notification**, or turned into an **Offene Schicht**. Then "Zuweisen" (top right).
6. In the Einsatzplaner:
   - An **orange bar** = the absence.
   - The absent person's Einsätze turn **grey**.
   - Substitute Einsätze show an **airplane icon**.
   - Open shifts are found with the magnifier and dragged to a suitable person (e.g. a Glasreiniger).
7. Settings: Abwesenheitsart management, Urlaubsanspruch, and **"E-Mail Benachrichtigung": whether CUSTOMERS are e-mailed about absences and substitutes.**
- The lesson title says "automatisch Vertretungen finden" (find substitutes automatically). **The text describes only MANUAL picking of a substitute** (plus the planner's filters). No auto-suggestion is shown.
- **Requesting / approving** ("einreichen und freigeben") is promised in the lesson intro. **Its text shows only office-side creation.** Self-requests exist through the Abwesenheitsart flag "Mitarbeiter can request it". (inference: requests are made in the app)

### 2.6 Leave-day rules
- **Org default**: N days/year (30 per the RTV), Wartezeit for new hires, carry-over rule. (`onb:einstellungen-fur-die-urlaubstageberechnung`)
- **Days are counted on the employee's working days per week**. Example: a 3-day week loses only 3 days for a full week away. After creation the remaining entitlement updates automatically. (`onb:urlaubstage-im-urlaubsantrag`)
- **Employees see their remaining entitlement in the app**, and it is shown when they request leave. (`onb:urlaubstage-im-urlaubsantrag`)
- **Individual adjustments** (e.g. overtime → extra leave next year) are listed and deletable, with automatic recalculation. (`onb:urlaubsanspruch-von-mitarbeitern`)
- **Whether an absence type reduces the entitlement** is a flag per Abwesenheitsart. (`onb:abwesenheiten-in-pland`)

### 2.7 Time approval — "Zeitenfreigabe" (`onb:freigabe-von-zeiterfassungen`)
- **Setup**: Zeitenfreigaben → gear icon.
  - **Fehlerarten** (error types that force a manual review):
    1. **Standortfehler**: check-in/out **more than 800 m** from the Objekt.
    2. **Deaktivierte Standortfreigabe**: the employee had GPS off.
    3. **Einfache Zeiterfassung**: an unplanned Einsatz, e.g. QR check-in.
    4. **Nachgetragene Zeiten**: added later via the app's Stundenzettel.
  - **Tab "Unter- und Überschreitungen"**: allowed deviation in % or minutes; within it a time is **auto-approved**. Example: 1 h planned with 10 % allowed under → anything **under 54 min** goes to review.
  - **Switch "Ist- oder Soll-Zeit"**: when on, times are **automatically rounded UP to the Soll-Zeit**.
  - **GPS-Erfassung** on/off.
- **Work queue**: Zeitenfreigaben lists only the faulty records, with error type and deviation from Soll.
  - **Green button** = approve Soll **or** Ist in one click. **Red** = reject.
  - Click the timestamp → detail: Vorgabe vs Erfassung, a **map of the check-in and check-out locations**, and "Freigabe" = Vorgabe / Erfassung / Custom.
  - **Quick Actions** = multi-select and approve in bulk.
- **An approved record flows into the employee's Lohnliste** (Plan / erfasst / Lohn). Missing times can also be **entered there by hand** ("nachtragen").

### 2.8 Travel time (`onb:fahrzeiterfassung-mit-pland`)
1. Einstellungen → Zeiterfassung → Fahrzeit: switch on. **The maximum gap between the end of one Einsatz and the start of the next is 3 h by default**, adjustable. Only gaps under it count as travel.
2. Per employee: Mitarbeiter → Vertrag → allow Fahrzeiterfassung.
3. In the app: after finishing one Einsatz, when starting the next time record, the employee **enters the travel time**. It must not exceed the max gap, and goes to the office automatically.
4. It shows in the employee's Lohnzeit and in the **time export**.

### 2.9 Wage types, surcharges, payroll (`onb:lohnarten-und-zuschlage-in-pland`, `tut1:webinare`)
- Lohnzeit (Mitarbeiter → Lohnzeit) lists every recorded hour with its surcharges.
- Create a Lohnart, then a Zuschlag (weekday / Feiertag / Nacht / special work; % ; Lohngruppe). It is auto-applied; when several coincide, only the highest counts.
- **Payroll is NOT run inside PlanD.** The lesson ends at the Lohnzeit list and the "Export der Arbeitszeiten". The webinar page says: "**Exportieren Sie die fehlerfreien Lohndaten für die Weitergabe an das Lohnbüro oder integrieren Sie Ihr bestehendes Abrechnungsprogramm.**" No DATEV or other format is named in these files.
- **The payroll role course promises a "fertige Lohnabrechnung"** (finished payroll), but the course page has no lessons. (`role:lohnbuchhaltung`)

### 2.10 Quotes → order → recurring invoices (`onb:die-wichtigsten-faktura…`, `onb:wiederholende-rechnungen…`)
1. **Setup**: company data + logo (footer), tax (currency, USt-Nr., Geschäftsführer); Rechnungen settings (Briefpapier, prefix, next number — **"Nächste Rechnungsnummer 200 → next invoice RE-201"** per the lesson —, header and footer text, Zahlungsziel) for Angebote, Gutschriften and Storno as well; Bankverbindung; products and services with default prices.
2. **Angebote** → "Angebot erstellen" → in Beschreibung, pick a service (auto-filled).
3. **Accepted quote → "convert to Auftrag" in one click** (Objekt and Auftragsart prefilled); set the start and end date.
4. **Rechnungseinstellungen** on the Auftrag: Manuell or Wiederkehrend + interval (e.g. monthly); **Entwurf** (review first) or **Fertigstellen** (sent automatically every month with the quote's positions).
5. **Aufträge list** (filter Manuell / Wiederkehrend / Ohne Abrechnung) → Auftrag → tab Rechnungen.
6. **Rechnungen → Entwurf**: edit → "Rechnung erstellen" (bottom right) → ready to send. **The next draft is generated on the 1st of the next month ("am 01.11.").**

### 2.11 Dynamic positions — billing what actually happened (`onb:dynamische-positionen…`)
1. Auftrag → "Dynamische Position hinzufügen". **A product must exist first.** Choose the basis: Soll-Zeit / Lohnzeit / nach Termin.
2. Worked example:
   - Glasreinigung billed on Lohnzeit, Anfahrt billed per Termin.
   - Planned twice for 2 h each; **1 h approved** for the employee.
   - Invoice = **1 h Glasreinigung + 2 × Anfahrt**, with the dates of the visits.
3. **"Normally PlanD creates these automatically every month."** Manually: Auftrag → create Rechnung → choose the **Leistungszeitraum** → all visits of the Auftrag in that period are taken.

### 2.12 Tickets (`onb:ticket-system-in-pland`)
- **Three ways in**:
  1. Dashboard → Tickets → "Ticket erstellen".
  2. The app (staff see and create tickets on the road).
  3. The **Kunden-Dashboard**: Objekt → QR code download or link by e-mail. The customer sees Leistungsnachweise; new ticket → "Ihr Anliegen" + E-Mail + photos.
- **Assigning**: the ticket appears in Dashboard → Tickets.
  - The assignee picker **shows only staff who have already worked at that Objekt**; "alle User laden" widens it.
  - **The assignee gets a push notification.**
- **Resolving**:
  - **In the app**: open the ticket → resolve with a **photo + Bemerkung** → the customer is notified with the photo and note.
  - **In the Dashboard**: Tickets → "zugewiesene Tickets" → Objekt → blue button.
  - **"Mithilfe einer integrierten KI" PlanD writes the reply text to the customer** and sends it with the confirmation.

### 2.13 Material ordering (`onb:materialbestellungen-in-pland`)
1. Materialwesen → Artikel → "Artikel erstellen": photo (own or Mediathek), info, Lieferant (or "Lieferanten erstellen": name + e-mail), Gruppe.
2. Objekte → [Objekt] → Materialwesen: allowed articles + **monthly budget** (0 = unlimited).
3. Ordering: staff order in the app for their Objekt; the office orders via Materialwesen → "Material bestellen" → pick from the Materialschrank → Bemerkung → done.
4. Materialwesen order list → detail → **Lieferschein generieren** (download, customer signs) → abschließen → "Erledigt".
5. **Faktura: turn the order into an invoice.** Prices per material come from the settings.

### 2.14 Data export (`onb:export-von-stammdaten`)
- Stammdaten (Mitarbeiter, Kunden, Objekte) **individually as CSV** for Excel.
- **The lesson is video-only; the steps are not in the text.**

---

## 3. Mobile app for staff ("PlanD App" / Mitarbeiter-App)

**The dedicated lesson has no text** (video plus a downloadable "Onboarding Dokument mit Erklärungen für Mitarbeiter"; the PDF was not captured). (`onb:mitarbeiter-app`) The Servicekraft course page lists no items. (`role:servicekraft`)

**What other lessons reveal about the app:**
- **Login**: staff are invited by SMS; the phone number is captured at employee creation. (`onb:einfuhrung…`, `onb:mitarbeiter-in-pland-erstellen`)
- **Dienstplan / Einsätze** on the phone; push for new or reassigned Einsätze (e.g. a substitute). (`onb:abwesenheiten…`, `onb:auftrage…`, `tut:was-sollte-bei…`)
- **Time tracking (Zeiterfassung)**:
  - Check-in and check-out are recorded with GPS; the location is compared with the Objekt address.
  - Check-in by **QR code** for unplanned work ("einfache Zeiterfassung").
  - Employees can turn GPS off; that is flagged.
  - A **Stundenzettel** to add times afterwards ("nachgetragene Zeiten"). (`onb:freigabe…`)
- **Travel time**: entered when starting the next time record after a finished Einsatz. (`onb:fahrzeiterfassung…`)
- **Leave**: see the remaining entitlement; request leave with the available balance shown. (`onb:urlaubstage-im-urlaubsantrag`) Self-request only for absence types flagged for it. (`onb:abwesenheiten…`)
- **Tickets**: see, create, resolve with photo + note; push on assignment. (`onb:ticket…`)
- **Material**: order from the Objekt's Materialschrank, within budget. (`onb:materialbestellungen…`)
- **Chat** with office and colleagues (inference: the same PlanD Chat). (`onb:einfuhrung…`)
- **Objektleiter on the app**: the "digitale Objektmappe"; Geräteverwaltung; planning and editing Einsätze on mobile. (`role:objektleiter`, `tut1:webinare` — **blurbs only, not demonstrated**)
- **Marketing only**: "Arbeitsscheine direkt vor Ort digital quittieren" (sign off work sheets on site); "Qualitätschecks" and "Checklisten" by Objektleiter. (`tut:warum-sollte-man…`, `tut:was-sind-vorteile…`) **Not shown in any how-to.**

---

## 4. Roles, permissions, setup, onboarding

- **Zugriffsrechte (4 fixed levels)**: **Servicekraft, Objektleiter, Innendienst, Administrator**. Set at employee creation and editable under Account. (`onb:mitarbeiter-in-pland-erstellen`)
  - **No finer permissions are described.**
  - **The only rule shown**: the Objekt's Objektleiter must be an Administrator or Objektleiter. (`onb:kunden-objekte-in-pland`)
- **Training audiences**: Innendienst, Objektleiter, Lohnbuchhaltung, Geschäftsführung, Servicekraft. Each lesson lists "Für wen ist dieses Tutorial geeignet?". (all `onb:*`)
- **Training plan = "Schulung" over 4 days + Faktura + micro lessons**. Durations (`uni`): Tag 1 = 23 min, Tag 2 = 16 min, Tag 3 = 18 min, Tag 4 = no duration given (inference ~12 min from 5 + 7), Faktura = 15 min.
  - **Inference**: the onboarding is organised as **four sessions on separate days**, under 1.5 h of video in total. The "Tag" naming suggests guided sessions with PlanD staff, but the files do not say whether they are live.
- **Who sets up**: the lessons for setup (employees, customers/sites, leave settings) are tagged **Innendienst**. Faktura settings are tagged Innendienst / Lohnbuchhaltung / Geschäftsführung.
- **Adoption tracking**: the Dashboard home measures rollout per employee (invited → logged in → has Einsätze → "implementiert" after several time records), "so you see which employees still need help". (`onb:einfuhrung…`)
- **Data import**: **no import is described in any how-to.** Only **export** (CSV of Stammdaten) has a lesson. (`onb:export-von-stammdaten`)
- **Support**: a "Support" entry in the navigation. (`onb:einfuhrung…`) Also **webinars** (Feb 2026: Aufgaben-Management 05.02, Rechnungswesen 12.02, Einsatzplaner + Geräteverwaltung in the app 24.02; each 30 min at 15:00) and a trade-fair stand (CMS 2025 Berlin, Halle 3.2, Stand 102). (`tut1:webinare`)
- **"PlanD Rebuild 2026"** appears as the header of every lesson page. (inference: a site or product rebuild is under way)

---

## 5. All tutorial and onboarding titles

### Product lessons (onboardings__)
| Group | Title | Min | Teaches | File |
|---|---|---|---|---|
| Tag 1 | Einführung in die PlanD Software | 3 | Dashboard vs app, login at cloud.pland.app, adoption categories, navigation, notifications, chat | onb:einfuhrung-in-die-pland-software |
| Tag 1 | Mitarbeiter in PlanD erstellen | 6 | creating an employee, access rights, contract/weekly hours/weekdays, active/passive, documents | onb:mitarbeiter-in-pland-erstellen |
| Tag 1 | Kunden & Objekte in PlanD | 5 | customer → auto/manual Objekt, Objektleiter, mandatory address for GPS, contract end, access code | onb:kunden-objekte-in-pland |
| (Tag 1, per uni blurb "bis hin zur Einsatzerstellung") | Aufträge- und Einsatzplanung in PlanD | 15 | planner views, filters, open visits, colours, one-off/repeating/series edits, team visits | onb:auftrage-und-einsatzplanung-in-pland |
| Tag 2 | Einführung in die Mitarbeiter App | 7 | (video + PDF only) | onb:mitarbeiter-app |
| Tag 2 | Freigabe von Zeiterfassungen | 6 | error types, 800 m rule, tolerances, Soll/Ist rounding, approve/reject, bulk, Lohnliste | onb:freigabe-von-zeiterfassungen |
| Tag 2 | Fahrzeiten von Mitarbeitern erfassen | 3 | travel time switch, 3 h max gap, per-contract allow, entry in the app, export | onb:fahrzeiterfassung-mit-pland |
| Tag 3 | Lohnarten und Zuschläge in PlanD | 6 | Lohnzeit view, wage types, surcharges, highest-only rule | onb:lohnarten-und-zuschlage-in-pland |
| Tag 3 | Allgemeine Einstellungen für die Urlaubstageberechnung | 1 | days/year, waiting time, carry-over | onb:einstellungen-fur-die-urlaubstageberechnung |
| Tag 3 | Urlaubsanspruch von Mitarbeitern einstellen | 2 | per-person adjustments (overtime → leave), deletion recalculates | onb:urlaubsanspruch-von-mitarbeitern |
| Tag 3 | Urlaubstage im Urlaubsantrag | 1 | counting on working days, remaining balance updates, shown in the app | onb:urlaubstage-im-urlaubsantrag |
| Tag 3 | Abwesenheiten erstellen, bezahlen und umplanen | 10 | absence types (payroll no., self-request, reduces leave), continued pay basis, affected visits → substitute/open shift, customer e-mail | onb:abwesenheiten-in-pland |
| Tag 4 | Ticket-System in PlanD | 5 | 3 ticket channels, customer dashboard via QR/link, assignment, app resolution with photo, AI reply | onb:ticket-system-in-pland |
| Tag 4 | Materialbestellungen | 7 | articles, suppliers, per-object monthly budgets, ordering, delivery note, → invoice | onb:materialbestellungen-in-pland |
| Faktura | Die wichtigsten Faktura Einstellungen in PlanD | 6 | company/tax/bank, numbering, header/footer, payment term, products, first quote | onb:die-wichtigsten-faktura-einstellungen-in-pland |
| Faktura | Wiederholende Rechnungen mit PlanD erstellen | 5 | quote → order, manual vs recurring, draft vs auto-send, monthly drafts | onb:wiederholende-rechnungen-mit-pland-erstellen |
| Faktura | Dynamische Positionen in Rechnungen | 5 | bill by Soll-Zeit / Lohnzeit / per visit, service period | onb:dynamische-positionen-in-rechnungen-mit-pland |
| Mikro | Wie exportiere ich Daten aus PlanD? | 1 | CSV export of employees/customers/sites (video only) | onb:export-von-stammdaten |

**Placement note**: "Aufträge und Einsatzplanung" is NOT in the lesson menu that every lesson page shows. Its page has the same menu without itself. (inference: it belongs to Tag 1, per the uni description "Grundlagen … bis hin zur Einsatzerstellung")

### Role courses (onboarding-user__) — all empty shells
| Course | Blurb | File |
|---|---|---|
| Geschäftsführung | (no heading, no text) | role:geschaftsfuhrung |
| Innendienst — "PlanD für Innendienstler" | planning and organising field staff via the Dashboard | role:innendienst |
| Lohnbuchhaltung — "Zur erfolgreichen Lohnabrechnung in Stunden" | Lohngruppen → Zuschläge → finished payroll | role:lohnbuchhaltung |
| Objektleiter — "Als Objektleiter mit PlanD durchstarten" | customer tickets → digital site folder | role:objektleiter |
| Servicekraft — "Mit der PlanD App durchstarten" | login → time tracking ("No items found.") | role:servicekraft |

### PlanD University (`uni`)
- Hub page listing the same lessons.
- **"Beliebte Lektionen"** (popular lessons): Mitarbeiter App, Export von Stammdaten, Fahrzeiten erfassen, Einführung in PlanD.

### Business-advice "tutorials" (tutorials__) — a founder guide, near-zero product content
| Title | Content | File |
|---|---|---|
| Wie gründe ich eine Reinigungsfirma? Schritt-für-Schritt | 13 founding steps; cleaning is a zulassungsfreies Handwerk, but the title "Gebäudereiniger" is protected; PlanD CTA | tut:wie-grunde-ich-eine-reinigungsfirma… |
| Was ist ein Geschäftsplan? | definition | tut:was-ist-ein-geschaftsplan |
| Was sollte ein Geschäftsplan beinhalten? | 13 sections incl. SWOT | tut:was-sollte-ein-geschaftsplan… |
| Beispiel Geschäftsplan | sample plan (0.15 €/m² office cleaning) | tut:beispiel-geschaftsplan |
| Welche rechtlichen Aspekte…? | Gewerbeanmeldung, HR, tax, insurance, labour law, GDPR | tut:welche-rechtlichen-aspekte… |
| GmbH, UG oder Einzelunternehmen? | legal forms | tut:gmbh-ug-oder-einzelunternehmen |
| Wie sieht ein Finanzplan aus? | finance plan items | tut:wie-sieht-ein-finanzplan-aus |
| Beispiel Finanzplan | sample numbers | tut:beispiel-finanzplan |
| Was brauche ich alles an Ausrüstung? | equipment list | tut:was-brauche-ich-alles-an-ausrustung |
| Was benötige ich an Personal? | roles: cleaners, Vorarbeiter, Objektleiter, admin staff, specialists | tut:was-benotige-ich… |
| Wie finde ich qualifiziertes Personal? | recruiting channels | tut:wie-finde-ich-qualifiziertes-personal |
| Welche Marketingstrategien gibt es? | marketing | tut:welche-marketingstrategien-gibt-es |
| Wie finde ich Kunden und Aufträge? | acquisition | tut:wie-finde-ich-kunden-und-auftrage |
| Wie sorge ich für hohe Kundenzufriedenheit? | quality checks, complaints, feedback | tut:wie-sorge-ich… |
| Bundesinnungsverband… / Vorteile einer Mitgliedschaft | trade association (BIV) | tut:bundesinnungsverband…, tut:vorteile-einer-mitgliedschaft… |
| Warum sollte man eine Gebäudereiniger Software nutzen? | benefits per role (marketing for PlanD features) | tut:warum-sollte-man… |
| Worauf sollte man bei der Auswahl…achten? | criteria: easy, planning+time+payroll, mobile, **open interfaces** | tut:worauf-sollte-man… |
| Was sollte enthalten sein? | planning, mobile time, costs, chat, CRM, quotes/invoices | tut:was-sollte-bei… |
| Was sind Vorteile…? | benefits incl. "Controlling", "Lohnzahlungen direkt über die Software" | tut:was-sind-vorteile… |
| Wie binde ich meine Kunden? | retention | tut:wie-binde-ich-meine-kunden |
| Wie führe ich Buch? | bookkeeping basics | tut:wie-fuhre-ich-als-reinigungsfirma-buch |
| Angebote richtig schreiben | what a quote must contain | tut:angebote-richtig-schreiben… |
| So stellen Sie Rechnungen | what an invoice must contain | tut:so-stellen-sie-rechnungen… |
| Wie kann ich wachsen? | growth strategies | tut:wie-kann-ich-als-reinigungsfirma-wachsen |
| Webinare | feature claims + the 3 Feb-2026 webinars | tut1:webinare |
| Wie gründe ich… Step by Step (tutorials-1) | **only a cookie-consent wall was captured** | tut1:wie-grunde-ich-eine-reinigunsfirma-step-by-step |

---

## 6. Limits, rough edges, manual steps, gaps

1. **The staff app is not documented in text.** Its 7-min lesson is video + PDF only. The Servicekraft course says "No items found." (`onb:mitarbeiter-app`, `role:servicekraft`)
2. **All 5 role-specific courses are empty shells.** Geschäftsführung has no heading at all. Promised topics never appear in any lesson: "fertige Lohnabrechnung", "digitale Objektmappe". (`role:*`)
3. **Substitutes are picked by hand.** The title says "automatisch Vertretungen finden". The text shows: the system *lists* the affected Einsätze; a human chooses who covers each, or makes an open shift and later drags it onto someone. Help comes only from filters (Objekterfahrung, Auftragsart, Mitarbeitergruppe) and the capacity bar. (`onb:abwesenheiten…`, `onb:auftrage…`)
4. **Requesting / approving absences is announced but not shown.** Only office-side creation is shown. (`onb:abwesenheiten…`)
5. **Payroll ends in an export.** PlanD produces approved wage hours with surcharges and continued pay, then "export to the Lohnbüro or integrate your payroll program". No payroll run, payslips or named format (DATEV etc.) appears in these files. (`onb:lohnarten…`, `onb:fahrzeiterfassung…`, `tut1:webinare`)
6. **Surcharge stacking is fixed**: when night, holiday and Sunday coincide, only the highest applies. **Nothing says this is configurable.** (`onb:lohnarten…`)
7. **The location check is a single distance rule**: check-in/out more than **800 m** from the address → review. **The lesson does not say whether 800 m is adjustable** (the tolerances are). **A site is an address only** — no drawn boundary or per-site radius is mentioned. (`onb:freigabe…`)
8. **Employees can switch GPS off.** That is flagged for review, not blocked. (`onb:freigabe…`)
9. **"Soll-Zeit rounding" switch**: when on, **times are rounded UP to the plan** (paid by plan even when shorter, within tolerance). A blunt global rule. (`onb:freigabe…`)
10. **Travel time is TYPED by the employee**, not measured. It is only accepted between two Einsätze within the max gap (default 3 h) and needs a per-contract permission. (`onb:fahrzeiterfassung…`)
11. **Series edits apply only to the future.** Split-off occurrences detach permanently from the series. A team occurrence delete asks two separate questions — easy to get wrong (inference). (`onb:auftrage…`)
12. **Monthly material budgets only** ("Verbrauch bezieht sich immer auf einen Monat"). **No articles configured = anything can be ordered** — permissive by default. **No stock or inventory is described.** (`onb:materialbestellungen…`)
13. **The ticket assignee list defaults to people who already worked at that site.** Others need "alle User laden". (`onb:ticket…`)
14. **Ticket close text is AI-generated** by an "integrierte KI". **The lesson does not say whether the customer-facing wording can be reviewed** before it is sent. (`onb:ticket…`)
15. **The customer portal is per Objekt via QR/link.** No customer login or account is described (inference: possible access-control weakness). (`onb:ticket…`)
16. **Invoice numbering**: "Nächste Rechnungsnummer 200 → RE-201" — **the field is off by one from its label** (the lesson's own example). (`onb:die-wichtigsten-faktura…`)
17. **Recurring invoices are drafts or fully automatic.** Monthly drafts appear on the 1st. Changing positions means editing the Auftrag or each draft. (`onb:wiederholende-rechnungen…`)
18. **Dynamic positions need a product to exist first.** They bill on Soll, on Lohnzeit (approved paid hours), or per Termin. **Customers therefore pay what staff are paid for** — any approval error reaches the customer invoice directly (inference). (`onb:dynamische-positionen…`)
19. **Not covered by ANY how-to**: **dunning (Mahnwesen)** — absent everywhere, only "see unpaid invoices" in marketing; **quality checks / checklists**; **Arbeitsscheine** (work sheets); the **Controlling module**; **data import / migration**; **custom roles or permissions** (only 4 fixed levels); **API / integrations** (only "offene Schnittstellen" in a buyer's-guide article); **multi-company**; **shift swaps by staff**; **pause/break rules**. (all files checked)
20. **Customer absence e-mails**: a setting chooses whether customers are e-mailed about absences and substitutes. **This is all-or-nothing in the description, not per customer.** (`onb:abwesenheiten…`)
21. **Leave days are counted on contract working days.** The text does not mention public holidays in that count (not stated either way). Carry-over and waiting time are configurable; the default figure of 30 days is cited from the Rahmentarifvertrag. (`onb:einstellungen…`, `onb:urlaubstage…`)
22. **The site shows signs of being mid-rebuild**: "PlanD Rebuild 2026" headers; lesson menus that omit "Aufträge und Einsatzplanung"; two video-only lessons; one tutorials-1 page captured only as a cookie wall. (all files)
