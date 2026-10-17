# PlanD (pland.app): feature inventory

Source: cleaned site text in `pland/clean/`. Each item cites its file. Anything marked **[inferred]** is my reading, not a site statement.
Files read in full: all 11 `funktionen__*.txt`, ki-assistenz, home, software-gebaeudereinigung, gebaeudereinigung-app, werk, werk-lp, werk-pictures, hausmeisterdienste-lp, nutzer, registrieren, lohnabrechnung-mit-pland, demo, kontakt, contact-us, produkt-updates, cms-berlin-2024, impressum.

**Page-name traps (the URL does not match the content):**
- `nutzer.txt` = the industry page for building cleaning (Gebäudereinigung).
- `registrieren.txt` = the industry page for landscaping (Garten- und Landschaftsbau). It is not a sign-up page.
- `contact-us.txt` = the industry page for caretaking (Hausmeisterservices).
- `kontakt.txt` = a form to book a call-back (Rückruftermin).
- `produkt-updates.txt` is empty apart from its title, so there is no public changelog.

---

## 0. Positioning
- **One product, one app.** Pitched as the "All-in-One Branchenlösung für Gebäudedienstleister": one cloud dashboard plus one employee app. The newer copy calls it a "cloudbasierte KI-Lösung" (home).
- **Five core areas** (Kernbereiche, numbered 01–05): Einsatzplanung, Zeiterfassung, Lohnabrechnung, Rechnungsprogramm, KI-Assistenz (nutzer / registrieren / contact-us).
- **Function categories on the overview page:** Einsatzplanung, Zeiterfassung, Lohnabrechnung, Rechnungsstellung, Stammdatenverwaltung, Kommunikation, Warenwirtschaft, Qualitätsmanagement (funktionen__uebersicht).
- **Section tabs on the software page:** Angebote & Kalkulation, Abwesenheitsmanagement, Arbeitsscheine, Rechnungswesen, Qualitätsmanagement, Controlling (software-gebaeudereinigung).
- **Platforms:**
  - The web dashboard runs "von jedem Computer und Browser".
  - The employee app is for iOS and Android and is said to run on "über zehntausend Smartphones" / "10.000+ Gerätetypen" (funktionen__uebersicht FAQ, gebaeudereinigung-app).
- **Target size:** "PlanD eignet sich vor allem für Unternehmen ab 5 Mitarbeitern". If a lead picks 1–5 employees on the demo form, they are diverted to email hallo@pland.app (demo, kontakt).

## 1. Shift and job planning (Einsatzplanung / Dienstplan)
Source: funktionen__einsatzplanung-gebaeudereinigung, unless another file is named.
- **Planning employees (Mitarbeiter planen):**
  - A digital planner with a week view (Wochenansicht, per the image caption).
  - Covers one-off special jobs (Sonderauftrag) and recurring maintenance cleaning (Unterhaltsreinigung).
  - A recurring Unterhaltsreinigung "muss nur einmal angelegt werden und läuft dann automatisch weiter" (gebaeudereinigung-app).
- **Skills and availability (Fähigkeiten und Verfügbarkeiten):** filter staff by qualification (Qualifikationen) and capacity (Kapazitäten). Planning can use availability, capacity and working hours stored in the system (software-gebaeudereinigung).
- **Rule checks (Gesetzliche und tarifliche Vorgaben):** the planner warns automatically when a plan breaks a legal or collective-agreement (tariff) rule.
- **Mobile rota (Mobiler Dienstplan):** staff see past and upcoming jobs, each with name, address, time and a note (Bemerkung).
- **Push notifications (Push-Benachrichtigungen bei Änderungen):** sent on new jobs or changes, in real time (also in funktionen__uebersicht under "Benachrichtigungen").
- **Team visibility:** in the app, Unterhaltsreiniger see which team they work with on each job (gebaeudereinigung-app).
- **Planning assistant (Planungsassistent):** answers "Wer hat noch Zeit? Wer ist in der Nähe?" (funktionen__uebersicht). This implies location- and availability-based suggestions **[inferred]**.
- **Absence calendar inside planning (Abwesenheitskalender):** past and upcoming absences, and planning around leave requests (Urlaubsanträge).
- **Cover planning (Vertretungsplanung):**
  - Finds the best stand-in by capacity and qualification.
  - **Emails the client automatically about the stand-in.** This is also listed under "Kunden Kommunikation" in funktionen__uebersicht.
