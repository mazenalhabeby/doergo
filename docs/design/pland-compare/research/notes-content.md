# PlanD (pland.app) — blog + Arbeitslexikon content notes

Source dir: `scratchpad/pland/clean/`. File names below are relative to it (prefix `blog__` / `arbeitslexikon__` kept).
All 77 blog articles read in full; 44 Arbeitslexikon pages skimmed (titles, PlanD mentions, all numbers/§ lines; the tariff/surcharge pages read fully).
`blog-categories__*.txt` (arbeitsrecht, digitalisierung, personal, wissen-tipps) contain only "Protected page / Password" — no content.

---

## 1. Product features / capabilities revealed in the blog (beyond the basics)

Baseline claim repeated everywhere: "Plan A für jeden Gebäudereiniger … Einsatzplanung, Zeiterfassung, Lohnabrechnung, Rechnungsstellung in einem System und einer App". Below = the less obvious things.

### AI — "Paula"
- **Paula = KI-Telefonassistenz**, integrated into the All-in-One software: answers every inbound call 24/7 (Neukundenanfragen, Reklamationen, Rückrufe, interne Anliegen, Öffnungszeiten), asks structured questions (wer ruft an, welches Objekt, Reklamation oder Anfrage, Rückruf/Soforteinsatz nötig?), **creates Aufgaben/Tickets, forwards to the right person, coordinates Rückrufe, automatic transcription → Gesprächsprotokolle**. Configurable per company: "individuelle Workflows und Vorlagen" — you define how calls are run, what is asked, what processes trigger; "durch gezieltes Prompting wird Paula kontinuierlich besser". Can provide Objektinformationen. — `blog__ki-in-der-gebaudereinigung-vom-digitalen-helfer-zur-intelligenten-telefonassistenz.txt`
- **Paula = KI-Sprachassistentin inside the app** (first shown live at CMS 2025): natural-language commands ("Zeig mir den Dienstplan für morgen", "Dokumentiere einen Defekt im Objekt XY", "Wer war letzte Woche in diesem Gebäude eingeteilt?"), **mehrsprachig in über 25 Sprachen**, reads PlanD live data; handles Krankmeldungen, Reklamationen, Vertretungsplanung, schnelle Auswertungen. **Nominated for Purus Innovation Award (PIA) 2025.** — `blog__pland-auf-der-cms-berlin-2025---erleben-sie-die-digitale-zukunft-der-gebaudereinigung-live.txt`
- KI-Themen they describe generically (not claimed as PlanD features): Tourenoptimierung, Predictive Cleaning via Sensorik, automatische Mängelerkennung, KI-Auswertung von Checklisten — same KI article.

### Planning / dispatch
- **Automatische Vertretungssuche**: on an absence the system proposes the best replacements by Qualifikationen + Kapazitäten/Verfügbarkeiten and informs them via PlanD — `blog__digitaler-dienstplan-5-vorteile-von-denen-ihr-unternehmen-profitiert.txt`, `blog__gebaudereinigung-reinigungsplan-hier-kostenlose-vorlage-herunterladen.txt`, `arbeitslexikon__abwesenheitsverwaltung.txt`
- **Drag-and-Drop Einsatzplanung**; PlanD suggests employees by Verfügbarkeit + Einsatzort; "Automatisierung von Routen und Schichtplänen", avoids long Fahrwege/overlaps — `blog__gebaudereinigung-wie-erstelle-ich-den-perfekten-einsatzplan-vorlage.txt`
- Filter employees by Qualifikationen and Kapazitäten — `blog__was-muss-ich-bei-einer-effizienten-personaleinsatzplanung-beachten.txt`
- Overload warning: "erkennt sofort wieviele Stunden Ihre Mitarbeiter arbeiten und informiert Sie im Falle einer möglichen Überbelastung" — same file; warnings on "Verstößen der Regularien" — `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt`
- Kapazitätsanalyse "um Engpässe zu vermeiden" — `arbeitslexikon__abwesenheitsverwaltung.txt`
- **Reinigungsintervalle**: Einsätze are auto-scheduled at the set interval — `arbeitslexikon__reinigungsintervall.txt`
- Feiertage **per Bundesland** respected in planning — `arbeitslexikon__feiertagsarbeit-gebaeudereinigung.txt`
- Push notification on every Dienstplan change — several (Dienstplan, Reinigungsplan articles)
- **Material-based cleaning plans**: Natursteinböden etc. stored with Materialkennzeichnung → staff automatically get the matching Reinigungsplan; "Materialbasierte Reinigungspläne automatisch generieren", bebilderte Anweisungen; long drying-time methods "im Tourenplan zeitlich versetzen"; Einwirkzeit of disinfection documentable — `blog__reinigungsmethoden-fur-verschiedene-oberflachen-so-reinigen-profis-richtig.txt`
- **Digitale Objektmappe** for Objektleiter: photos, documents, Zugangscodes, Sonderaufträge per Objekt, released to staff — `blog__wie-software-ihre-gebaeudereinigung-auf-das-naechste-level-hebt.txt`, `blog__gebaudereiniger-software-der-perfekte-guide-2023.txt`
- Per-Einsatz info: Notfallpläne, Codes für die Alarmanlage, Dokumente, Beschreibungsfeld — `blog__unterhaltsreinigung-die-ultimative-checkliste.txt`

### Time recording
- GPS-Ortung of employees + "standortbasierte Zeiterfassung" (ensures staff are at the right Einsatzort) — `blog__kostenlose-muster-einverstaendniserklaerung-fuer-die-gps-ortung-und-digitale-zeiterfassung.txt`; "Mobile Zeiterfassung mit Standortabgleich" — CMS 2025 article; GPS-Tracking + QR-Code stamping — `arbeitslexikon__stempeluhr.txt`
- **Algorithmic plausibility check of timestamps**; wrong timestamp → Objektleiter approves after talking to the employee; manual entry if someone forgot to stamp — `blog__zeiterfassung-in-gebaeudereinigung-einfuehren.txt`
- **Automatische Aufrundungsfunktion**: staff get full Soll-Zeit even if they finish an Objekt faster (employer still sees actual effort) — same file
- **Pausenanfragen via app approved by Objektleiter** — same file
- App in **mehr als 15 Sprachen**, auto-matching the phone language; Fotos + Emojis for communication — same file
- Digitaler Stundenzettel = centre of the app (built after customer surveys); real-time transmission to the office — same file, `blog__zeiterfassung-2-0-mit-dem-digitalen-stundenzettel.txt`
- Rollout case: 230-employee company (Ostwestfalen, GF Benjamin Volk) — 95 % of staff on the app within 2 months — `blog__zeiterfassung-in-gebaeudereinigung-einfuehren.txt`

