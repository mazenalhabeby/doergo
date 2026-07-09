# HBCField — Pricing Recommendation (Admin / Member model)

> Based on the current app: **2 roles — Admin & Member**, plus `platform` (WEB / MOBILE / BOTH)
> and per-user access profiles. Competitor prices are directional (~early 2026) — verify live.
> Strategic guidance, not financial advice. You cannot charge until the Stripe/seat-metering
> layer is built. See also `docs/competitive-analysis.md`.

---

## English

### Short answer
Price per member in the **FSM tier (~€30–39 blended)** — not the commoditized attendance tier (€2–10).
HBCField overlaps three normally-separate tools: **Field Service Management + Time & Attendance + GPS tracking.**

### Recommended: 2-seat pricing (matches the Admin/Member model)

| Seat | Price | Who it maps to | Why |
|------|-------|----------------|-----|
| **Admin** | **€39–49 /user/mo** | Owners, managers — full control, all modules, web + mobile | The value seat |
| **Member** | **€15–19 /user/mo** | Everyone else — execute tasks, clock in, track | Where the headcount is |

Blended ≈ **€22–28 /user** for a typical crew (few admins, many members).

### Optional field discount (using the `platform` flag — no Manager role needed)
- **Member — Web access** (office coordinator): **~€25–29**
- **Member — Mobile-only** (field technician): **~€12–15**

### Flat tiers (feature gating — roles set *who pays*, tiers set *what's unlocked*)

| Plan | Price basis | Unlocks |
|------|-------------|---------|
| **Starter** | Admin €19 / Member €9 | Tasks, attendance, GPS, schedules, mobile |
| **Professional** ⭐ | Admin €39 / Member €15 | + service reports, overtime engine, recurring, custom fields, invoicing |
| **Business** | Admin €69 / Member €25 | + multi-org delegation, audit log, workflows, priority support |

### The pitch
> "Replaces Jobber (~€50) + Deputy (~€5) + Hubstaff (~€8) — one login — for **€39 an admin, €15 a field member**."
> Cheaper *and* consolidated.

### Where you sit vs competitors (verify live)
- **Above** commoditized attendance (Deputy / When I Work / Jibble €2–10) — don't signal "time clock."
- **At the low end** of FSM SMB (Workiz / Housecall €45–65) — breadth matches; maturity (no CRM/quotes, no payment collection, no accounting integrations yet) doesn't, *yet*.
- **Well below** enterprise FSM (ServiceTitan / FieldEdge €125–398).

### Rules that matter more than the number
- **Annual billing = 2 months free** (~17% off).
- **Floor ~€99/mo** — filters out 1–2 person accounts.
- **14-day free trial, no card.**
- **Land low, raise later** — every gap closed (invoice payments, Customer/Quote module, accounting integration, SOC2) is a documented price increase.

---

## Deutsch

### Kurze Antwort
Preis pro Mitglied im **FSM-Segment (~30–39 € gemischt)** – nicht im Billig-Zeiterfassungs-Segment (2–10 €).
HBCField vereint drei normalerweise getrennte Werkzeuge: **Field-Service-Management + Zeiterfassung & Anwesenheit + GPS-Tracking.**

### Empfehlung: 2-Sitz-Preismodell (passt zum Admin/Mitglied-Modell)

| Sitz | Preis | Wer | Warum |
|------|-------|-----|-------|
| **Admin** | **39–49 € /Nutzer/Monat** | Inhaber, Manager – volle Kontrolle, alle Module, Web + Mobil | Der Wert-Sitz |
| **Mitglied** | **15–19 € /Nutzer/Monat** | Alle anderen – Aufgaben ausführen, ein-/ausstempeln, Tracking | Wo die Anzahl ist |

Gemischt ≈ **22–28 € /Nutzer** für ein typisches Team (wenige Admins, viele Mitglieder).

### Optionaler Außendienst-Rabatt (über das `platform`-Feld – keine Manager-Rolle nötig)
- **Mitglied – mit Web-Zugriff** (Büro-Koordinator): **~25–29 €**
- **Mitglied – nur Mobil** (Außendiensttechniker): **~12–15 €**

### Feste Tarife (Funktionsfreischaltung – Rollen bestimmen *wer zahlt*, Tarife *was freigeschaltet ist*)

| Tarif | Preisbasis | Enthält |
|-------|------------|---------|
| **Starter** | Admin 19 € / Mitglied 9 € | Aufgaben, Anwesenheit, GPS, Zeitpläne, Mobil |
| **Professional** ⭐ | Admin 39 € / Mitglied 15 € | + Serviceberichte, Überstunden-Engine, Wiederkehrende Aufgaben, Benutzerdefinierte Felder, Rechnungsstellung |
| **Business** | Admin 69 € / Mitglied 25 € | + Organisationsübergreifende Delegation, Audit-Log, Workflows, Priorisierter Support |

### Der Pitch
> „Ersetzt Jobber (~50 €) + Deputy (~5 €) + Hubstaff (~8 €) – ein Login – für **39 € pro Admin, 15 € pro Außendienst-Mitglied**.“
> Günstiger *und* konsolidiert.

### Positionierung gegenüber Wettbewerbern (live prüfen)
- **Über** der Billig-Zeiterfassung (Deputy / When I Work / Jibble 2–10 €) – nicht als „Stempeluhr“ wirken.
- **Am unteren Ende** des FSM-KMU-Segments (Workiz / Housecall 45–65 €) – Funktionsumfang passt; Reife (noch kein CRM/Angebote, keine Zahlungsannahme, keine Buchhaltungs-Integrationen) *noch* nicht.
- **Deutlich unter** Enterprise-FSM (ServiceTitan / FieldEdge 125–398 €).

### Regeln, die wichtiger sind als die Zahl
- **Jahresabrechnung = 2 Monate gratis** (~17 % Rabatt).
- **Mindestbetrag ~99 €/Monat** – filtert 1–2-Personen-Konten heraus.
- **14 Tage kostenlos testen, ohne Kreditkarte.**
- **Niedrig starten, später erhöhen** – jede geschlossene Lücke (Zahlungsannahme, Kunden-/Angebotsmodul, Buchhaltungs-Integration, SOC2) rechtfertigt eine Preiserhöhung.

---

## Wichtige Hinweise / Caveats
1. **Abrechnung fehlt noch:** Ohne Stripe-/Sitz-Metering-Ebene ist keine Bezahlung möglich (Voraussetzung #1). Mit dem Admin/Mitglied-Modell ist das Metering einfacher (zwei Sitztypen statt drei).
2. **Preise sind Strategie, keine Finanzberatung** – der echte Wert hängt von Infrastrukturkosten/Nutzer, CAC und Churn ab.