- **Break and travel times (Pausen- & Fahrzeiten):** can be stored per job and per standing order (Dauerauftrag), and are counted automatically in time tracking (funktionen__uebersicht).
- **Marketing claims:** "Oelfke: 30 % Zeitersparnis bei der Einsatzplanung" (home). "Hehl: nahezu eine Vollzeitstelle, acht Stunden am Tag" (einsatzplanung page).

## 2. Absences (Abwesenheitsverwaltung / Abwesenheitsmanagement)
Source: funktionen__abwesenheitsverwaltung, einsatzplanung, gebaeudereinigung-app, software-gebaeudereinigung.
- **Reporting in the app (Einfache Meldung per App):** staff report sickness or leave in the app ("ohne Anrufe, Notizzettel oder WhatsApp"). They can attach sick notes, photos and documents (Krankheitsscheine).
- **Automatic cover suggestions (Automatische Vertretungsvorschläge):** the system suggests suitable stand-ins and can "automatisch einplanen".
- **Shared view (Zentrale Übersicht für alle Abteilungen):** Objektleitung, Innendienst and Geschäftsführung all see the same real-time absence calendar.
- **Leave balance:** staff see their remaining leave days (verbleibende Urlaubstage) in the app.
- **One-click approval:** a supervisor approves with one click. The employee is notified automatically of approval or changes (Digitaler Urlaubsantrag, funktionen__uebersicht).
- **Absence types and continued pay:** custom absence types (individuelle Abwesenheitsarten) each define their continued-pay rule (Entgeltfortzahlung). See §4.

## 3. Time tracking (Zeiterfassung)
Source: funktionen__zeiterfassung-gebaeudereinigung, unless another file is named.
- **Mobile clock-in (Arbeitszeiten mobil erfassen):**
  - Staff clock in and out at the site (Objekt) through the app, and the times are visible to the office in real time.
  - "Mit einem Klick starten".
- **Breaks and travel (Pausen & Fahrzeiten):** added automatically or manually. There is an onboarding article "Fahrzeiterfassung mit PlanD" (file list only, not read).
- **Fixing missed punches (Stempel vergessen? Einfach nachtragen):** staff can add a forgotten clock-in afterwards through the digital timesheet.
- **Digital timesheet (Digitaler Stundenzettel):**
  - Each employee sees their hours and the hours approved for the month (freigegebene Stunden).
  - The timesheet is "automatisch übersetzt" (nutzer, funktionen__uebersicht).
  - Approval happens on the office side (Freigabe von Zeiterfassungen, onboarding article title).
- **GPS location check (GPS Standorterfassung / Standortkontrolle):**
  - Checks the employee is at the right site.
  - Sends an automatic alert when someone clocks in outside the planned site radius (Objekt-Radius) (funktionen__uebersicht, nutzer).
- **Planned vs. actual check (Automatischer Soll/Ist-Vergleich):**
  - Clocked times are matched against the rota for both time and place, and checked for errors.
  - Deviations are detected and reported right after the job.
  - There is a screen listing faulty punches (fehlerhafte Zeitstempel, image caption).
- **Proof of service (Leistungen digital dokumentieren / Leistungsnachweise):** photos, notes and signatures captured at the site.
- **Surcharges and wage types (Zuschläge und Lohnarten):** night, holiday and hazard surcharges (Gefahrenzuschläge) and wage types are freely definable and computed for payroll.
- **Export:** DATEV, CSV, custom export (Benutzerdefinierter Export), or direct API.
- **Offline:** "im vollen Umfang offline" (every page). The landscaping example is clocking in on a site with no signal (registrieren).
- **Legal FAQ:** cites the duty to record working time ("Seit Mai 2019 …"), meaning start, end and breaks.
- **Language count is inconsistent:** the time-tracking FAQ says "über 16 Sprachen", while most pages say 25+.
- **Marketing claims:** "DGS/Emons: 30 % Zeitersparnis bei der Zeiterfassung" (home). An Emons success-story title says "30 % mehr Zeit" (file list).

## 4. Payroll preparation and payroll (Lohnabrechnung)
Source: funktionen__lohnabrechnung-gebaeudereinigung, lohnabrechnung-mit-pland, software-gebaeudereinigung.
- **Employment types and wage types (Anstellungsverhältnisse und Lohnarten):** custom employment relationships and wage types, "von Lohngruppe 1 bis 9" (the cleaning-trade wage groups) up to special performance types (Leistungsarten). "Tariflöhne" are supported (funktionen__uebersicht).
- **Automatic surcharges (Automatisch Zuschläge ermitteln):**
  - Night, Sunday and holiday surcharges are computed per the Rahmentarifvertrag, based on the rota.
  - Custom surcharge types (Zuschlagsarten) can be added.