### Payroll ("vorbereitende Lohnabrechnung")
- Zuschläge (Nacht, Sonn-, Feiertag) automatically **nach Rahmentarifvertrag** + **eigene Zuschlagsarten / benutzerdefinierte Zuschläge**, eigene Lohnarten, individuelle Anstellungsverhältnisse — `blog__die-tarifloehne-im-gebaeudereiniger-handwerk-werden-angehoben.txt`, `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt`, `arbeitslexikon__erschwerniszuschlaege.txt`
- Belastungszuschläge and Gefahrenzuschläge shown in payroll — `arbeitslexikon__erschwerniszuschlaege.txt`
- **Three Lohnfortzahlung methods for absences, selectable per absence**: (1) all planned hours, (2) Vertragsstunden per weekday, (3) average of last 3 months — `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt`
- Export "auf Knopfdruck" for final payroll; export for Steuerberater — `blog__gebaudereinigung-rechnungen-korrekt-stellen.txt`, `blog__digitale-lohnabrechnung-ein-blick-auf-die-vorteile-in-der-gebaudereinigung.txt`; **"Automatisierter Datev export"** — `arbeitslexikon__lohnabrechnung-gebaeudereinigung.txt`; "Vorbereitende Lohnabrechnung inklusive Schnittstellen" — CMS 2025 article
- Integration with DATEV or Lexware (accounting) — `blog__abschlagsrechnung-teilrechnung-schlussrechnung-alles-was-sie-wissen-mussen.txt`, `blog__schlussrechnung-einfach-erklart-bedeutung-aufbau-und-gesetzliche-vorgaben.txt`
- Resturlaub visible — `arbeitslexikon__abwesenheitsverwaltung.txt`; AU-Bescheinigungen uploaded in the app — same
- Employee self-service: see own Lohnabrechnungen, Urlaubsanträge, parts of the Personalakte — `blog__die-personalakte-in-der-gebaudereinigung-ein-umfassender-uberblick.txt`
- Personalakte: strict Rechtemanagement, encrypted storage, regular backups, Kategorien & Tags — same file

### Offers / invoicing ("Faktura")
- **Angebotskalkulation**: enter Stammdaten (Stundenlöhne, Materialkosten) + per room m² and Verschmutzungsgrad + Sonder-/periodische Leistungen → computes Zeitaufwand & cost; one click generates **Angebotsschreiben, Leistungsverzeichnis, Raumlisten** — `blog__wie-schreibe-ich-als-gebaudereinigung-gute-angebote.txt`
- Angebot sent by e-mail, customer confirms, **one click Angebot → Auftrag** — `blog__die-kalkulation-in-der-gebaudereinigung-…preisgestaltung.txt`, same file
- Auto-invoice when an Einsatz is finished; Dauerrechnung set up once and runs automatically — `blog__die-stornorechnung-…`, `blog__dauerrechnungen-in-der-gebaudereinigung.txt`
- **Digitaler Arbeitsschein** generated from the Auftrag ("Neuen Arbeitsschein erstellen"), contains services + hours, **customer signs on the cleaner's smartphone**, stored on the Einsatz, **one click → Rechnung** — `blog__hier-kostenlose-arbeitsschein-vorlage-herunterladen.txt`
- Mahnwesen: Faktura tool shows open/overdue invoices; Zahlungserinnerung + Mahnstufen with own Kopftext/Fußtext/Zahlungsziel templates, individuelle Mahngebühren — `blog__mahnwesen-in-der-gebaudereinigung-….txt`
- Gutschriften linked to original Rechnung/Bestellung, auto-booked into Finanzdaten, customer auto-notified by e-mail — `blog__gutschriften-in-der-gebaudereinigung-ein-leitfaden.txt`
- Abschlags-/Teil-/Schlussrechnungen with status tracking, "Überprüfungsfunktionen" that detect invoice errors, **Vertragsmanagement** (contracts stored and linked to invoice creation) — `blog__abschlagsrechnung-teilrechnung-schlussrechnung-…txt`
- **E-Rechnung: XRechnung + ZUGFeRD**, Leitweg-ID inserted automatically, send + archive — `blog__e-rechnungspflicht-alles-was-sie-wissen-mussen.txt`, `blog__gebaudereinigung-xrechnung-pflicht-ab-2025.txt`
- **Deckungsbeitrag per Auftrag** shown automatically; reports on Deckungsbeiträge, Aufgabenstatus, Auslastung — `arbeitslexikon__deckungsbeitrag.txt`, `blog__pland-die-all-in-one-software-fur-hausmeister.txt`; "Controlling-Modul" — `blog__gebaudereiniger-software-der-perfekte-guide-2023.txt`

