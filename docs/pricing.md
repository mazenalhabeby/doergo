# HBCField — Pricing (shipped model: Office / Field seats)

> The pricing is **decided and built** (see `docs/billing-plan.md`, `billing-architecture.md`,
> `billing-feature-gating.md`). This doc keeps the *strategy* behind the numbers.
> Product model: **2 roles — Admin & (dynamic) Member**, plus `platform` (WEB / MOBILE / BOTH)
> and per-user access profiles. Billing seats are derived from platform access, **not** role:
> **Office seat** = Admin or any web-capable member · **Field seat** = mobile-only member.
> Competitor prices are directional (~early 2026) — verify live. Strategy, not financial advice.

---

## English

### Short answer
Price in the **FSM tier (~€20–30 blended /user)** — not the commoditized attendance tier (€2–10).
HBCField overlaps three normally-separate tools: **Field Service Management + Time & Attendance + GPS tracking.**

### The model: 2 seat types (office priced by tier, field flat)

| Seat | Price | Who it maps to | Why |
|------|-------|----------------|-----|
| **Office** | **€29 / €59 / €99** per user/mo (by tier) | Admins + any member with **web access** (managers, dispatchers, coordinators) | The value seat |
| **Field** | **€19** flat per user/mo (all tiers) | **Mobile-only** members — execute tasks, clock in, GPS | Where the headcount is |
| **Enterprise** | from **€199/mo** or custom | Multi-site / bespoke | Sales-assisted |

- The seat type is derived from the user's **platform access** (`getAccessPlatforms`), so an admin
  scopes a technician to *mobile-only* and they bill at €19 automatically.
- Blended ≈ **€20–30 /user** for a typical crew (few office seats, many field). E.g. Professional
  with 3 office + 12 field = 3×€59 + 12×€19 = **€405/mo for 15 users ≈ €27/user**.
- **Annual = 2 months free** (monthly × 10). **14-day trial = Professional, no card.**

### Flat tiers (feature gating — seats set *who pays*, tiers set *what's unlocked*)

| Plan | Office / Field | Unlocks (cumulative) |
|------|----------------|----------------------|
| **Starter** | €29 / €19 | Tasks, attendance, GPS, schedules, mobile, **service reports & photos** |
| **Professional** ⭐ | €59 / €19 | + custom fields, task dependencies, recurring, overtime engine, invoicing |
| **Business** | €99 / €19 | + project/agile (sprints, epics, phases), workflows, audit log, multi-org delegation, priority support |
| **Enterprise** | from €199 | + bespoke add-ons, custom terms |

> Note: **service reports are core (Starter)** — the field-service completion flow (photos/signatures)
> ships on every tier. Everything above is enforced server-side (see `billing-feature-gating.md`).

### The pitch
> "Replaces Jobber (~€50) + Deputy (~€5) + Hubstaff (~€8) — one login — for **€59 an office seat, €19 a field tech**."
> Cheaper *and* consolidated.

### Where you sit vs competitors (verify live)
- **Above** commoditized attendance (Deputy / When I Work / Jibble €2–10) — don't signal "time clock."
- **At the low end** of FSM SMB (Workiz / Housecall €45–65) — breadth matches; maturity (no CRM/quotes, no payment collection, no accounting integrations yet) doesn't, *yet*.
- **Well below** enterprise FSM (ServiceTitan / FieldEdge €125–398).

### Rules that matter more than the number
- **Annual billing = 2 months free** (~17% off).
- **Floor ~€99/mo** — filters out 1–2 person accounts.
- **14-day free trial (Professional), no card.**
- **Land low, raise later** — every gap closed (invoice payments, Customer/Quote module, accounting integration, SOC2) is a documented price increase.

---

## Deutsch

### Kurze Antwort
Preis im **FSM-Segment (~20–30 € gemischt /Nutzer)** – nicht im Billig-Zeiterfassungs-Segment (2–10 €).
HBCField vereint drei normalerweise getrennte Werkzeuge: **Field-Service-Management + Zeiterfassung & Anwesenheit + GPS-Tracking.**

### Das Modell: 2 Sitztypen (Büro nach Tarif, Außendienst pauschal)