- **Continued pay (Entgeltfortzahlung):** per absence type, choose one of: unpaid, contract hours (Vertragsstunden), planned hours, or the hourly average (Stundendurchschnitt).
- **Claimed compliance:** "hält automatisch alle gesetzlichen Vorgaben wie Mindestlöhne, Lohnzuschläge … ein und beachtet Urlaubs- und Abwesenheitsvorgaben" (FAQ).
- **Leave-day calculation settings:** an onboarding article "Einstellungen für die Urlaubstageberechnung" (title only).
- **Export (Benutzerdefinierter Export, Schnittstellen):** CSV for the payroll office, DATEV, "andere Lohnprogramme", custom export, and API. They offer to build a custom connection over their API ("API-Schnittstelle … individuelle Anbindung").
- **Payroll done inside PlanD (lohnabrechnung-mit-pland):**
  - *Managed Payroll Service* by partner **Relog**: "mit einem Klick" the specialists produce all wage and salary slips, with automatic data handover.
  - *Lohnsoftware*: the **Addison** interface from Relog, so the customer runs payroll themselves "inkl. Einhaltung aller tariflichen Vorgaben".
  - Claimed reach: "200+ Gebäudedienstleister setzen bereits auf unsere integrierte Lohnabrechnung".
- **Marketing claims:**
  - "Glanzhelden: 2 Std. statt 10 Tagen Lohnabrechnung" (home).
  - Temberger / Ismail Aygül: "früher 10 Tage … heute ein halber Tag" (demo, hausmeisterdienste-lp).
  - Goldener Elch "schaffte die Stundenzettel bei 150+ Mitarbeitern ab" (lohnabrechnung-mit-pland).

## 5. Quotes, invoices and finance (Angebote & Rechnungen / Faktura / Rechnungsprogramm)
Source: funktionen__angebot-und-rechnung-gebaudereinigung, unless another file is named. The werk pages call this product line **"PlanD Faktura"**.
- **Quotes (Angebote):**
  - Custom quotes in minutes, built from a catalogue of products and services (Produkte und Dienstleistungen); PlanD calculates the prices automatically (Kalkulation).
  - Sent by email or by post.
  - **The client accepts or declines online with one click**, through the client portal. The image caption reads "Angebot Online annehmen oder ablehnen".
  - "In wenigen Klicks aus einem Angebot ein Auftrag". Accepted quotes are invoiced automatically (funktionen__uebersicht).
  - Order confirmations (Auftragsbestätigungen versenden) (software-gebaeudereinigung).
  - Onboarding title: "Dynamische Positionen in Rechnungen" (title only).
- **Recurring invoices (Wiederkehrende Rechnungen):**
  - One-off or recurring.
  - **The invoice is created automatically once a job is finished.**
  - Typical use: Unterhaltsreinigung as a standing invoice (Dauerrechnung), Sonderauftrag invoiced once (nutzer).
- **Sending:** automatic email, PDF download, one-click print, **by post (Postversand)**, or published in the client dashboard (Kunden-Dashboard) (FAQ).
- **Corrections:** cancellation invoices (Stornorechnungen) and credit notes (Gutschriften).
- **Interim, partial and final invoices (Teil- und Abschlagsrechnungen → Schlussrechnung):** any number of these, merged into a final invoice. The landscaping example is a new installation (Neuanlage) billed with interim and final invoices (registrieren).
- **Standing invoices (Dauerrechnungen):** a fixed amount each period. The landscaping example is a maintenance contract (Pflegevertrag) billed as a Dauerrechnung.
- **Dunning (Mahnwesen):**
  - Custom payment reminders and dunning levels (Mahnstufen).
  - PlanD "erstellt automatisch eine Mahnung" for overdue invoices, with escalation levels (funktionen__umsatzuebersicht).
- **Own letterhead and branding (Eigenes Briefpapier / Personalisiertes Branding):** your logo in PlanD and custom document design.
- **Invoice recipient vs. service recipient (Rechnungs- & Leistungsempfänger):** extra service recipients can be added to an invoice recipient.
- **E-invoices (E-Rechnungen), tagged NEU:** ZUGFeRD and X-Rechnung.
- **Bank connection (Bankanbindung), tagged NEU:**
  - A PSD2-compliant bank link; invoices are marked paid automatically.
  - Incoming payments are matched automatically to the right invoice, with booking number, client and amount (funktionen__umsatzuebersicht).