### Quality / customer side
- Leistungsnachweis in app with **Bilder, Kommentare und Sterne**; Objektleiter (and optionally customer) notified at once; sent to customer in a few clicks — `blog__gebaudereinigung-reinigungsplan-…`, `blog__unterhaltsreinigung-die-ultimative-checkliste.txt`
- **QR-Code am Objekt** for staff (document extra work with photos) and customers (complaints) — `blog__unterhaltsreinigung-die-ultimative-checkliste.txt`
- **Digitaler Materialschrank per Einsatz** — staff order material from the app on site; orders recorded → Bestandsverwaltung — same file, `blog__glasreinigung-….txt`, `blog__gebaudereiniger-software-der-perfekte-guide-2023.txt`
- **Ticket-System** (assign to cleaners, status visible to customer) — `blog__gebaudereiniger-software-der-perfekte-guide-2023.txt`, `blog__welche-funktionen-sollten-alles-in-einer-gebaudereiniger-software-enthalten-sein.txt`; "Qualitätsmanagement & Ticketsystem" — CMS 2025 article
- **Kundenportal / Kunden-Login**: customers see status of their Objekte, wann/wo/von wem gereinigt, complaints via portal, auto-assigned and tracked — `blog__warum-kundenbindung-in-der-gebaudereinigung-entscheidend-ist.txt`, `arbeitslexikon__reklamationsmanagement.txt`; generic portal description (Servicehistorie, Zahlungen, Terminplanung, eskalation automation) in `blog__reklamationsmanagement-wie-eine-gebaudereiniger-software-helfen-kann.txt` (not explicitly attributed to PlanD)
- Chat: PlanD Chatfunktion; Gruppenchats per Projekt/Standort, share Fotos/Dokumente/Standort — `blog__5-tipps-…interne-kommunikation…`, `blog__welche-funktionen-…`
- Integrated Checklisten + automatische Benachrichtigungen, Verbrauchs-/Materialkontrolle — `blog__gebaudereinigung-was-fur-material-brauche-ich.txt`

### Positioning / company facts
- Also marketed as **Hausmeister-/Facility-Management software** and **CAFM** — `blog__pland-die-all-in-one-software-fur-hausmeister.txt`, `arbeitslexikon__cafm.txt`
- Cloud-based, desktop + mobile — Hausmeister article; **operated CO₂-neutral with 100 % Ökostrom** — `blog__7-tipps-fur-mehr-nachhaltigkeit-in-ihrer-gebaudereinigung.txt`
- DSGVO-compliant data protection claim — `blog__digitaler-dienstplan-…`
- Target size: "10 bis 20 Mitarbeitern bis … bis zu 1000 Mitarbeitern"; KMU focus — `blog__interclean-amsterdam-2024-….txt`
- Hamburg start-up; founders **Tobias Wittekindt (Geschäftsführer/CEO) and Luca Schleiss**, "aus der Industrie"; **Vertriebsleiter Karl Singer**; origin story "jahrelange Arbeit in einer Hamburger Gebäudereinigung" — `blog__zeiterfassung-in-gebaeudereinigung-einfuehren.txt`, `blog__wie-software-ihre-gebaeudereinigung-auf-das-naechste-level-hebt.txt`
- **Newcomer Award 2024 at Interclean Amsterdam** (stand 13.401B, Elicium Halle 13) — `blog__ruckblick-interclean-2024.txt`, `blog__interclean-amsterdam-2024-….txt`
- CMS Berlin 2023 exhibitor; CMS 2025 Halle 3.2, Stand 102 — `arbeitslexikon__cms-berlin.txt`, CMS 2025 article
- Customer story reference: "Erfolgsgeschichte mit Cleanjoyment" — `blog__nachhaltigkeit-in-der-gebaudereinigung-digitalisierung-….txt`
- Pricing: **no PlanD price anywhere in the blog**. Only generic advice: monthly/annual subscription or one-off; modular booking; beware contracts > 5 Jahre; free trial / demo — `blog__gebaudereiniger-software-der-perfekte-guide-2023.txt`. CTAs "Jetzt kostenlos testen", "Termin vereinbaren", free CMS ticket.

---

## 2. Regulatory & industry topics (with the facts as PlanD states them)

### Arbeitszeiterfassung
- BAG Grundsatzurteil (1 ABR 22/21), Sept 2022: duty to record working time from § 3 Abs. 2 Nr. 1 ArbSchG, applies to all firms regardless of size/Betriebsrat; builds on EuGH "Stechuhr-Urteil" 2019 — `blog__stundenzettel-vorlage-fuer-gebaeudereinigungen-kostenlos-herunterladen.txt`, `blog__digitale-zeiterfassung-ist-pflicht-auch-fuer-gebaeudereiniger.txt`
- Must record Beginn, Ende, Gesamtdauer, ideally same day; responsibility stays with employer even if delegated; Koalitionsvertrag 2025 foresees Übergangsfristen for KMU — `blog__digitale-zeiterfassung-ist-pflicht-auch-fuer-gebaeudereiniger.txt`
- Gebäudereinigung already had a Dokumentationspflicht under the **Schwarzarbeitsbekämpfungsgesetz** — same; **Mindestlohngesetz** documentation for unannounced **Zoll** checks — `blog__zeiterfassung-in-gebaeudereinigung-einfuehren.txt`
- Current rule: record within **7 Tagen**, paper or digital — `blog__zeiterfassung-2-0-mit-dem-digitalen-stundenzettel.txt`, `blog__gesetzentwurf-zur-digitalen-zeiterfassung-…`
- Heil draft (2022): electronic, manipulationssicher, same-day recording, keep **2 Jahre**; BIV opposed (≈ 700.000 Erfassungsgeräte needed); became a Prüfauftrag — `blog__gesetzentwurf-zur-digitalen-zeiterfassung-alles-was-sie-wissen-muessen.txt`
- **GPS-Ortung**: allowed with **written Einverständniserklärung**, only during working time, agree with Betriebsrat how Bewegungsdaten are collected/evaluated/stored; private phones need consent or employer must provide a device — `blog__kostenlose-muster-einverstaendniserklaerung-…`, `blog__gesetzentwurf-…`
- BYOD: Datensicherheit, Compliance/Datenschutz challenges — `blog__byod-bring-your-own-device-….txt`

