/**
 * Help center content — static, in-repo, bilingual (EN/DE). Each article's body
 * is Markdown (rendered by react-markdown). Describe ONLY real product behaviour
 * — this is customer-facing documentation, not marketing.
 *
 * To add an article: append to ARTICLES with a unique slug + a category key that
 * exists in CATEGORIES. Keywords power client-side search.
 */

export type Lang = 'en' | 'de';
export type Localized = Record<Lang, string>;

export interface HelpCategory {
  key: string;
  icon: 'rocket' | 'users' | 'clipboard' | 'map' | 'card' | 'lifebuoy';
  title: Localized;
  blurb: Localized;
}

export interface HelpArticle {
  slug: string;
  category: string;
  order: number;
  title: Localized;
  excerpt: Localized;
  keywords: string[];
  body: Localized;
}

export const CATEGORIES: HelpCategory[] = [
  {
    key: 'getting-started',
    icon: 'rocket',
    title: { en: 'Getting started', de: 'Erste Schritte' },
    blurb: { en: 'Set up your account and learn the basics.', de: 'Konto einrichten und die Grundlagen lernen.' },
  },
  {
    key: 'team-access',
    icon: 'users',
    title: { en: 'Team & access', de: 'Team & Zugriff' },
    blurb: { en: 'Invite people and control what they can see and do.', de: 'Personen einladen und Berechtigungen steuern.' },
  },
  {
    key: 'tasks',
    icon: 'clipboard',
    title: { en: 'Tasks', de: 'Aufgaben' },
    blurb: { en: 'Create, assign and track work from start to finish.', de: 'Arbeit erstellen, zuweisen und verfolgen.' },
  },
  {
    key: 'field-service',
    icon: 'map',
    title: { en: 'Field service', de: 'Außendienst' },
    blurb: { en: 'GPS tracking, service reports and attendance.', de: 'GPS-Tracking, Serviceberichte und Zeiterfassung.' },
  },
  {
    key: 'billing',
    icon: 'card',
    title: { en: 'Billing & plans', de: 'Abrechnung & Pläne' },
    blurb: { en: 'Trials, seats, plans and invoices.', de: 'Testphasen, Plätze, Pläne und Rechnungen.' },
  },
  {
    key: 'support',
    icon: 'lifebuoy',
    title: { en: 'Support', de: 'Support' },
    blurb: { en: 'How to reach us and what to expect.', de: 'Wie Sie uns erreichen und was Sie erwartet.' },
  },
];