- **Work slips to invoice (Arbeitsscheine → Rechnung):** see §6.
- **Material orders to invoice:** material orders can become invoices, with prices stored per client and adjustable for each one (FAQ).
- **Faktura settings:** onboarding article "Die wichtigsten Faktura-Einstellungen" (title only).

## 6. Digital work slips (Arbeitsscheine)
Source: funktionen__arbeitsscheine, angebot page, contact-us, software-gebaeudereinigung.
- **Attached to jobs:** a slip is stored behind a job (hinter Einsätzen hinterlegt) and every slip is available on the phone.
- **Signature on site (Digitale Unterschrift vor Ort):** the client signs on the smartphone and the signature is stored automatically.
- **Straight to the office:** hours, photos and signatures reach the office in real time.
- **Signed slip becomes an invoice:**
  - The signed slip is handed to invoicing in real time and is "automatisch in Rechnungen umgewandelt" (FAQ).
  - Caretaking example: a one-hour small repair (Kleinreparatur) is signed on site, then converted directly into an invoice (contact-us).
- **Payment by QR code (Schnellere Bezahlung):**
  - "Kunden … Rechnungen per QR-Code sofort begleichen".
  - Claim: clients "zahlen oft noch am selben Tag" and the money arrives "bevor Ihr Team vom Hof gefahren ist".
  - **[inferred]** This is likely a GiroCode/EPC QR bank-transfer code. The site does not say which.

## 7. Revenue overview and controlling (Umsatzübersicht / Controlling / Deckungsbeiträge)
Source: funktionen__umsatzuebersicht, angebot page, software-gebaeudereinigung, funktionen__uebersicht.
- **Open items (Offene Posten):** daily view of paid, open and overdue invoices.
- **Revenue dashboard:** the Faktura dashboard shows expected (voraussichtlich) and collected (vereinnahmt) revenue.
- **Contribution analysis:** which orders, sites or services contribute most.
- **Profitability per order (Deckungsbeiträge / Profitabilität):**
  - Wages and materials compared with the revenue a client brings in, "in Echtzeit".
  - Also daily expenses (tägliche Ausgaben).

## 8. Tasks and tickets (Aufgabenmanagement / Ticket-System / Reklamationen)
Source: funktionen__aufgabenmanagement, software-gebaeudereinigung.
- **List view:** central list with filters and search.
- **Kanban board:** cards moved by drag & drop between status columns.
- **Linked to records:** a task links to staff, clients, sites (Objekte), orders (Aufträge), invoices or equipment (Geräte). The site says PlanD links tasks "automatisch".
- **Complaints and processes:** covers complaints (Reklamationen) and internal processes, by open, in-progress or done.
- **Client tickets:** a ticket a client raises is assigned automatically to the responsible employee and "bei der nächsten Reinigung berücksichtigt" (software-gebaeudereinigung).
- **Client emails on tickets:** clients are told automatically about their ticket requests (Kunden Kommunikation, funktionen__uebersicht).

## 9. Quality management (Qualitätsmanagement)
- **Quality checks (Qualitätschecks / Qualitätskontrollen):**
  - Document work at the client with photos, comments and **star ratings**.
  - Site managers (Objektleiter) run regular checks in the app to spot a downward trend in quality (funktionen__uebersicht, software-gebaeudereinigung).
- **Proof of service (Leistungsnachweise):** replaces paper, and is sent online to the client "in Sekunden" (funktionen__uebersicht).
- **Objektleiter app:** complaints, specifications of services (Leistungsverzeichnisse) and quality checks for every site (gebaeudereinigung-app).

## 10. Master data and documents (Stammdatenverwaltung)
Source: funktionen__uebersicht.
- **Master data:** staff, clients, sites and orders in one system, available on the move. Onboarding articles "Kunden & Objekte in PlanD" and "Export von Stammdaten" (titles only).
- **Documents (Dokumentenverwaltung):** documents for clients, sites and staff, available on mobile.
- **Digital site folder (Digitale Objektmappe):** all photos, documents and tickets for a site, available anywhere.
- **Permission groups (Rechtegruppen):** custom groups that set access rights per staff group.
- **Employee hub (Mitarbeiter Zentrale, in the app):** employment contracts, leave balance, rota, approved hours, chat, and document upload (gebaeudereinigung-app).
- **Birthdays (Happy Birthday):** reminders for staff birthdays and work anniversaries (Firmenjubiläen).