### Arbeitszeitgesetz / RTV working time
- RTV: 39 h/Woche, 8 h/Werktag excl. Pausen; Mehr-/Minderarbeit balanced within one month without Mehrarbeitszuschlag; daily average must not exceed 8 h over 6 Monate/24 Wochen — `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt`, `arbeitslexikon__rahmentarifvertrag-gebaeudereinigung-2023.txt`
- ArbZG: max 8 h (up to 10), 48 h/Woche, ≥ 11 h Ruhezeit, 30 min Pause > 6 h — `arbeitslexikon__sollarbeitszeit.txt`; 45 min Pause at 8 h stated in `arbeitslexikon__dienstplan.txt`; BetrVG § 87 Abs. 1 Nr. 2 co-determination on Dienstplan — same
- Sollstunden: 39 × 4,33 = 168,87 ≈ 169/Monat; 39 × 52 = 2.028/Jahr; Jahresarbeitszeitkonten — `blog__gebaudereinigung-sollstunden-richtig-berechnen.txt`
- **Teilzeit-Anpassung (RTV)**: > 15 % over contract for 5 consecutive months → claim to contract adjustment (Jul/Aug/Sep and holidays/sickness ≤ 6 weeks excluded; claim lapses after 3 months unless asserted in writing) — `arbeitslexikon__rahmentarifvertrag-…`

### Wegezeiten / Fahrzeiten
- EuGH: workers without fixed workplace — travel from first to last trip (incl. home→first, last→home) is paid working time; may be paid below normal rate but **not below Mindestlohn**; each started half hour counts as half hour — `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt`, `arbeitslexikon__fahrzeiten.txt`
- RTV § 3: Wegezeit between sites paid as working time if Zwischenzeit ≤ 3 h; if travel needs > half the Zwischenzeit, whole Zwischenzeit is paid; work starts/ends at Sammelstelle if one must be visited — `arbeitslexikon__rahmentarifvertrag-…`

### Zuschläge (note: two conflicting sets on the site)
- **RTV per Arbeitslexikon**: Nacht (22–5 Uhr) **30 %**; Sonn- und Feiertag **80 %**; 1. Mai, Neujahr, 1./2. Weihnachtstag **200 %**; Heiligabend/Silvester **150 %** or paid Freistellung (TV since 1.1.2021); only highest Zuschlag applies; computed from Stundenlohn — `arbeitslexikon__rahmentarifvertrag-…`, `arbeitslexikon__nachtarbeit-…`, `arbeitslexikon__sonntagsarbeit-…`, `arbeitslexikon__feiertagsarbeit-…`, `arbeitslexikon__tarifvertrag-zur-freistellung-…`
- **Blog (older figures)**: Nacht 25 %, Sonntag 100 %, other gesetzliche Feiertage 150 %, ongoing Sunday/holiday work at same site 75 %, big holidays 200 % — `blog__gebaeudereinigung-arbeitszeiten-korrekt-berechnen.txt` (inconsistent with Lexikon)
- **Belastungszuschlag 25 %** beyond 8 h/day or alternatively beyond 40 h/week — same blog + `arbeitslexikon__erschwerniszuschlaege.txt`
- **Erschwerniszuschläge (PSA)**: Schutzanzug + Überschuhe/Kapuze/Brille/Handschuhe 5 %; + Filtermaske/luftunterstützt 15 %; + Pressluftatmer etc. 20 %; Vollschutz/Chemikalienschutzanzug Form C 40 %; Atemschutzmaske 10 % — `arbeitslexikon__erschwerniszuschlaege.txt`
- Zuschläge may not be paid off via higher wage; payslip by 15th of next month — `arbeitslexikon__zuschlaege-gebaeudereinigung.txt`

### Tariflöhne / Mindestlohn Gebäudereinigung
- Branche: ~700.000 Beschäftigte, "beschäftigungsstärkstes Handwerk" — `blog__die-tarifloehne-im-gebaeudereiniger-handwerk-werden-angehoben.txt`
- Einigung IG BAU / BIV on **15.11.2024**; Laufzeit 1.1.2025–31.12.2026; Allgemeinverbindlich via § 7 AEntG ("Zehnte Verordnung über zwingende Arbeitsbedingungen in der Gebäudereinigung") on **28.01.2025** (one blog says 1.2.2025); applies also to foreign firms; checked by Finanzkontrolle Schwarzarbeit (Zoll) — `blog__tariflohn-2026-…`, `arbeitslexikon__mindestlohntarifvertrag-2024.txt`, `blog__zeitarbeit-…`
- LG 1: 13,50 → **14,25 € (2025)** → **15,00 € (2026)**; LG 6: 16,70 → **17,65 €** → **18,40 €**; +11,1 % / +10,2 % over two years — several
- Full 2026 table (old → new): LG1 14,25→15,00; LG2 14,71→15,46; LG3 15,20→15,95; LG4 15,91→16,66; LG5 16,72→17,47 (but "derzeit nicht besetzt"); LG6 17,65→18,40; LG7 18,64→19,39; LG8 19,67→20,42; LG9 20,89→21,64 — `blog__tariflohn-2026-in-der-gebaudereinigung-….txt`
- Lohngruppen definitions 1–9 (LG 5 entfallen seit 2011) — `blog__lohngruppen-in-der-gebaudereinigung.txt`, `arbeitslexikon__rahmentarifvertrag-…`
- Azubi: 1.000 / 1.150 / 1.300 € (from 900/1.035/1.200); no 13. Monatseinkommen; talks on a Gewerkschaftsbonus (Nov/end 2025, earliest 2027); IG BAU had demanded > 30 % — `blog__tarifeinigung-…`, `blog__die-tarifloehne-…`
- Mindestlohn TV: due by 15th of following month; Verfallklausel 6 months; verstetigter Monatslohn possible for geringfügig Beschäftigte; Betriebsrat must be informed — `arbeitslexikon__mindestlohntarifvertrag-2024.txt`
- **Zusätzliches Urlaubsgeld**: after 6 months, **1,85 Tarifstundenlöhne pro Urlaubstag**, pro rata for part-time; Azubis 1/169 — `arbeitslexikon__tarifvertrag-uber-ein-zusatzliches-urlaubsgeld.txt`
- **Urlaub RTV**: 30 Arbeitstage (5-Tage-Woche) since 1.1.2021; 1/12 per full month on entry/exit; Urlaubslohn = average of last 12 months, min. tariff wage; carry-over lapses 3 months after year end — `arbeitslexikon__rahmentarifvertrag-…`
- **TZR (Tarifliche Zusatzrente)**: up to 4 % Entgeltumwandlung, up to 1.800 €/year tax-free; employer pays the SV contributions saved; via Zusatzversorgungskasse des Baugewerbes; shown separately on payslip — `arbeitslexikon__tarifvertrag-zur-regelung-der-tariflichen-zusatz-rente-tzr-2024.txt`
- Krankheit: AU certificate from day 4; 6 weeks Entgeltfortzahlung (avg. of 12 months); after Arbeitsunfall from week 7 Krankengeld-Zuschuss 3 Stundenlöhne/day up to week 9/12/15/17 by tenure — `arbeitslexikon__krankheitsausfall.txt`, `arbeitslexikon__krankmeldung.txt` (§ 5 EntgFG)
- Kündigungsfristen: 2 weeks; ≥5 J 1 Monat … ≥20 J 7 Monate zum Monatsende; first 2 weeks 1 Werktag — `arbeitslexikon__kuendigung.txt`
- Lohnabrechnung monthly, wage paid cashless by 15th of following month; electronic payslip only with consent — `arbeitslexikon__lohnabrechnung-gebaeudereinigung.txt`