export const ARTICLES: HelpArticle[] = [
  // ─────────────────────────── GETTING STARTED ───────────────────────────
  {
    slug: 'what-is-hbcfield',
    category: 'getting-started',
    order: 1,
    title: { en: 'What is HBCField?', de: 'Was ist HBCField?' },
    excerpt: {
      en: 'A field-service platform that connects the office and the field in real time.',
      de: 'Eine Außendienst-Plattform, die Büro und Feld in Echtzeit verbindet.',
    },
    keywords: ['overview', 'introduction', 'what', 'about', 'basics', 'einführung', 'überblick'],
    body: {
      en: `HBCField is a field-service management platform that connects your **office** and your **field team** in real time.

The core flow is simple:

1. **An admin or coordinator creates a task** in the web app — what needs doing, where, and when.
2. **A technician is assigned** to it.
3. **The technician executes it in the field** from the mobile app — accepting the job, driving to site (with GPS route tracking), doing the work, and completing it with a service report.
4. **Everyone sees updates live** — the office watches status and location change without refreshing.

### Two apps, one system
- **Web app** — for admins and office coordinators: create and assign work, see all tasks, track the team on a live map, manage members, billing, and reports.
- **Mobile app** — for field technicians: their assigned jobs, one-tap status changes, navigation, photos, signatures and clock-in.

### What you can manage
Tasks and subtasks, checklists, attachments, GPS routes, service reports with photos and customer signatures, geofenced clock-in/attendance, schedules and time-off, and — on higher plans — sprints, recurring jobs, overtime, invoicing and more.

Read [Setting up your organization](/help/set-up-your-organization) next.`,
      de: `HBCField ist eine Plattform für das Außendienst-Management, die Ihr **Büro** und Ihr **Außendienstteam** in Echtzeit verbindet.

Der grundlegende Ablauf ist einfach:

1. **Eine Admin- oder Koordinationsperson erstellt eine Aufgabe** in der Web-App — was, wo und wann zu tun ist.
2. **Ein Techniker wird zugewiesen.**
3. **Der Techniker führt sie im Feld aus** über die mobile App — Auftrag annehmen, zum Einsatzort fahren (mit GPS-Routenverfolgung), Arbeit erledigen und mit einem Servicebericht abschließen.
4. **Alle sehen Aktualisierungen live** — das Büro verfolgt Status und Standort ohne Neuladen.

### Zwei Apps, ein System
- **Web-App** — für Admins und Büro-Koordination: Arbeit erstellen und zuweisen, alle Aufgaben sehen, das Team auf einer Live-Karte verfolgen, Mitglieder, Abrechnung und Berichte verwalten.
- **Mobile App** — für Außendienst-Techniker: zugewiesene Aufträge, Statusänderungen mit einem Tipp, Navigation, Fotos, Unterschriften und Einstempeln.

### Was Sie verwalten können
Aufgaben und Teilaufgaben, Checklisten, Anhänge, GPS-Routen, Serviceberichte mit Fotos und Kundenunterschriften, geofencing-basiertes Einstempeln/Zeiterfassung, Dienstpläne und Abwesenheiten und — in höheren Plänen — Sprints, wiederkehrende Aufträge, Überstunden, Rechnungsstellung und mehr.

Lesen Sie als Nächstes [Organisation einrichten](/help/set-up-your-organization).`,
    },
  },
  {
    slug: 'set-up-your-organization',
    category: 'getting-started',
    order: 2,
    title: { en: 'Setting up your organization', de: 'Organisation einrichten' },
    excerpt: {
      en: 'Create your organization, your first space, and start a free trial.',
      de: 'Organisation und ersten Space erstellen und Testphase starten.',
    },
    keywords: ['signup', 'register', 'organization', 'space', 'onboarding', 'trial', 'registrieren', 'organisation'],
    body: {
      en: `When you register, you create the **first admin account** for a brand-new organization. Your organization is the top-level container for your team, your spaces, and all your work.

### 1. Register
Sign up with your name, email and a password. The account you create is an **admin** — the owner with full control.

### 2. Create your first space
A **space** is a site or location you operate from — a head office, a warehouse, a service area. You'll be guided to create your first one right after signup. You can add more spaces later, each with its own address, members and (for attendance) a geofence.

### 3. Your free trial starts automatically
New organizations start on a **14-day Professional trial — no card required**. You get the full Professional feature set while you evaluate. See [Plans & seats](/help/plans-and-seats) for what each plan includes.

### 4. Invite your team
Add the people who'll use HBCField — office staff on the web, technicians on mobile. See [Inviting your team](/help/invite-your-team).

> **Tip:** You don't have to finish everything at once. Create your organization, invite one technician, create one task, and try the full loop end-to-end first.`,
      de: `Bei der Registrierung erstellen Sie das **erste Admin-Konto** für eine ganz neue Organisation. Ihre Organisation ist der übergeordnete Container für Ihr Team, Ihre Spaces und Ihre gesamte Arbeit.

### 1. Registrieren
Melden Sie sich mit Name, E-Mail und Passwort an. Das erstellte Konto ist ein **Admin** — der Inhaber mit voller Kontrolle.

### 2. Ersten Space erstellen
Ein **Space** ist ein Standort, von dem aus Sie arbeiten — eine Zentrale, ein Lager, ein Servicegebiet. Direkt nach der Anmeldung werden Sie durch die Erstellung des ersten Space geführt. Weitere Spaces können Sie später hinzufügen, jeweils mit eigener Adresse, Mitgliedern und (für die Zeiterfassung) einem Geofence.

### 3. Ihre Testphase startet automatisch
Neue Organisationen starten mit einer **14-tägigen Professional-Testphase — ohne Kreditkarte**. Sie erhalten den vollen Professional-Funktionsumfang zum Ausprobieren. Siehe [Pläne & Plätze](/help/plans-and-seats).

### 4. Team einladen
Fügen Sie die Personen hinzu, die HBCField nutzen — Büropersonal im Web, Techniker mobil. Siehe [Team einladen](/help/invite-your-team).

> **Tipp:** Sie müssen nicht alles auf einmal erledigen. Erstellen Sie Ihre Organisation, laden Sie einen Techniker ein, erstellen Sie eine Aufgabe und testen Sie zuerst den vollen Ablauf.`,
    },
  },
  // ─────────────────────────── TEAM & ACCESS ───────────────────────────
  {
    slug: 'invite-your-team',
    category: 'team-access',
    order: 1,
    title: { en: 'Inviting your team', de: 'Team einladen' },
    excerpt: {
      en: 'Two ways to bring people in: invitation codes and your organization join code.',
      de: 'Zwei Wege, Personen hinzuzufügen: Einladungscodes und Org-Beitrittscode.',
    },
    keywords: ['invite', 'invitation', 'join code', 'members', 'team', 'add user', 'einladen', 'beitritt', 'mitglieder'],
    body: {
      en: `There are two ways to add people to your organization.

### 1. Invitation codes (recommended)
From **Invitations** in the web app, create a code for a specific person. You can pre-set their role, work mode, specialty and schedule before they even join — so they land fully configured. Send them the code; they enter it when registering on mobile (or accept via the link).

Invitation codes are single-use, expire, and can be revoked at any time before they're accepted.

### 2. Your organization join code
Every organization has a **join code** (see **Settings → Organization**). Share it with people who should request to join. Depending on your **join policy**, requests are either auto-approved or land in **Join Requests** for an admin to approve and assign a role.

### Managing members
Under **Members** you can see everyone, change roles and permissions, and remove people. Under a technician's profile you can set their weekly **schedule** and approve **time-off**.

> **Web vs mobile:** office staff sign in on the web; field technicians use the mobile app. A person's **access profile** decides which platform(s) and features they get — see [Roles & access](/help/roles-and-access).`,
      de: `Es gibt zwei Wege, Personen zu Ihrer Organisation hinzuzufügen.

### 1. Einladungscodes (empfohlen)
Erstellen Sie unter **Einladungen** in der Web-App einen Code für eine bestimmte Person. Sie können Rolle, Arbeitsmodus, Spezialgebiet und Dienstplan schon vor dem Beitritt festlegen — so ist die Person sofort vollständig konfiguriert. Senden Sie den Code; die Person gibt ihn bei der Registrierung mobil ein (oder nimmt über den Link an).

Einladungscodes sind einmalig nutzbar, laufen ab und können vor der Annahme jederzeit widerrufen werden.

### 2. Ihr Org-Beitrittscode
Jede Organisation hat einen **Beitrittscode** (siehe **Einstellungen → Organisation**). Teilen Sie ihn mit Personen, die beitreten möchten. Je nach **Beitrittsrichtlinie** werden Anfragen automatisch genehmigt oder landen unter **Beitrittsanfragen** zur Genehmigung und Rollenzuweisung durch einen Admin.

### Mitglieder verwalten
Unter **Mitglieder** sehen Sie alle, ändern Rollen und Berechtigungen und entfernen Personen. Im Technikerprofil legen Sie den wöchentlichen **Dienstplan** fest und genehmigen **Abwesenheiten**.

> **Web vs. mobil:** Büropersonal meldet sich im Web an; Außendienst-Techniker nutzen die mobile App. Das **Zugriffsprofil** einer Person bestimmt Plattform(en) und Funktionen — siehe [Rollen & Zugriff](/help/roles-and-access).`,
    },
  },
  {
    slug: 'roles-and-access',
    category: 'team-access',
    order: 2,
    title: { en: 'Roles & access profiles', de: 'Rollen & Zugriffsprofile' },
    excerpt: {
      en: 'How admins and members differ, and how access profiles fine-tune what each person can do.',
      de: 'Unterschied zwischen Admins und Mitgliedern und wie Zugriffsprofile alles feinjustieren.',
    },
    keywords: ['roles', 'permissions', 'admin', 'access', 'profile', 'platform', 'rollen', 'berechtigungen', 'zugriff'],
    body: {
      en: `Access in HBCField has two layers: a **role** and a per-person **access profile**.

### Roles
- **Admin** — full control of the organization: create work, manage members, billing and settings.
- **Member** — everyone else. What a member can actually see and do is shaped by their access profile.

### Access profiles
Rather than rigid job titles, each person gets an **access profile** that controls:
- **Platform** — web, mobile, or both.
- **Feature access** — which tabs/modules they see (e.g. tasks, tracking, attendance).
- **Space scope** — *all spaces* or *only their assigned spaces* (new members default to their own spaces, a least-privilege default you can widen).
- **Contact access** — who they can message/call inside the app.

This lets a field technician see only their tasks and clock, while an office coordinator sees all tasks and the live map — without inventing a new role for every combination.

### Changing access
Open **Members**, pick a person, and edit their role and access profile. Admins can't demote or remove the last admin, and can't change their own role — guardrails that keep an organization from locking itself out.`,
      de: `Der Zugriff in HBCField hat zwei Ebenen: eine **Rolle** und ein personenbezogenes **Zugriffsprofil**.

### Rollen
- **Admin** — volle Kontrolle über die Organisation: Arbeit erstellen, Mitglieder, Abrechnung und Einstellungen verwalten.
- **Mitglied** — alle anderen. Was ein Mitglied sieht und tun kann, bestimmt sein Zugriffsprofil.

### Zugriffsprofile
Statt starrer Positionen erhält jede Person ein **Zugriffsprofil**, das Folgendes steuert:
- **Plattform** — Web, mobil oder beides.
- **Funktionszugriff** — welche Tabs/Module sichtbar sind (z. B. Aufgaben, Tracking, Zeiterfassung).
- **Space-Umfang** — *alle Spaces* oder *nur zugewiesene Spaces* (neue Mitglieder sehen standardmäßig nur ihre eigenen — ein Least-Privilege-Standard, den Sie erweitern können).
- **Kontaktzugriff** — wen die Person in der App kontaktieren darf.

So sieht ein Außendienst-Techniker nur seine Aufgaben und die Stempeluhr, während die Büro-Koordination alle Aufgaben und die Live-Karte sieht — ohne für jede Kombination eine neue Rolle zu erfinden.

### Zugriff ändern
Öffnen Sie **Mitglieder**, wählen Sie eine Person und bearbeiten Sie Rolle und Zugriffsprofil. Admins können den letzten Admin nicht herabstufen oder entfernen und die eigene Rolle nicht ändern — Schutzmechanismen gegen eine Aussperrung.`,
    },
  },
  // ─────────────────────────── TASKS ───────────────────────────
  {
    slug: 'create-and-assign-tasks',
    category: 'tasks',
    order: 1,
    title: { en: 'Creating and assigning work', de: 'Arbeit erstellen und zuweisen' },
    excerpt: {
      en: 'Create a task, add the details, and assign a technician.',
      de: 'Aufgabe erstellen, Details hinzufügen und Techniker zuweisen.',
    },
    keywords: ['task', 'create', 'assign', 'new task', 'dispatch', 'aufgabe', 'erstellen', 'zuweisen'],
    body: {
      en: `Tasks are the unit of work in HBCField. Admins and members with task-creation access can create them from the web app.

### Create a task
Click **New task** and fill in:
- **Title & description** — what needs doing.
- **Location** — the address; this powers navigation and route tracking.
- **Priority** — Low, Medium, High or Urgent.
- **Due date** — when it's needed.

Depending on your plan you can also add a **task type / workflow**, **custom fields**, **subtasks**, a **checklist**, **attachments**, and **dependencies** on other tasks.

### Assign a technician
Open the task and choose **Assign**. Pick a technician — availability, schedule and current workload help you choose. The assigned technician is notified instantly (push notification) and the job appears in their mobile app.

### After assigning
You'll see status and location update live on the task and on the **Live map**. You can reassign, edit, comment, or cancel from the task's menu.

> **Tip:** For jobs that repeat on a schedule, use **Recurring** (Professional and up) so the system creates them automatically instead of re-entering them.`,
      de: `Aufgaben sind die Arbeitseinheit in HBCField. Admins und Mitglieder mit Erstellungsrecht erstellen sie in der Web-App.

### Aufgabe erstellen
Klicken Sie auf **Neue Aufgabe** und füllen Sie aus:
- **Titel & Beschreibung** — was zu tun ist.
- **Standort** — die Adresse; steuert Navigation und Routenverfolgung.
- **Priorität** — Niedrig, Mittel, Hoch oder Dringend.
- **Fälligkeitsdatum** — wann es benötigt wird.

Je nach Plan können Sie außerdem einen **Aufgabentyp / Workflow**, **benutzerdefinierte Felder**, **Teilaufgaben**, eine **Checkliste**, **Anhänge** und **Abhängigkeiten** hinzufügen.

### Techniker zuweisen
Öffnen Sie die Aufgabe und wählen Sie **Zuweisen**. Wählen Sie einen Techniker — Verfügbarkeit, Dienstplan und aktuelle Auslastung helfen bei der Wahl. Der zugewiesene Techniker wird sofort benachrichtigt (Push) und der Auftrag erscheint in seiner mobilen App.

### Nach dem Zuweisen
Status und Standort werden live auf der Aufgabe und der **Live-Karte** aktualisiert. Über das Aufgabenmenü können Sie neu zuweisen, bearbeiten, kommentieren oder stornieren.

> **Tipp:** Für wiederkehrende Aufträge nutzen Sie **Wiederkehrend** (ab Professional), damit das System sie automatisch erstellt.`,
    },
  },
  {
    slug: 'task-status-flow',
    category: 'tasks',
    order: 2,
    title: { en: 'Task statuses & the field flow', de: 'Aufgabenstatus & der Feldablauf' },
    excerpt: {
      en: 'How a job moves from new to closed, and what each status means.',
      de: 'Wie ein Auftrag von neu bis geschlossen läuft und was jeder Status bedeutet.',
    },
    keywords: ['status', 'workflow', 'en route', 'in progress', 'complete', 'blocked', 'flow', 'ablauf', 'status'],
    body: {
      en: `Every task moves through a clear set of statuses. The technician drives most of these from the mobile app with one tap, and the office sees each change live.

### The typical journey
1. **New** → **Assigned** — created, then given to a technician.
2. **Accepted** — the technician acknowledges the job.
3. **En route** — they start driving. **GPS route tracking begins here** — the app records the exact path to site.
4. **Arrived** — they reach the location (route distance and time are captured).
5. **In progress** — work is underway.
6. **Completed** — the job is done, usually with a [service report](/help/service-reports).
7. **Closed** — the office signs it off.

### Other statuses
- **Blocked** — the technician hits an obstacle and records a reason; it returns to *In progress* once resolved.
- **Canceled** — the job is called off.

### Why it matters
Because status is live, dispatchers always know who's driving, who's on site, and what's finished — without calling anyone. The **"where are you?"** phone call disappears.`,
      de: `Jede Aufgabe durchläuft klare Status. Der Techniker steuert die meisten mit einem Tipp in der mobilen App, und das Büro sieht jede Änderung live.

### Der typische Ablauf
1. **Neu** → **Zugewiesen** — erstellt und einem Techniker gegeben.
2. **Angenommen** — der Techniker bestätigt den Auftrag.
3. **Unterwegs** — die Fahrt beginnt. **Hier startet die GPS-Routenverfolgung** — die App zeichnet den exakten Weg zum Einsatzort auf.
4. **Angekommen** — der Standort ist erreicht (Streckenlänge und -zeit werden erfasst).
5. **In Bearbeitung** — die Arbeit läuft.
6. **Abgeschlossen** — erledigt, meist mit einem [Servicebericht](/help/service-reports).
7. **Geschlossen** — das Büro schließt ab.

### Weitere Status
- **Blockiert** — der Techniker stößt auf ein Hindernis und erfasst einen Grund; nach Lösung geht es zurück zu *In Bearbeitung*.
- **Storniert** — der Auftrag wird abgesagt.

### Warum das wichtig ist
Da der Status live ist, weiß die Disposition immer, wer fährt, wer vor Ort ist und was fertig ist — ohne anzurufen. Der **„Wo bist du?"**-Anruf entfällt.`,
    },
  },
  // ─────────────────────────── FIELD SERVICE ───────────────────────────
  {
    slug: 'gps-route-tracking',
    category: 'field-service',
    order: 1,
    title: { en: 'GPS route tracking', de: 'GPS-Routenverfolgung' },
    excerpt: {
      en: 'See the exact route a technician drove — not just a straight line.',
      de: 'Sehen Sie die exakte gefahrene Route — keine gerade Linie.',
    },
    keywords: ['gps', 'route', 'tracking', 'map', 'location', 'live map', 'route', 'karte', 'standort'],
    body: {
      en: `When a technician sets a task to **En route**, the mobile app begins recording their **exact path** to the job — and keeps recording even while the phone is locked or another app (like a map) is in the foreground.

### On the web
- The **Live map** shows every technician's current position, updating in real time.
- Open a completed task to replay the **full route** — the app snaps the GPS points to roads so you see the real path driven, along with **distance, time and number of points**.

### How it works (and battery)
Tracking is battery-aware: it samples by distance while moving, batches updates to reduce radio wake-ups, and runs as a background task. It stops automatically when the technician marks **Arrived**.

### Requirements
- Route capture runs on the **mobile app** (a real build, not a browser).
- The technician must grant **"Always allow"** location permission so tracking continues in the background.

> If you only ever see a straight line from start to end, the technician likely denied background location — ask them to enable **Always allow** for HBCField in their phone settings.`,
      de: `Wenn ein Techniker eine Aufgabe auf **Unterwegs** setzt, beginnt die mobile App, den **exakten Weg** zum Auftrag aufzuzeichnen — auch bei gesperrtem Telefon oder wenn eine andere App (z. B. eine Karte) im Vordergrund ist.

### Im Web
- Die **Live-Karte** zeigt die aktuelle Position jedes Technikers in Echtzeit.
- Öffnen Sie eine abgeschlossene Aufgabe, um die **vollständige Route** abzuspielen — die App legt die GPS-Punkte auf Straßen, sodass Sie den echten Weg samt **Distanz, Zeit und Punktzahl** sehen.

### Funktionsweise (und Akku)
Das Tracking ist akkuschonend: Es tastet distanzbasiert während der Fahrt ab, bündelt Aktualisierungen und läuft als Hintergrundaufgabe. Es stoppt automatisch bei **Angekommen**.

### Voraussetzungen
- Die Routenerfassung läuft in der **mobilen App** (ein echter Build, kein Browser).
- Der Techniker muss die Standortberechtigung **„Immer erlauben"** gewähren, damit das Tracking im Hintergrund weiterläuft.

> Sehen Sie nur eine gerade Linie von Start bis Ende, hat der Techniker vermutlich den Hintergrundstandort verweigert — bitten Sie ihn, **„Immer erlauben"** für HBCField in den Telefoneinstellungen zu aktivieren.`,
    },
  },
  {
    slug: 'service-reports',
    category: 'field-service',
    order: 2,
    title: { en: 'Completing jobs with service reports', de: 'Aufträge mit Serviceberichten abschließen' },
    excerpt: {
      en: 'Turn a finished job into a professional report with photos, parts and a signature.',
      de: 'Aus einem erledigten Auftrag einen Bericht mit Fotos, Teilen und Unterschrift machen.',
    },
    keywords: ['report', 'service report', 'signature', 'photos', 'parts', 'complete', 'bericht', 'unterschrift', 'fotos'],
    body: {
      en: `A **service report** is the professional record of a completed job — proof of work you can share with a customer or use for billing.

### What a report captures
- A **summary** and **work performed** description.
- **Before / after photos** — uploaded from the field.
- **Parts used** — name, part number, quantity, unit cost.
- **Work duration.**
- **Signatures** — the technician's, and the customer's on-site signature with their name.

### Completing a job (mobile)
When the technician marks a task **Completed**, they're taken through the completion flow to fill in the summary, add photos, list parts and capture signatures. Once submitted, the report is attached to the task.

### On the web
Open any completed task to view its full report. If the job is tied to an asset, the report also becomes part of that asset's **maintenance history**, so you can see everything ever done to a piece of equipment.

### Edits
A report can be corrected by the technician for a short window (within 24 hours) after completion.`,
      de: `Ein **Servicebericht** ist der professionelle Nachweis eines abgeschlossenen Auftrags — ein Arbeitsnachweis zum Teilen mit Kunden oder zur Abrechnung.

### Was ein Bericht erfasst
- Eine **Zusammenfassung** und die Beschreibung der **ausgeführten Arbeit**.
- **Vorher-/Nachher-Fotos** — aus dem Feld hochgeladen.
- **Verwendete Teile** — Name, Teilenummer, Menge, Stückkosten.
- **Arbeitsdauer.**
- **Unterschriften** — die des Technikers und die Vor-Ort-Unterschrift des Kunden mit Namen.

### Auftrag abschließen (mobil)
Setzt der Techniker eine Aufgabe auf **Abgeschlossen**, wird er durch den Abschlussablauf geführt: Zusammenfassung ausfüllen, Fotos hinzufügen, Teile auflisten und Unterschriften erfassen. Nach dem Absenden wird der Bericht an die Aufgabe angehängt.

### Im Web
Öffnen Sie eine abgeschlossene Aufgabe, um den vollständigen Bericht zu sehen. Ist der Auftrag mit einem Asset verknüpft, wird der Bericht Teil der **Wartungshistorie** dieses Assets.

### Korrekturen
Ein Bericht kann vom Techniker kurz nach Abschluss (innerhalb von 24 Stunden) korrigiert werden.`,
    },
  },
  {
    slug: 'clock-in-attendance',
    category: 'field-service',
    order: 3,
    title: { en: 'Clock-in & attendance', de: 'Einstempeln & Zeiterfassung' },
    excerpt: {
      en: 'Geofenced clock-in so on-site hours are accurate and location-verified.',
      de: 'Geofencing-Einstempeln für genaue, standortgeprüfte Vor-Ort-Zeiten.',
    },
    keywords: ['clock in', 'attendance', 'geofence', 'hours', 'time tracking', 'einstempeln', 'zeiterfassung', 'geofence'],
    body: {
      en: `HBCField includes geofenced **attendance** for staff who work at fixed sites.

### Geofencing
Each **space** can have a geofence — a location and a radius. A member can only **clock in** when they're physically inside that radius. The check uses the device's GPS position (and its accuracy) against the space's coordinates, so it can't be faked by being nearby.

### Clocking in
- **Mobile** — technicians clock in/out from the Clock tab.
- **Web** — office staff can clock in from their attendance page using the browser's location (which is immune to VPN/IP tricks).

Signing in does **not** automatically clock you in — clock-in is always a deliberate action.

### Work modes
Whether someone uses attendance depends on their **work mode**:
- **On-site** — fixed location; uses the Clock.
- **On-road** — mobile field work; uses Tasks, not the Clock.
- **Hybrid** — both.

### For admins
See each person's clock-in history, hours, and location on their profile. Attendance is part of the plan from **Starter** upward.`,
      de: `HBCField enthält geofencing-basierte **Zeiterfassung** für Personen, die an festen Standorten arbeiten.

### Geofencing
Jeder **Space** kann einen Geofence haben — Standort und Radius. Ein Mitglied kann sich nur **einstempeln**, wenn es sich physisch innerhalb dieses Radius befindet. Die Prüfung nutzt die GPS-Position des Geräts (samt Genauigkeit) gegenüber den Koordinaten des Space und lässt sich nicht durch bloße Nähe austricksen.

### Einstempeln
- **Mobil** — Techniker stempeln über den Uhr-Tab ein/aus.
- **Web** — Büropersonal stempelt auf der Anwesenheitsseite über den Browserstandort ein (immun gegen VPN-/IP-Tricks).

Die Anmeldung stempelt Sie **nicht** automatisch ein — Einstempeln ist immer eine bewusste Aktion.

### Arbeitsmodi
Ob jemand die Zeiterfassung nutzt, hängt vom **Arbeitsmodus** ab:
- **Vor Ort** — fester Standort; nutzt die Uhr.
- **Unterwegs** — mobile Feldarbeit; nutzt Aufgaben, nicht die Uhr.
- **Hybrid** — beides.

### Für Admins
Sehen Sie Stempelhistorie, Stunden und Standort pro Person im Profil. Die Zeiterfassung ist ab **Starter** enthalten.`,
    },
  },
  // ─────────────────────────── BILLING ───────────────────────────
  {
    slug: 'plans-and-seats',
    category: 'billing',
    order: 1,
    title: { en: 'Plans, seats & pricing', de: 'Pläne, Plätze & Preise' },
    excerpt: {
      en: 'How our per-seat pricing works — office seats and field seats.',
      de: 'Wie unsere Preise pro Platz funktionieren — Büro- und Feldplätze.',
    },
    keywords: ['pricing', 'plans', 'seats', 'office', 'field', 'cost', 'subscription', 'preise', 'pläne', 'plätze'],
    body: {
      en: `HBCField is priced **per seat**, and a seat's type is decided by how a person works — not by a manual setting.

### Two seat types
- **Office seat** — anyone with **web access** (including you, the admin owner). Priced by plan tier: **Starter €19 / Professional €49 / Business €99** per office seat per month.
- **Field seat** — a **mobile-only** technician. A flat **€15** per field seat per month, on every tier.

Annual billing gives you **two months free** (monthly × 10 per year).

### Seats follow access, automatically
Because a seat's type comes from a person's access profile, flipping someone between web and mobile re-classifies their seat automatically — you never manage seat counts by hand. Adding or removing people adjusts your next invoice with proration.

### What the tiers unlock
Each tier is cumulative — every plan includes everything below it. In short:
- **Starter** — tasks, subtasks, checklists, attachments, GPS tracking, attendance, service reports.
- **Professional** — adds custom fields, dependencies, recurring tasks, overtime and invoicing.
- **Business** — adds sprints, epics, phases, story points, custom workflows and audit log.
- **Enterprise** — everything, on a custom contract.

See the full feature comparison on our pricing page.`,
      de: `HBCField wird **pro Platz** abgerechnet, und der Platztyp ergibt sich daraus, wie eine Person arbeitet — nicht aus einer manuellen Einstellung.

### Zwei Platztypen
- **Büroplatz** — jede Person mit **Web-Zugriff** (auch Sie als Admin-Inhaber). Preis nach Plan-Stufe: **Starter 19 € / Professional 49 € / Business 99 €** pro Büroplatz und Monat.
- **Feldplatz** — ein **rein mobiler** Techniker. Pauschal **15 €** pro Feldplatz und Monat, in jeder Stufe.

Jährliche Abrechnung bringt **zwei Monate gratis** (monatlich × 10 pro Jahr).

### Plätze folgen dem Zugriff — automatisch
Da sich der Platztyp aus dem Zugriffsprofil ergibt, ändert ein Wechsel zwischen Web und mobil den Platztyp automatisch — Sie verwalten keine Platzzahlen von Hand. Hinzufügen oder Entfernen von Personen passt Ihre nächste Rechnung anteilig an.

### Was die Stufen freischalten
Jede Stufe ist kumulativ — jeder Plan enthält alles darunter. Kurz:
- **Starter** — Aufgaben, Teilaufgaben, Checklisten, Anhänge, GPS-Tracking, Zeiterfassung, Serviceberichte.
- **Professional** — plus benutzerdefinierte Felder, Abhängigkeiten, wiederkehrende Aufgaben, Überstunden und Rechnungsstellung.
- **Business** — plus Sprints, Epics, Phasen, Story Points, individuelle Workflows und Audit-Protokoll.
- **Enterprise** — alles, mit individuellem Vertrag.

Den vollständigen Funktionsvergleich finden Sie auf unserer Preisseite.`,
    },
  },
  {
    slug: 'manage-subscription',
    category: 'billing',
    order: 2,
    title: { en: 'Your trial & managing billing', de: 'Testphase & Abrechnung verwalten' },
    excerpt: {
      en: 'Start free, then subscribe and manage everything from the customer portal.',
      de: 'Kostenlos starten, dann abonnieren und alles im Kundenportal verwalten.',
    },
    keywords: ['trial', 'subscribe', 'portal', 'cancel', 'invoice', 'payment', 'card', 'testphase', 'kündigen', 'rechnung'],
    body: {
      en: `### Your free trial
Every new organization starts on a **14-day Professional trial with no card required**. You have the full Professional feature set to evaluate. When the trial ends, add a payment method to keep premium features — otherwise the account is limited until you subscribe.

### Subscribing
From **Billing**, choose a plan and billing interval (monthly or annual) and check out securely. You can enter a **VAT ID (UID)** at checkout — for cross-border EU business customers this applies the reverse-charge, so VAT is handled correctly.

### Managing your subscription
The **customer portal** (opened from Billing) lets you:
- Update your card and billing details.
- Download invoices and receipts.
- Change plan or interval.
- Cancel (your plan stays active until the end of the current period).

### Changing seats mid-cycle
Adding or removing people adjusts your bill automatically with proration. On monthly plans the difference is applied to your next invoice; annual seat increases are charged immediately for the remainder of the year.

> Payments are processed securely by Stripe. HBCField never sees or stores your card number.`,
      de: `### Ihre Testphase
Jede neue Organisation startet mit einer **14-tägigen Professional-Testphase ohne Kreditkarte**. Sie haben den vollen Professional-Funktionsumfang zum Testen. Nach Ablauf fügen Sie eine Zahlungsmethode hinzu, um Premium-Funktionen zu behalten — andernfalls ist das Konto bis zum Abonnement eingeschränkt.

### Abonnieren
Wählen Sie unter **Abrechnung** einen Plan und ein Abrechnungsintervall (monatlich oder jährlich) und schließen Sie sicher ab. Sie können an der Kasse eine **USt-IdNr. (UID)** angeben — für grenzüberschreitende EU-Geschäftskunden greift das Reverse-Charge-Verfahren, sodass die Umsatzsteuer korrekt behandelt wird.

### Abonnement verwalten
Im **Kundenportal** (über Abrechnung) können Sie:
- Karte und Rechnungsdaten aktualisieren.
- Rechnungen und Belege herunterladen.
- Plan oder Intervall ändern.
- Kündigen (Ihr Plan bleibt bis zum Ende der laufenden Periode aktiv).

### Plätze mitten im Zyklus ändern
Hinzufügen oder Entfernen von Personen passt Ihre Rechnung automatisch anteilig an. Bei Monatsplänen fließt die Differenz in die nächste Rechnung; jährliche Platzerhöhungen werden sofort für den Rest des Jahres berechnet.

> Zahlungen werden sicher von Stripe verarbeitet. HBCField sieht oder speichert Ihre Kartennummer nie.`,
    },
  },
  // ─────────────────────────── SUPPORT ───────────────────────────
  {
    slug: 'contact-support',
    category: 'support',
    order: 1,
    title: { en: 'Getting help & response times', de: 'Hilfe erhalten & Reaktionszeiten' },
    excerpt: {
      en: 'How to reach our team and how fast you can expect a reply.',
      de: 'Wie Sie unser Team erreichen und wie schnell Sie eine Antwort erwarten können.',
    },
    keywords: ['support', 'contact', 'help', 'ticket', 'live chat', 'response', 'sla', 'kontakt', 'hilfe', 'antwort'],
    body: {
      en: `The fastest way to get help is right inside the app.

### The support button
Open the **support button** (bottom-right on the web, or **Contact support** in the mobile app's Profile). From there you can:
- **Open a ticket** — describe your issue and we'll reply by ticket + email. You'll see the conversation and our replies in the same place.
- **Use live chat** — on Business and Enterprise plans, when an agent is online you can chat in real time; the button shows whether an agent is currently available.

### Response times
Your plan sets our **target first-response time**:
- **Starter** — within 48 business hours
- **Professional** — within 24 business hours
- **Business** — within 8 business hours
- **Enterprise** — within 2 business hours, plus a dedicated contact

Higher plans also get **priority routing**, so your tickets are answered ahead of lower tiers when we're busy.

### Before you write
Many questions are answered right here in the help center — try searching at the top of this page first. If you still need us, the support button is one click away.`,
      de: `Am schnellsten erhalten Sie Hilfe direkt in der App.

### Der Support-Button
Öffnen Sie den **Support-Button** (unten rechts im Web oder **Support kontaktieren** im Profil der mobilen App). Dort können Sie:
- **Ein Ticket eröffnen** — beschreiben Sie Ihr Anliegen; wir antworten per Ticket + E-Mail. Sie sehen die Konversation und unsere Antworten an einem Ort.
- **Live-Chat nutzen** — in den Plänen Business und Enterprise können Sie in Echtzeit chatten, wenn ein Mitarbeiter online ist; der Button zeigt die Verfügbarkeit an.

### Reaktionszeiten
Ihr Plan bestimmt unsere **angestrebte Erstreaktionszeit**:
- **Starter** — innerhalb von 48 Geschäftsstunden
- **Professional** — innerhalb von 24 Geschäftsstunden
- **Business** — innerhalb von 8 Geschäftsstunden
- **Enterprise** — innerhalb von 2 Geschäftsstunden, plus fester Ansprechpartner

Höhere Pläne erhalten zudem **priorisierte Weiterleitung**, sodass Ihre Tickets bei hohem Aufkommen vor niedrigeren Stufen beantwortet werden.

### Bevor Sie schreiben
Viele Fragen beantwortet dieses Hilfe-Center — nutzen Sie zuerst die Suche oben. Wenn Sie uns dennoch brauchen, ist der Support-Button nur einen Klick entfernt.`,
    },
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
export function pick(v: Localized, lang: string): string {
  return v[(lang?.startsWith('de') ? 'de' : 'en') as Lang];
}

export function articlesByCategory(catKey: string): HelpArticle[] {
  return ARTICLES.filter((a) => a.category === catKey).sort((a, b) => a.order - b.order);
}

export function getArticle(slug: string): HelpArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function searchArticles(query: string, lang: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ARTICLES.filter((a) => {
    const hay = [pick(a.title, lang), pick(a.excerpt, lang), pick(a.body, lang), a.keywords.join(' ')]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