## 11. Communication (Kommunikation)
- **Staff chat (Mitarbeiter-Chat):** one-to-one and group messages. Pitched as replacing WhatsApp, SMS, phone and email (gebaeudereinigung-app, funktionen__uebersicht).
- **Chat translation (Chats übersetzen):** messages are translated automatically. The app page says "Chats in 16+ Sprachen", while nutzer and the overview say timesheets and chats are translated in 25+.
- **Client communication (Kunden Kommunikation):** automatic emails about tickets and stand-ins.
- **Client portal (Kunden-Portal / Kunden-Dashboard):** clients request proofs of service (Leistungsnachweise), raise tickets, request extra services (Zusatzleistungen), accept quotes and receive invoices (funktionen__uebersicht, software-gebaeudereinigung, angebot FAQ).
- **AI replies (Künstliche Intelligenz):** "generiert automatisch Antworten auf Kundenanfragen" (funktionen__uebersicht). See Paula below.

## 12. Materials and stock (Materialbestellungen / Materialwesen / Warenwirtschaft)
Source: funktionen__materialbestellungen, funktionen__uebersicht.
- **Ordering from the app:** staff report missing material in the app, and it goes automatically to the office.
- **Per-site materials:** managed per site (objektspezifisch) and ordered with one click.
- **Traceability:** every order is documented, showing what was ordered, when it arrives and where it is needed.
- **Delivery notes (Lieferscheine):** generated automatically for clients and suppliers when new material is requested.
- **Billing:** material orders become invoices, with per-client prices (§5).
- **Usage view:** owners see materials and usage per site (Verbräuche) (Calandra quote, demo/software page).

## 13. Equipment (Geräteverwaltung)
Source: funktionen__geraeteverwaltung.
- **Location history (Einsatzorte nachvollziehen):** each device is assigned to a site, with history of where it has been.
- **Responsibility (Verantwortlichkeiten):** devices are assigned to people or teams.
- **Central record (Zentrale Dokumentation):** all device information in one place, across sites.
- **Maintenance and inspections (Wartung und Prüfungen):** automatic reminders for maintenance, inspection intervals and statutory checks, e.g. **DGUV V3**.
- **Examples given:** vacuum cleaners and cleaning robots (funktionen__uebersicht).
- **Landscaping angle:** "Geräte und Wartung im Blick" (home).

## 14. Training and other
- **MyTutorial interface (Schulungsplattform für Reinigungskräfte):** video training "über die PlanD App in über 16 Sprachen" on cleaning topics. Mytutorial presented "PlanD x Mytutorial" at Werk (funktionen__uebersicht, werk).
- **Zapier integrations:** "Verbinden Sie sich mit tausenden Tools", e.g. an email tool, a CRM, or other industry software.
- **Free updates (Kostenlose Updates):** "Wir veröffentlichen jeden Monat neue Funktionen … automatisch und kostenlos".
- **Green hosting (Umweltschonend):** servers run on green power only (Ökostrom) and are "klimaneutral".
- **Onboarding guides:** articles per role, namely Geschäftsführung, Innendienst, Lohnbuchhaltung, Objektleiter and Servicekraft (file list `onboarding-user__*`, not read).

---

## 15. Paula, the AI assistant (KI-Assistenz)
Source: ki-assistenz, plus home, nutzer, contact-us, registrieren and funktionen__uebersicht.

**Pitch:** "Sagen Sie Hallo zu Ihrer neuen KI-Kollegin". Paula is the AI assistant for building-services firms (Gebäudedienstleister). She answers requests, re-plans jobs and creates tasks directly in PlanD. The overview page says she "geht ans Telefon, schreibt Angebote und plant um".

**Three channels: "In PlanD, im Postfach, am Telefon"**
1. **In PlanD:**
   - Finds invoices, prepares quotes and re-plans jobs, by voice or in chat (per Sprache oder im Chat).
   - "Zugriff auf alle PlanD Daten", "Per Sprache steuerbar", "Lernt dazu".
   - "Kennt Ihr Unternehmen von Anfang an".
2. **Email:**
   - Reads incoming email, prioritises it, creates the matching task, and drafts a reply **in your writing style** ("Lernt Ihren Schreibstil").
   - "Abschicken tun immer Sie". Drafts link directly to records in PlanD.