### General Mindestlohn / Minijob / SV (from GVP article, Personaldienstleister focus)
- Gesetzlicher Mindestlohn **13,90 € from 1.1.2026** (from 12,82 €) — `blog__das-neue-gpv-tarifwerk-2026.txt`; older "12€ ab Oktober 2022, Minijob 520 €" — `blog__gesetzentwurf-…`
- **Minijob-Grenze 603 €/Monat (≈ 43 h)**; **Midijob 603,01–2.000 €** — `blog__das-neue-gpv-tarifwerk-2026.txt`
- BBG 2026: KV/PV 5.812,50 €; RV/AV 8.450 €; Versicherungspflichtgrenze 6.450 € — same
- EEL (elektronische Entgeltbescheinigung) 2026 changes: transmission from first AU day, new Storno procedure, active report of end of Entgeltersatzleistung — same
- GVP-Tarifwerk replaces BAP/iGZ (Mantel-, Entgeltrahmen-, Entgelt-, Branchenzuschlags-TV); Zeitarbeit raises +2,99 % (1.1.2026) and +2,5 % (1.9.2026); EG 1 → 14,96 € — same
- Zeitarbeit EG 1–9 from 1.3.2025 (EG1 14,53 € … EG9 27,87 €, fixed to 30.9.2025); Equal Pay after 9 months; Verbot der Kettenüberlassung; BA Merkblatt 03/2025 must be handed out — `blog__zeitarbeit-in-der-gebaudereinigung-2025-….txt`
- **BAG Konzernprivileg** (§ 1 Abs. 3 Nr. 2 AÜG): no privilege if employee hired from the start/permanently for another group company; risks: fingiertes Arbeitsverhältnis, Bußgelder, SV-Nachforderungen — `blog__bag-urteil-zum-konzernprivileg-….txt` (no case number given)

### E-Rechnung / Rechnungsrecht
- E-Rechnung B2B "ab 2025" (Lexikon: all firms must transmit B2B invoices electronically from 1.1.2025; adapt by end 2024); formats XRechnung (EN 16931, Richtlinie 2014/55/EU, KoSIT) and ZUGFeRD (2.2.0 Profil XRECHNUNG accepted by Bund, E-RechV); public clients > 1.000 € already; Leitweg-ID — `blog__e-rechnungspflicht-…`, `blog__gebaudereinigung-xrechnung-pflicht-ab-2025.txt`, `arbeitslexikon__e-rechnung.txt`. Note: no mention of the 2025–2027/28 Übergangsfristen.
- **GoBD**: E-Rechnungen revisionssicher **≥ 10 Jahre** — `blog__e-rechnungspflicht-…`; Personalakte tax docs ≥ 10 years — `arbeitslexikon__personalakte.txt`
- Pflichtangaben of Abschlags-, Teil-, Storno-, Gutschrift (§ 14 UStG), Rechnungsempfänger vs Leistungsempfänger (Leistungsempfänger needed for Vorsteuerabzug) — respective blog files
- Mahnwesen: Fälligkeit after Abnahme (§ 641 BGB), 30-Tage-Frist (§ 286 BGB), Verzugszinsen 9 % (B2B) / 5 % (B2C) über Basiszinssatz — `blog__mahnwesen-…`

### Datenschutz / Personalakte
- DSGVO; what may not be in a Personalakte (irrelevant health data, religion/politics, Vorstrafen unless relevant); Einwilligungserklärung in Personalfragebogen; employee right of inspection — `blog__die-personalakte-…`, `blog__gebaudereinigung-was-sollte-alles-in-einem-personalfragebogen-….txt`, `arbeitslexikon__personalakte.txt`

### Arbeitsschutz / Hygiene / Normen
- 7 Regeln Arbeitssicherheit (PSA, Heben, Chemikalien/Mischverbote, Rutschgefahr, Leitern – top 3 Sprossen not to be used, Maschinen, Unterweisungen) — `blog__arbeitssicherheit-…`
- Gesundheitsrisiken (VOCs, Quats, HAVS, psychische Belastung) — `blog__gesundheitsrisiken-…`
- DIN EN 13549, DIN 77400 (Schulen), DIN 18065 (Treppenhäuser — as stated), DIN 18379 (RLT), DIN EN 1822, DIN EN ISO 14001, "DIN 13063" Krankenhaus; RKI, VAH-Liste, farbkodierte Tücher / Vier-Farben-System (rot WC, gelb Bad, grün Küche/Krankenzimmer, blau Oberflächen) — `blog__reinigungsstandards-und-din-normen-…`, `blog__hygienestandards-…`, `arbeitslexikon__vier-farben-system.txt`, `arbeitslexikon__din-normen.txt`
- Glas: Bundesverband Flachglas rules (no Abklingen with Glashobel, no alkaline/acid/fluoride) — `blog__glasreinigung-…`
- Gründung: Gebäudereinigung = zulassungsfreies Handwerk, title "Gebäudereiniger" protected — `blog__wie-grunde-ich-eine-reinigungsfirma-…`
- Ausschreibungen: DTVP, TED; Unbedenklichkeitsbescheinigungen der SV-Träger — `blog__ausschreibungen-…`