| Sitz | Preis | Wer | Warum |
|------|-------|-----|-------|
| **Büro (Office)** | **29 € / 59 € / 99 €** pro Nutzer/Monat (nach Tarif) | Admins + jedes Mitglied mit **Web-Zugriff** (Manager, Disponenten, Koordinatoren) | Der Wert-Sitz |
| **Außendienst (Field)** | **19 €** pauschal pro Nutzer/Monat (alle Tarife) | **Nur-Mobil**-Mitglieder – Aufgaben ausführen, ein-/ausstempeln, GPS | Wo die Anzahl ist |
| **Enterprise** | ab **199 €/Monat** oder individuell | Multi-Standort / maßgeschneidert | Vertriebsbegleitet |

- Der Sitztyp ergibt sich aus dem **Plattform-Zugriff** des Nutzers (`getAccessPlatforms`) – ein Admin
  setzt einen Techniker auf *nur mobil*, und er wird automatisch mit 19 € abgerechnet.
- Gemischt ≈ **20–30 €/Nutzer** für ein typisches Team (wenige Büro-Sitze, viele Außendienst). Z. B. Professional
  mit 3 Büro + 12 Außendienst = 3×59 € + 12×19 € = **405 €/Monat für 15 Nutzer ≈ 27 €/Nutzer**.
- **Jährlich = 2 Monate gratis** (Monat × 10). **14-Tage-Test = Professional, ohne Karte.**

### Feste Tarife (Funktionsfreischaltung – Sitze bestimmen *wer zahlt*, Tarife *was freigeschaltet ist*)

| Tarif | Büro / Außendienst | Enthält (kumulativ) |
|-------|--------------------|---------------------|
| **Starter** | 29 € / 19 € | Aufgaben, Anwesenheit, GPS, Zeitpläne, Mobil, **Serviceberichte & Fotos** |
| **Professional** ⭐ | 59 € / 19 € | + Benutzerdef. Felder, Aufgabenabhängigkeiten, Wiederkehrende Aufgaben, Überstunden-Engine, Rechnungsstellung |
| **Business** | 99 € / 19 € | + Projekt/Agile (Sprints, Epics, Phasen), Workflows, Audit-Log, Org-übergreifende Delegation, Priorisierter Support |
| **Enterprise** | ab 199 € | + maßgeschneiderte Add-ons, individuelle Konditionen |

> Hinweis: **Serviceberichte sind Kernfunktion (Starter)** – der Abschluss-Flow (Fotos/Unterschriften)
> ist in jedem Tarif enthalten. Alles darüber wird serverseitig erzwungen (siehe `billing-feature-gating.md`).

### Der Pitch
> „Ersetzt Jobber (~50 €) + Deputy (~5 €) + Hubstaff (~8 €) – ein Login – für **59 € pro Büro-Sitz, 19 € pro Außendienst-Techniker**.“
> Günstiger *und* konsolidiert.

### Positionierung gegenüber Wettbewerbern (live prüfen)
- **Über** der Billig-Zeiterfassung (Deputy / When I Work / Jibble 2–10 €) – nicht als „Stempeluhr“ wirken.
- **Am unteren Ende** des FSM-KMU-Segments (Workiz / Housecall 45–65 €) – Funktionsumfang passt; Reife (noch kein CRM/Angebote, keine Zahlungsannahme, keine Buchhaltungs-Integrationen) *noch* nicht.
- **Deutlich unter** Enterprise-FSM (ServiceTitan / FieldEdge 125–398 €).

### Regeln, die wichtiger sind als die Zahl
- **Jahresabrechnung = 2 Monate gratis** (~17 % Rabatt).
- **Mindestbetrag ~99 €/Monat** – filtert 1–2-Personen-Konten heraus.
- **14 Tage kostenlos testen (Professional), ohne Kreditkarte.**
- **Niedrig starten, später erhöhen** – jede geschlossene Lücke (Zahlungsannahme, Kunden-/Angebotsmodul, Buchhaltungs-Integration, SOC2) rechtfertigt eine Preiserhöhung.

---

## Notes / Caveats
1. **Billing is built, not deployed.** Payment goes live once the Stripe account + prices exist and the
   end-to-end test passes — see the go-live checklist in `docs/billing-feature-gating.md` §8.
2. **Prices are strategy, not financial advice** — real margin depends on infra cost/user, CAC and churn.
3. **Seat metering is automatic** — office vs field is derived from platform access and reconciled to
   Stripe on member add/remove (debounced, proration-aware). Two seat types keep metering simple.