3. **Phone:**
   - Answers calls and asks the right follow-up questions.
   - Passes the finished request to the responsible person, whether the caller is a new client, an employee or a job applicant (Bewerber).
   - "24/7 erreichbar", "Anpassbar an eigene Prozesse".
   - Answers in the company's name, e.g. "Gebäudeservice Müller, Paula am Apparat".

**Example workflows (the "Ein Tag mit Paula" timeline)**
- **05:48, a sick call in the app (Krankmeldung):**
  - Lena reports sick.
  - Paula @-mentions a replacement in the job thread ("Könntest du heute für Lena einspringen?") and the colleague accepts.
  - "Paula hat den Einsatz bearbeitet" and "Paula hat die Umplanung freigegeben". So Paula **approves the re-plan herself**, without a human click in this demo.
  - Tagline: "Paula plant um, bevor Sie im Büro sind."
- **10:14, a quote request by email:**
  - "Büro Müller GmbH" asks for a window-cleaning quote (Glasreinigung).
  - Paula creates the task, assigns it, and asks back (RÜCKFRAGE) whether to prepare a quote.
  - Buttons: "Ja, ohne Rabatt senden" / "Ja, mit 10 % Rabatt" / "Absenden".
  - Tagline: "Paula bereitet Angebote vor. Sie bestätigen nur noch."
- **22:40, an after-hours call:**
  - A tenant reports the stairwell light is out.
  - Paula takes the call, then creates the task "Rückruf Frau Yilmaz — Licht Treppenhaus Süd" for tomorrow, with a note to the caretaker (Hausmeister) at 22:41.
- **Sample audio, 0:42:** a new client wants about 400 m² of window cleaning. Paula asks for the deadline and whether inside and outside surfaces are included.
- **Industry versions:**
  - Caretaking: a tenant reports water damage at 22:00 (contact-us).
  - Landscaping: ten hedge-trimming emails (Heckenschnitt) are prioritised and drafted (registrieren).
  - Cleaning: a client calls while the owner is on site (nutzer).

**"Heute: Sie → Ab jetzt: Paula" (tasks Paula takes over)**
- Answering the phone round the clock.
- Reading email and drafting replies.
- Finding cover and re-planning on a sick call.
- Preparing quotes from a request.
- Creating and assigning tasks.

**Control model**
- "Was Paula erledigt, sehen Sie in PlanD. E-Mails und Angebote gehen erst raus, wenn Sie es sagen."
- "Was sie vorbereitet, geben Sie frei – oder nicht" (nutzer).
- The sick-call demo contradicts this (see above): there the re-plan is approved by Paula.

**Price, contact and proof**
- **Price: "Ab 99 € im Monat. Je nach Umfang und Unternehmensgröße erstellen wir Ihnen ein passendes Angebot."** This is the only price anywhere on the pages read.
- **Live demo line: +49 30 75939111** ("Rufen Sie an und sprechen Sie selbst mit ihr").
- **Customer quotes:**
  - MKM immo.service (Kristina Schroeder): "Wir verpassen keine Anrufe mehr".
  - Hehl (Daniel Staiber): "Die E-Mail-Entwürfe sind wahnsinnig gut".
  - Emons (Dominik Clasen): "rund 10 Arbeitsstunden pro Woche" saved.
- **Limits:** none stated. No call minutes, languages, LLM provider or hosting are given.
- **Context:** home now says "cloudbasierte KI-Lösung", and Paula appears on every feature page ("Das kann auch Paula erledigen"). A blog post covers "KI … zur intelligenten Telefonassistenz" (file list). **[inferred]** Paula is a 2025/26 launch and the current headline feature.

---

## 16. Industry-specific angles

**Building cleaning (Gebäudereinigung)** (nutzer, software-gebaeudereinigung, gebaeudereinigung-app)
- Unterhaltsreinigung set up once and repeating; Sonderauftrag by push.
- Cover by qualification. Example: "Montag, 6 Uhr, zwei Krankmeldungen".
- Lohngruppe 1–9 and Rahmentarifvertrag surcharges.
- Dauerrechnung for maintenance cleaning.
- Out-of-site clock-in alerts, needed because of many sites and short jobs.
- **"Eine App, drei Anwender":**
  - Unterhaltsreiniger: sees their team.
  - Sonderreiniger: gets pushes, and breaks and travel are automatic.
  - Objektleiter: complaints, specifications of services and quality checks via the digital site folder.