### Price benchmarks they publish (useful for a calculator)
- Fenster 3–7 €/Fenster or 10–20 €/m²; Büro 8–12 €/m²/Monat; Treppenhaus 50–100 €/Stockwerk/Monat; Teppich 2–5 €/m²; Sanitär 15–30 €/Anlage — `blog__die-kalkulation-…`
- Glas per m²: Fenster 2–4 €, Glasdach unten 2,50–5,50 / oben 5–8 €, Wintergarten 3–6 €, Fassade 2–6 €, Gerüst 5–10 €, Imprägnierung 5–20 €; Standardfenster 2,50–4 €/Seite; Grundreinigung 20–30 €/angefangene Stunde — `blog__glasreinigung-…`
- Osmose: Mischbettharz 50–200 €/1000 l vs Osmose ≈ 1 €/1000 l; up to 25 m from the ground — `blog__reinigen-mit-reinwasser-…`

---

## 3. Content / SEO strategy

- **Volume**: 77 blog articles + 44 Arbeitslexikon entries.
- **Categories**: Arbeitsrecht (29 articles), Wissen & Tipps (24), Digitalisierung (15), Personal (9). Category pages are password-protected in the crawl. Note "Arbeitsrecht" is used for invoicing topics too (Abschlags-/Teil-/Storno-/Gutschrift/E-Rechnung).
- **Dates**: every article shows "October 5, 2026" — a CMS re-publish/migration date, so true cadence cannot be read from the site. Content itself dates from ≈ 2022 (Heil draft, 12 € Mindestlohn) to late 2025/2026 (GVP 2026, Tariflohn 2026, CMS Sept 2025, Paula). Slugs keep old years while titles were updated (`…tariflohn-tabelle-2024` → "Tabelle 2025", `…guide-2023` → "(2025)", `…rahmentarifvertrag-2023` → "2025", Lexikon `…-2023`/`-2024` slugs titled "2026") — evergreen refresh of year keywords.
- **Authors**: no author bylines on any article. Named people only in content: Tobias Wittekindt (CEO), Luca Schleiss (co-founder), Karl Singer (Vertriebsleiter), customer Benjamin Volk; podcast host Max Herrmannsdörfer ("REINgehört", CMS 2023, rein-gehoert.podigee.io/73-wittekindt).
- **Voice**: mostly "Sie", some "du/dir" (Einsatzplan, Gründung, Gesundheitsrisiken, Tariflohn 2026) — inconsistent.
- **Target keywords** (from titles/slugs): Gebäudereiniger Software, Tariflohn/Lohntabelle Gebäudereinigung (2025/2026), Mindestlohn Gebäudereinigung, Rahmentarifvertrag, Lohngruppen, Zuschläge (Nacht/Sonntag/Feiertag/Erschwernis), Zeiterfassung Pflicht / BAG-Urteil, Stundenzettel Vorlage, Arbeitsschein Vorlage, Reinigungsplan Vorlage, Einsatzplan Vorlage, Personalfragebogen, E-Rechnung/XRechnung Pflicht, Abschlags-/Teil-/Schluss-/Storno-/Dauerrechnung, Gutschrift, Mahnwesen, Angebot schreiben, Kalkulation/Preise Glasreinigung, Unterhaltsreinigung Checkliste, Grundreinigung Wohnung, Reinigungsfirma gründen, Objektleiter Aufgaben, Reinigungskraft gesucht, DIN-Normen, Hygienestandards, Hausmeistersoftware, CAFM.
- **Lead magnets** (e-mail gated: "Sie erhalten den Download per Email … PlanD Ihnen Emails zusenden darf"):
  - Stundenzettel-Vorlage — `blog__stundenzettel-vorlage-…`, linked from Arbeitszeiten article
  - Arbeitsschein-Vorlage — `blog__hier-kostenlose-arbeitsschein-vorlage-…`
  - Reinigungsplan-Vorlage — `blog__gebaudereinigung-reinigungsplan-…`
  - Einsatzplan-Vorlage (title only) — `blog__gebaudereinigung-wie-erstelle-ich-den-perfekten-einsatzplan-vorlage.txt`
  - Personalfragebogen PDF — `blog__gebaudereinigung-was-sollte-…personalfragebogen…`
  - Muster-Einverständniserklärung GPS-Ortung & Zeiterfassung — `blog__kostenlose-muster-einverstaendniserklaerung-…`
  - Angebots-Vorlage — `blog__gebaudereinigung-so-schreiben-sie-angebote.txt`, `blog__wie-schreibe-ich-…gute-angebote.txt`
  - Rechnungs-Muster — `blog__gebaudereinigung-rechnungen-korrekt-stellen.txt`
  - Newsletter ("Jetzt kostenlos den PlanD Newsletter abonnieren") on every Lexikon page
  - Free CMS-2025 ticket + Termin booking; "kostenlose Software-Vorstellung"
  - No calculators found.
- **Structure**: each article ends with a feature-specific CTA box matching the topic (e.g. Mahnwesen → "Rechnungen mit PlanD schreiben", Tariflohn → "PlanD berechnet die Löhne … nach den aktuellen Tarifbedingungen") + 3 fixed "related" teasers (KI/Paula, GVP 2026, BAG Konzernprivileg — the newest posts). Lexikon pages: definition + facts + "Seien Sie mit PlanD auf der sicheren Seite" feature bullets.
- **Event content**: Interclean 2024 (preview + recap), CMS 2023, CMS 2025, podcast.
- **Duplicates / thin content**: two "Reinigungskraft gesucht" articles, two "Reinigungsmethoden für verschiedene Oberflächen" articles, Abschlagsrechnung text duplicated across 3 articles, Schlussrechnung article reuses the Teilrechnung text; slug `digitale-zeiterfassung-eine-pflicht-…` actually contains "Reinigungsarten"; "Zeitarbeit 2025" article has no PlanD CTA; one article ends "Jetzt mit Plan digital durchstarten!" (typo). Some consumer-oriented content (Hausmittel, Zuhause) off-target.
- **Sponsored/partner content**: Osmose article links to "Mobile Osmoseanlagen im Shop" (Osmobil) — `blog__reinigen-mit-reinwasser-…`.