**Caretaking (Hausmeisterservice)** (contact-us, home, hausmeisterdienste-lp)
- Site care (Objektbetreuung), winter service (Winterdienst) and small repairs (Kleinreparaturen).
- Digital site folder with photos; client requests grouped per site.
- Signed work slip, then invoice.
- Black-ice re-planning example ("Glatteis, drei Objekte, ein Mitarbeiter krank").
- GPS with travel between sites.
- Winter service at 5 a.m. and Sunday surcharges.
- Paula takes a tenant's water-damage call at 22:00.
- The older landing page (hausmeisterdienste-lp) also claims "Nr. 1", "500+", "Deutsche Server und eine verschlüsselte Kommunikation", and "Persönlicher Kundensupport … rund um die Uhr".

**Landscaping (Garten- und Landschaftsbau / GaLaBau)** (registrieren, home)
- Care, new installation (Neuanlage) and winter service.
- Rain re-planning example ("Es regnet seit Dienstag, das Pflasterteam steht").
- Offline clock-in on site.
- Seasonal workers (Saisonkräfte) and changing hours, with payroll export.
- Pflegevertrag as a Dauerrechnung; Neuanlage with interim and final invoices.
- Equipment maintenance.
- Paula triages hedge-trimming emails.
- Testimonial: Gebäudedienste Landsberg, which is a cleaning firm. There is no real GaLaBau customer quote.
- **[inferred]** The GaLaBau and Hausmeister pages are the same template re-skinned; no feature exists only for these industries.

---

## 17. Integrations and exports
- **DATEV:** payroll export or interface (lohnabrechnung, zeiterfassung, uebersicht).
- **Relog:**
  - Managed Payroll Service.
  - **Addison** payroll software via Relog (lohnabrechnung-mit-pland). The site calls Relog "das führende Lohnabrechnungssystem".
- **CSV and custom exports:** custom payroll export and master-data export (onboarding title).
- **API:** a "direkte API-Schnittstelle"; custom connections built on request. No public API documentation is referenced.
- **Zapier:** "tausende Tools".
- **MyTutorial:** video e-learning inside the app.
- **Bank (PSD2), NEU:** automatic payment matching.
- **E-invoice formats, NEU:** ZUGFeRD and X-Rechnung.
- **Post:** physical letter dispatch of quotes and invoices. **[inferred]** Done through a print-and-mail service; none is named.
- **Help centre:** help.pland.app, which is Intercom-style per the URL pattern **[inferred]**.
- **Event platform:** Luma, used for Werk registration (werk-lp).

## 18. Commercial, support, company facts
- **Pricing:**
  - **No published plans or seat prices** on any page read.
  - Paula costs "ab 99 €/Monat", priced individually ("je nach Umfang und Unternehmensgröße").
  - No trial is offered; the call to action everywhere is "Demo buchen" (a free demo) or a call-back.
- **Lead qualification:**
  - The demo form asks for company size bands (1–5 … 500+) and an optional PlanD contact person: Leon, Tobias, Jonas, Josefine, Chris, Matthias or Ege.
  - Response promised "innerhalb der nächsten 24 Stunden".
  - Leads with 1–5 employees are redirected to email (demo).
- **Onboarding and setup:**
  - "PlanD begleitet Sie in Online-Meetings vom Stammdaten-Import bis hin zur Erst-Aktivierung" (uebersicht FAQ).
  - Training (Schulungen) online or on site at the customer.
  - Customer Success Managers, e.g. Josefine Woeller, who has "hunderte" set-ups behind her (werk).
  - Customer claims: Stier moved "innerhalb von fast einem Monat"; ProNordic implemented "über Nacht" (file title); Emons and Keifert spoke on fast onboarding.
- **Support:**
  - Support centre and customer chat "täglich zwischen 9:00 und 18:00 Uhr" (uebersicht FAQ).
  - This conflicts with hausmeisterdienste-lp, which says "rund um die Uhr".
  - Support contact: support@pland.app, or through the dashboard (impressum).
- **Data protection and hosting:**
  - "100 % DSGVO-konform", "deutsche Datenschutz-Standards".
  - "Deutsche Server", encrypted communication (hausmeisterdienste-lp).
  - Green power and climate-neutral servers.
  - No ISO or other certification is named.