---

## 4. Comparisons / named competitors

- **No competing software is named or compared** anywhere in the blog or Lexikon.
- Named alternatives they position against: Excel-Tabellen, Papier-Stundenzettel, WhatsApp/SMS/E-Mail, fest installiertes **Zeiterfassungsterminal** (case study: terminal failed — internet outages, cleaner switched it off for the vacuum, not worth it for objects cleaned 1–2×/week) — `blog__zeiterfassung-in-gebaeudereinigung-einfuehren.txt`; "branchenübergreifende Softwareanbieter" vs PlanD's niche focus — `blog__digitale-lohnabrechnung-…`; "ohne komplizierte Branchenlösungen" — CMS 2025 article.
- Third-party names: DATEV, Lexware (integrations); Zoom, Microsoft Teams; Indeed, StepStone, Monster, LinkedIn, Xing, Facebook; DHL GoGreen; Gold Standard / Verified Carbon Standard; Osmobil; Cleanjoyment (customer); ChatGPT (mention).

---

## 5. Inventory

### Blog articles (displayed date for all = October 5, 2026; category in brackets)
- 3 Schritte wie Software Gebäudereiniger bei der Rekrutierung neuer Mitarbeiter unterstützen kann [Personal]
- 5 effiziente Wege, die Mitarbeitermotivation in Ihrem Unternehmen zu steigern [Personal]
- 5 Tipps wie Sie die interne Kommunikation in Ihrem Unternehmen verbessern [Personal]
- 7 Tipps für mehr Nachhaltigkeit in Ihrer Gebäudereinigung [Digitalisierung]
- Abschlagsrechnung richtig erstellen: Schritt-für-Schritt-Anleitung [Arbeitsrecht]
- Abschlagsrechnung, Teilrechnung & Schlussrechnung: Alles was Sie wissen müssen [Arbeitsrecht]
- Arbeitssicherheit in der Gebäudereinigung: Die 7 wichtigsten Regeln für ein sicheres Arbeitsumfeld [Wissen & Tipps]
- Ausschreibungen in der Gebäudereinigung: Ein Leitfaden für Unternehmen [Wissen & Tipps]
- BAG-Urteil gefallen: Digitale Zeiterfassung ist Pflicht auch für Gebäudereiniger [Arbeitsrecht]
- BAG-Urteil zum Konzernprivileg: Neue Maßstäbe für die Gebäudereinigung [Arbeitsrecht]
- BYOD (Bring Your Own Device) in der Gebäudereinigung: Effizienzsteigerung durch private Endgeräte? [Digitalisierung]
- Das neue GPV-Tarifwerk 2026 [Arbeitsrecht]
- Dauerrechnungen in der Gebäudereinigung [Arbeitsrecht]
- Die Abschlussrechnung in der Gebäudereinigung: So behalten Sie den Überblick [Arbeitsrecht]
- Die Personalakte in der Gebäudereinigung: Ein umfassender Überblick [Arbeitsrecht]
- Die Stornorechnung: Fehler korrigieren und Klarheit schaffen [Arbeitsrecht]
- Die Tariflöhne im Gebäudereiniger-Handwerk werden angehoben [Arbeitsrecht]
- Digitale Lohnabrechnung: Ein Blick auf die Vorteile in der Gebäudereinigung [Digitalisierung]
- Digitaler Dienstplan: 5 Vorteile, von denen Ihr Unternehmen profitiert [Digitalisierung]
- Du willst eine Reinigungsfirma gründen? Das musst du beachten [Wissen & Tipps]
- E-Rechnung wird Pflicht 2025: Alles, was Sie wissen müssen [Arbeitsrecht]
- Gebäudereiniger Software: Der perfekte Guide (2025) [Digitalisierung]
- Gebäudereinigung Reinigungsplan: Hier kostenlose Vorlage herunterladen [Wissen & Tipps]
- Gebäudereinigung: Arbeitszeiten für Reinigungskräfte korrekt berechnen [Arbeitsrecht]
- Gebäudereinigung: Rechnungen an Kunden korrekt stellen [Arbeitsrecht]
- Gebäudereinigung: Sollstunden richtig berechnen [Arbeitsrecht]
- Gebäudereinigung: Tariflohn Tabelle 2025 [Arbeitsrecht]
- Gebäudereinigung: Was für Material brauche ich? [Wissen & Tipps]
- Gebäudereinigung: Was Sie beim Schreiben von Angeboten beachten müssen [Arbeitsrecht]
- Gebäudereinigung: Was sollte alles in einem Personalfragebogen enthalten sein? + Kostenlose Vorlage downloaden [Personal]
- Gebäudereinigung: Wie erstelle ich den perfekten Einsatzplan? / Vorlage [Digitalisierung]
- Gebäudereinigung: XRechnung Pflicht ab 2025? [Arbeitsrecht]
- Gesetzentwurf zur digitalen Zeiterfassung: Alles was Sie wissen müssen [Arbeitsrecht]
- Gesundheitsrisiken bei Reinigungskräften - Gefahren erkennen & vorbeugen [Wissen & Tipps]
- Glasreinigung: Welche Leistungen sind alles enthalten und wie kalkuliere ich sie? [Wissen & Tipps]
- Gutschriften in der Gebäudereinigung: Ein Leitfaden [Arbeitsrecht]
- Hier kostenlose Arbeitsschein Vorlage herunterladen [Digitalisierung]
- Hygienestandards in der Gebäudereinigung 2025 [Wissen & Tipps]
- Interclean Amsterdam 2024: Die Welt der Reinigungstechnologie trifft sich in Amsterdam [Digitalisierung]
- Kalkulation in der Gebäudereinigung: Ein umfassender Leitfaden für eine erfolgreiche Preisgestaltung [Wissen & Tipps]
- KI in der Gebäudereinigung: Vom digitalen Helfer zur intelligenten Telefonassistenz [Digitalisierung]
- Kostenlose Muster-Einverständniserklärung für die GPS-Ortung und digitale Zeiterfassung [Arbeitsrecht]
- Lohngruppen in der Gebäudereinigung [Wissen & Tipps]
- Mahnwesen in der Gebäudereinigung: Wie und wann schreibe ich am besten Zahlungserinnerungen und Mahnungen? [Arbeitsrecht]
- Nachhaltigkeit in der Gebäudereinigung: Digitalisierung als Schlüssel zu einer umweltfreundlicheren Branche [Digitalisierung]
- PlanD auf der CMS Berlin 2025 – Erleben Sie die digitale Zukunft der Gebäudereinigung live! [Wissen & Tipps]
- PlanD Rückblick Interclean 2024 [Digitalisierung]
- PlanD: Die All-in-One Software für Hausmeister [Wissen & Tipps]
- PlanD-CEO Tobias Wittekindt im Podcast „REINgehört" über Digitalisierung und KI in der Gebäudereinigung [Digitalisierung]
- Rechnungsempfänger und Leistungsempfänger: Definition und Unterschiede [Arbeitsrecht]
- Reinigen mit Reinwasser – Wie Osmoseanlagen die Gebäudereinigung revolutionieren [Wissen & Tipps]
- Reinigungsarten: Ein Blick auf verschiedene Reinigungsmethoden [Wissen & Tipps] (slug: digitale-zeiterfassung-eine-pflicht-in-der-gebaudereinigung)
- Reinigungskraft gesucht: 5 Wege, um qualifiziertes Reinigungspersonal zu finden [Wissen & Tipps]
- Reinigungskraft gesucht: Das sind die besten Wege, qualifiziertes Reinigungspersonal zu finden [Personal]
- Reinigungsmethoden für verschiedene Oberflächen – So bleibt alles strahlend sauber [Wissen & Tipps]
- Reinigungsmethoden für verschiedene Oberflächen: So reinigen Profis richtig [Wissen & Tipps]
- Reinigungsstandards und DIN-Normen – Was muss man als Gebäudereinigung einhalten? [Wissen & Tipps]
- Reklamationsmanagement: Wie eine Gebäudereiniger-Software helfen kann [Wissen & Tipps]
- Saisonale Reinigungstipps für jede Jahreszeit – und wie digitale Tools wie PlanD dabei unterstützen können [Wissen & Tipps]
- Schlussrechnung einfach erklärt: Bedeutung, Aufbau und gesetzliche Vorgaben [Arbeitsrecht]
- Stundenzettel Vorlage [Arbeitsrecht]
- Tarifeinigung in der Gebäudereinigungsbranche: Mindestlohn steigt ab 2025 [Arbeitsrecht]
- Tariflohn 2026 in der Gebäudereinigung: Das sind die neuen Stundenlöhne ab 1. Januar 2026 [Arbeitsrecht]
- Tariflöhne in der Gebäudereinigung: Ein Blick auf den Rahmentarifvertrag 2025 [Arbeitsrecht]
- Teilrechnung: Alles was Sie wissen müssen [Arbeitsrecht]
- Warum Kundenbindung in der Gebäudereinigung entscheidend ist [Wissen & Tipps]
- Was ist eigentlich eine Unterhaltsreinigung? Die ultimative Checkliste [Wissen & Tipps]
- Was muss ich bei einer effizienten Personaleinsatzplanung beachten? [Personal]
- Was sind eigentlich die Aufgaben eines Objektleiters in der Gebäudereinigung? [Personal]
- Welche Funktionen sollten alles in einer Gebäudereiniger Software enthalten sein? [Digitalisierung]
- Wie schreibe ich als Gebäudereinigung gute Angebote? [Wissen & Tipps]
- Wie sieht eine Grundreinigung in einer Wohnung aus? [Wissen & Tipps]
- Wie Software Ihre Gebäudereinigung auf das nächste Level hebt [Digitalisierung]
- Zeitarbeit in der Gebäudereinigung 2025: Neue Regeln, höhere Löhne und wichtige Änderungen [Arbeitsrecht]
- Zeiterfassung 2.0 mit dem digitalen Stundenzettel [Digitalisierung]
- Zeiterfassung in der Gebäudereinigung: Wie Sie den Prozess mit den Mitarbeitern gestalten [Personal]
- Zeitmanagement für Reinigungskräfte - Alle Tipps & Hilfsmittel [Personal]

### Arbeitslexikon terms (44)
Abschlagsrechnung, Abwesenheitsverwaltung, CAFM, CMS Berlin, Dauerrechnung, Deckungsbeitrag, Dienstplan, DIN-Normen, E-Rechnung, Erschwerniszuschläge, Facility Management, Fahrzeiten, Feiertagsarbeit, Glasreinigung, Grundreinigung, HR-Software, Krankheitsausfall, Krankmeldung, Kündigung, Lohnabrechnung, Lohntarifvertrag Gebäudereinigung 2026, Mindestlohntarifvertrag Gebäudereinigung 2026, Mitarbeitermotivation, Nachtarbeit, Personalakte, Personaleinsatzplanung, Personaleinstellung, Personalfragebogen, Rahmentarifvertrag Gebäudereinigung 2026, Reinigungsintervall, Reinigungsplan, Reklamationsmanagement, Schlussrechnung, Sollarbeitszeit, Sonntagsarbeit, Stempeluhr, Stundenzettel, Tarifvertrag über ein zusätzliches Urlaubsgeld, Tarifvertrag zur Freistellung an Heiligabend oder Silvester, Tarifvertrag zur Regelung der Tariflichen Zusatz-Rente (TZR) 2026, Teilrechnung, Unterhaltsreinigung, Vier-Farben-System, Zuschläge