- **Contract terms:** nothing stated on the pages read. A blog line warns readers against software contracts longer than 5 years (grep hit, blog).
- **Legal entity:**
  - **comm'on digital GmbH**, Mulackstraße 19, 10119 Berlin.
  - Represented by Tobias Wittekindt.
  - HRB 271121 B, Amtsgericht Charlottenburg; VAT ID DE 321077921.
  - Tel +49 30 692085790, marked "Kein Support"; hallo@pland.app.
  - Impressum dated "Wirksam ab 01. Mai 2020" (impressum).
- **People named:**
  - Tobias Wittekindt: "Gründer und Geschäftsführer".
  - Jonas Herzer: Chief of Staff.
  - Josefine Woeller: Customer Success Manager.
  - Christoph Ehegoetz and Helena Kasten-Hoersch: PlanD staff on the Werk agenda.
  - Demo-form contacts: Leon, Matthias, Ege, Chris.
- **Not stated:** founding year, team size and funding are not on the pages read.

## 19. Marketing claims and numbers (by page)

**Customer counts (inconsistent across pages)**
- "800+ Gebäudedienstleister": home, nutzer, demo, kontakt.
- "500+": software-gebaeudereinigung, hausmeisterdienste-lp.
- "Über 200": gebaeudereinigung-app, lohnabrechnung-mit-pland.
- "200+ … integrierte Lohnabrechnung": lohnabrechnung-mit-pland.

**Markets and languages**
- Markets: DE, AT, NL, CH (software-gebaeudereinigung, app page).
- Languages: 25+ on most pages; 16+ on the app page, the time-tracking FAQ and the MyTutorial blurb.
- Device support: 10,000+ devices.

**Ratings and positioning**
- Ratings "5,0 / 4,9" and "5 / 5 · 4,9 / 5". The source platforms are not named; the images were stripped.
- Self-description: "Die innovativste cloudbasierte Nr. 1 All-in-One Branchenlösung" (hausmeisterdienste-lp).

**Results claimed on home / nutzer**
- Kille: 50 % weniger Verwaltungszeit. An OW Harder story title also says 50 %.
- DGS / Emons: 30 % Zeitersparnis Zeiterfassung.
- Cujic: +15 % Mitarbeiterzufriedenheit.
- Stier: 80.000 € pro Jahr gespart, from moving in about a month; a story title says "zwei Vollzeitstellen".
- Glanzhelden: 2 Std. statt 10 Tagen Lohnabrechnung.
- Oelfke: 50 % weniger Anrufe ("Handy klingelt nur noch halb so häufig").
- Goldener Elch: 30 % Zeitersparnis Einsatzplanung.
- Hehl: nearly 8 h per day saved.
- Emons with Paula: about 10 h per week saved.

**Logo wall (also on home)**
- Includes **HBC-Service GmbH**. Werk describes it as "Familienunternehmen mit über 500 Mitarbeitenden an sechs deutschen Standorten", MD Stephan Teichmann, who sat on the Werk panel.
- There is also a success story file `erfolgsgeschichte-hbc-services-gmbh.txt`, which was not read (outside scope).

## 20. New or recent
- **Tagged "Neu":** E-Rechnungen (ZUGFeRD/X-Rechnung) and Bankanbindung (PSD2) (angebot page).
- **Paula:** AI phone, email and in-app assistant from €99/month; the site's main message is now AI-first.
- **Managed Payroll and Addison (Relog):** worded "ab sofort" / "Ab jetzt", which reads as recent **[inferred]**.
- **QR-code payment on work slips:** a newer standalone feature page **[inferred]**.
- **New standalone feature pages:** Aufgabenmanagement with Kanban, Geräteverwaltung with DGUV V3, Materialbestellungen and Abwesenheitsverwaltung. Their template is newer than the older pages, which still say 16+ languages **[inferred]**.
- **Industry pages for Hausmeister and GaLaBau:** these widen the market beyond cleaning.
- **PlanD Werk / 01:**
  - Their first invite-only annual meeting: 24 June 2026, AchtBerlin, Schönhauser Allee 8.
  - Thanks "120+ Entscheider:innen".
  - Eligibility: "mindestens ein Reinigungsunternehmen mit 20 Mitarbeitern".
  - Agenda included "welche Features in 2026 gelauncht sind und welche noch folgen werden" and KLEEGO's "AI-first Unternehmen mit PlanD".
- **Trade fairs:**
  - CMS Berlin 2023 (19–22 Sept 2023, Hall 3.2 stand 103 and Hall 5.2 stand 300i).
  - A CMS Berlin 2025 blog post (file list).
- **Changelog:** `produkt-updates` is empty, so there is no public changelog.
