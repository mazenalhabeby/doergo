import type { SupportedLocale } from '../notifications/locale';

/**
 * Every word the product writes into an email, in every language it speaks.
 *
 * WHY IN SHARED, when the push catalogue lives in notification-service: mail
 * leaves from THREE services — auth-service (password reset, client signing
 * links), notification-service (invitations, alerts) and task-service
 * (scheduled reports, rendered there). One catalogue read by all three is the
 * only way "the invitation says Sie and the reset says du" cannot happen.
 *
 * The rules, the same as the push catalogue's:
 *  · English is the SHAPE; the other four are `Record<EmailKey, string>`, so a
 *    key missing from one language does not compile. The parity spec adds that
 *    every language uses exactly the same placeholders.
 *  · Plain text only. The templates escape every sentence AND every value, so
 *    an organization called `<b>Acme</b>` arrives as those characters. Bold is
 *    applied to a VALUE by the template (`bold()`), never written in here.
 *  · Plurals are `<key>.one` / `<key>.other`, chosen by Intl.PluralRules.
 *  · Names people typed (an organization, a task, a document title) are
 *    parameters and are never translated.
 *  · Never "paid" or "unpaid", in any language.
 *  · German is formal ("Sie"), French "vous"; Spanish and Italian follow the
 *    apps, which address the reader informally.
 *  · The onboarding option named in the invitation steps is quoted exactly as
 *    the mobile app labels it in that language — a step pointing at a button
 *    the screen does not have is a dead end.
 */
const en = {
  // ── Layout ──────────────────────────────────────────────────────────────
  'layout.tagline': 'Field Service Management',
  'layout.automatedMessage': 'This is an automated message from HBCField.',
  'layout.automatedAlert': 'This is an automated alert from HBCField.',
  'layout.greeting': 'Hello {{name}},',
  'layout.linkFallback': 'If the button doesn’t work, copy and paste this link into your browser:',
  'layout.notAvailable': 'N/A',

  'label.title': 'Title',
  'label.description': 'Description',
  'label.priority': 'Priority',
  'label.location': 'Location',
  'label.clockIn': 'Clock in',
  'label.clockOut': 'Clock out',
  'label.totalHours': 'Total hours',
  'label.member': 'Member',
  'label.distance': 'Distance from location',
  'label.allowedRadius': 'Allowed radius',

  'unit.hours.one': '{{count}} hour',
  'unit.hours.other': '{{count}} hours',
  'unit.meters': '{{meters}} m',

  'priority.LOW': 'Low',
  'priority.MEDIUM': 'Medium',
  'priority.HIGH': 'High',
  'priority.URGENT': 'Urgent',

  'role.ADMIN': 'Admin',
  'role.MANAGER': 'Manager',
  'role.EMPLOYEE': 'Employee',
  'role.CUSTOMER': 'Client',

  // ── Password reset ──────────────────────────────────────────────────────
  'passwordReset.subject': 'HBCField – Reset your password',
  'passwordReset.heading': 'Password reset request',
  'passwordReset.intro': 'We received a request to reset your password. Click the button below to set a new password:',
  'passwordReset.button': 'Reset password',
  'passwordReset.expires.one': 'This link will expire in {{count}} hour.',
  'passwordReset.expires.other': 'This link will expire in {{count}} hours.',
  'passwordReset.ignore': 'If you didn’t request this, you can safely ignore this email.',

  // ── Invitation ──────────────────────────────────────────────────────────
  'invitation.subject': 'You’re invited to join {{org}} on HBCField',
  'invitation.heading': 'You’ve been invited!',
  'invitation.intro': 'You’ve been invited to join {{org}} as {{role}}.',
  'invitation.codeLabel': 'Your invitation code',
  'invitation.stepsIntro': 'To get started:',
  'invitation.step1': 'Download the HBCField app',
  'invitation.step2': 'Create your account',
  'invitation.step3': 'Choose “Use Invitation” during setup',
  'invitation.step4': 'Enter the code above',
  'invitation.expires': 'This invitation expires on {{date}}.',
  'invitation.footer': 'This is an automated email from HBCField. If you didn’t expect this invitation, you can safely ignore it.',
  // With no organization name to show. Whole sentences, not a fallback name
  // dropped into the one above: "unirti a la tua organizzazione" is wrong.
  'invitation.subjectNoOrg': 'You’re invited to join HBCField',
  'invitation.introNoOrg': 'You’ve been invited to join your organization as {{role}}.',

  // ── Geofence alert (to the member's watchers) ───────────────────────────
  'geofence.subject.clock_in': 'Geofence alert: {{name}} – clock in',
  'geofence.subject.clock_out': 'Geofence alert: {{name}} – clock out',
  'geofence.heading': 'Geofence alert',
  'geofence.intro.clock_in': 'A member has clocked in outside the allowed geofence area.',
  'geofence.intro.clock_out': 'A member has clocked out outside the allowed geofence area.',
  'geofence.details': 'Details',

  // ── Tasks ───────────────────────────────────────────────────────────────
  'taskAssigned.subject': 'Task assigned: {{task}}',
  'taskAssigned.heading': 'You have been assigned a new task',
  'taskCompleted.subject': 'Task completed: {{task}}',
  'taskCompleted.heading': 'Task completed',
  'taskCompleted.body': 'The task has been marked as completed.',

  // ── Automatic clock-out ─────────────────────────────────────────────────
  'autoClockOut.subject': 'Automatic clock-out: {{location}}',
  'autoClockOut.heading': 'Automatic clock-out notice',
  'autoClockOut.reason.exceeded_duration':
    'You were automatically clocked out because your shift exceeded the maximum allowed duration (16 hours).',
  'autoClockOut.reason.end_of_day': 'You were automatically clocked out at the end of the day.',
  'autoClockOut.details': 'Shift details',
  'autoClockOut.contact': 'If you believe this was an error, please contact your supervisor.',

  // ── Scheduled report ────────────────────────────────────────────────────
  'report.subject': 'Report: {{name}}',
  'report.generated': 'Generated {{date}}',
  'report.empty': 'No data for this period.',
  'report.footer': 'HBCField — scheduled report',

  // ── Client signing link ─────────────────────────────────────────────────
  'sign.subject.one': 'A document needs your signature — {{org}}',
  'sign.subject.other': '{{count}} documents need your signature — {{org}}',
  'sign.heading.one': 'A document needs your signature',
  'sign.heading.other': '{{count}} documents need your signature',
  'sign.intro.one':
    '{{org}} has asked you to countersign the work below. It has already been signed by the worker and approved by the person responsible for them.',
  'sign.intro.other':
    '{{org}} has asked you to countersign the work below. Each one has already been signed by the worker and approved by the person responsible for them.',
  'sign.waiting': 'Waiting for you',
  'sign.button': 'Review and sign',
  'sign.validity.one':
    'This link is valid until {{date}} and stays your way back to these documents — if it expires, you can ask for a new one from the same page.',
  'sign.validity.other':
    'You can sign them all at once. This link is valid until {{date}} and stays your way back to these documents — if it expires, you can ask for a new one from the same page.',
  'sign.footer': 'You are receiving this because {{org}} listed you as the client for this work.',
  'signReissue.subject': 'Your documents with {{org}}',
  'signReissue.heading': 'Here is your link',
  'signReissue.intro':
    'It opens your documents with {{org}} — both the ones waiting for your signature and the ones you have already signed.',
  'signReissue.button': 'Open my documents',
  'signReissue.validity': 'Valid until {{date}}. Any earlier link you were sent no longer works.',
};

export type EmailKey = keyof typeof en;

/** `sign.subject` for the pair `sign.subject.one` / `.other`. */
export type EmailPluralKey = EmailKey extends infer K ? (K extends `${infer Base}.one` ? Base : never) : never;

const de: Record<EmailKey, string> = {
  'layout.tagline': 'Außendienstmanagement',
  'layout.automatedMessage': 'Dies ist eine automatische Nachricht von HBCField.',
  'layout.automatedAlert': 'Dies ist eine automatische Warnung von HBCField.',
  'layout.greeting': 'Guten Tag {{name}},',
  'layout.linkFallback': 'Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
  'layout.notAvailable': 'k. A.',

  'label.title': 'Titel',
  'label.description': 'Beschreibung',
  'label.priority': 'Priorität',
  'label.location': 'Standort',
  'label.clockIn': 'Eingestempelt',
  'label.clockOut': 'Ausgestempelt',
  'label.totalHours': 'Stunden gesamt',
  'label.member': 'Mitglied',
  'label.distance': 'Entfernung zum Standort',
  'label.allowedRadius': 'Erlaubter Radius',

  'unit.hours.one': '{{count}} Stunde',
  'unit.hours.other': '{{count}} Stunden',
  'unit.meters': '{{meters}} m',

  'priority.LOW': 'Niedrig',
  'priority.MEDIUM': 'Mittel',
  'priority.HIGH': 'Hoch',
  'priority.URGENT': 'Dringend',

  'role.ADMIN': 'Admin',
  'role.MANAGER': 'Manager',
  'role.EMPLOYEE': 'Mitarbeiter',
  'role.CUSTOMER': 'Kunde',

  'passwordReset.subject': 'HBCField – Passwort zurücksetzen',
  'passwordReset.heading': 'Anfrage zum Zurücksetzen des Passworts',
  'passwordReset.intro':
    'Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Klicken Sie auf die Schaltfläche unten, um ein neues Passwort festzulegen:',
  'passwordReset.button': 'Passwort zurücksetzen',
  'passwordReset.expires.one': 'Dieser Link ist {{count}} Stunde gültig.',
  'passwordReset.expires.other': 'Dieser Link ist {{count}} Stunden gültig.',
  'passwordReset.ignore': 'Falls Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.',

  'invitation.subject': 'Einladung zu {{org}} auf HBCField',
  'invitation.heading': 'Sie wurden eingeladen!',
  'invitation.intro': 'Sie wurden eingeladen, {{org}} als {{role}} beizutreten.',
  'invitation.codeLabel': 'Ihr Einladungscode',
  'invitation.stepsIntro': 'So geht es los:',
  'invitation.step1': 'Laden Sie die HBCField-App herunter',
  'invitation.step2': 'Erstellen Sie Ihr Konto',
  'invitation.step3': 'Wählen Sie bei der Einrichtung „Einladung verwenden“',
  'invitation.step4': 'Geben Sie den obigen Code ein',
  'invitation.expires': 'Diese Einladung läuft am {{date}} ab.',
  'invitation.footer':
    'Dies ist eine automatische E-Mail von HBCField. Falls Sie diese Einladung nicht erwartet haben, können Sie sie ignorieren.',
  'invitation.subjectNoOrg': 'Einladung zu HBCField',
  'invitation.introNoOrg': 'Sie wurden eingeladen, Ihrer Organisation als {{role}} beizutreten.',

  'geofence.subject.clock_in': 'Geofence-Warnung: {{name}} – Einstempeln',
  'geofence.subject.clock_out': 'Geofence-Warnung: {{name}} – Ausstempeln',
  'geofence.heading': 'Geofence-Warnung',
  'geofence.intro.clock_in': 'Ein Mitglied hat sich außerhalb des erlaubten Geofence-Bereichs eingestempelt.',
  'geofence.intro.clock_out': 'Ein Mitglied hat sich außerhalb des erlaubten Geofence-Bereichs ausgestempelt.',
  'geofence.details': 'Details',

  'taskAssigned.subject': 'Aufgabe zugewiesen: {{task}}',
  'taskAssigned.heading': 'Ihnen wurde eine neue Aufgabe zugewiesen',
  'taskCompleted.subject': 'Aufgabe abgeschlossen: {{task}}',
  'taskCompleted.heading': 'Aufgabe abgeschlossen',
  'taskCompleted.body': 'Die Aufgabe wurde als abgeschlossen markiert.',

  'autoClockOut.subject': 'Automatisch ausgestempelt: {{location}}',
  'autoClockOut.heading': 'Hinweis: automatisch ausgestempelt',
  'autoClockOut.reason.exceeded_duration':
    'Sie wurden automatisch ausgestempelt, weil Ihre Schicht die maximal erlaubte Dauer (16 Stunden) überschritten hat.',
  'autoClockOut.reason.end_of_day': 'Sie wurden zum Tagesende automatisch ausgestempelt.',
  'autoClockOut.details': 'Schichtdetails',
  'autoClockOut.contact': 'Falls Sie glauben, dass es sich um einen Fehler handelt, wenden Sie sich bitte an Ihre Führungskraft.',

  'report.subject': 'Bericht: {{name}}',
  'report.generated': 'Erstellt am {{date}}',
  'report.empty': 'Keine Daten für diesen Zeitraum.',
  'report.footer': 'HBCField — geplanter Bericht',

  'sign.subject.one': 'Ein Dokument wartet auf Ihre Unterschrift — {{org}}',
  'sign.subject.other': '{{count}} Dokumente warten auf Ihre Unterschrift — {{org}}',
  'sign.heading.one': 'Ein Dokument wartet auf Ihre Unterschrift',
  'sign.heading.other': '{{count}} Dokumente warten auf Ihre Unterschrift',
  'sign.intro.one':
    '{{org}} bittet Sie, die unten stehende Arbeit gegenzuzeichnen. Sie wurde bereits von der ausführenden Person unterschrieben und von der verantwortlichen Person freigegeben.',
  'sign.intro.other':
    '{{org}} bittet Sie, die unten stehenden Arbeiten gegenzuzeichnen. Jede wurde bereits von der ausführenden Person unterschrieben und von der verantwortlichen Person freigegeben.',
  'sign.waiting': 'Wartet auf Sie',
  'sign.button': 'Prüfen und unterschreiben',
  'sign.validity.one':
    'Dieser Link ist bis {{date}} gültig und bleibt Ihr Weg zurück zu diesen Dokumenten — falls er abläuft, können Sie auf derselben Seite einen neuen anfordern.',
  'sign.validity.other':
    'Sie können alle auf einmal unterschreiben. Dieser Link ist bis {{date}} gültig und bleibt Ihr Weg zurück zu diesen Dokumenten — falls er abläuft, können Sie auf derselben Seite einen neuen anfordern.',
  'sign.footer': 'Sie erhalten diese E-Mail, weil {{org}} Sie als Kunden für diese Arbeit angegeben hat.',
  'signReissue.subject': 'Ihre Dokumente bei {{org}}',
  'signReissue.heading': 'Hier ist Ihr Link',
  'signReissue.intro':
    'Er öffnet Ihre Dokumente bei {{org}} — sowohl die, die auf Ihre Unterschrift warten, als auch die bereits unterschriebenen.',
  'signReissue.button': 'Meine Dokumente öffnen',
  'signReissue.validity': 'Gültig bis {{date}}. Früher gesendete Links funktionieren nicht mehr.',
};

const es: Record<EmailKey, string> = {
  'layout.tagline': 'Gestión de servicios de campo',
  'layout.automatedMessage': 'Este es un mensaje automático de HBCField.',
  'layout.automatedAlert': 'Esta es una alerta automática de HBCField.',
  'layout.greeting': 'Hola, {{name}}:',
  'layout.linkFallback': 'Si el botón no funciona, copia y pega este enlace en tu navegador:',
  'layout.notAvailable': 'N/D',

  'label.title': 'Título',
  'label.description': 'Descripción',
  'label.priority': 'Prioridad',
  'label.location': 'Ubicación',
  'label.clockIn': 'Entrada',
  'label.clockOut': 'Salida',
  'label.totalHours': 'Horas totales',
  'label.member': 'Miembro',
  'label.distance': 'Distancia a la ubicación',
  'label.allowedRadius': 'Radio permitido',

  'unit.hours.one': '{{count}} hora',
  'unit.hours.other': '{{count}} horas',
  'unit.meters': '{{meters}} m',

  'priority.LOW': 'Baja',
  'priority.MEDIUM': 'Media',
  'priority.HIGH': 'Alta',
  'priority.URGENT': 'Urgente',

  'role.ADMIN': 'Administrador',
  'role.MANAGER': 'Responsable',
  'role.EMPLOYEE': 'Empleado',
  'role.CUSTOMER': 'Cliente',

  'passwordReset.subject': 'HBCField – Restablece tu contraseña',
  'passwordReset.heading': 'Solicitud de restablecimiento de contraseña',
  'passwordReset.intro':
    'Hemos recibido una solicitud para restablecer tu contraseña. Pulsa el botón de abajo para establecer una nueva:',
  'passwordReset.button': 'Restablecer contraseña',
  'passwordReset.expires.one': 'Este enlace caduca en {{count}} hora.',
  'passwordReset.expires.other': 'Este enlace caduca en {{count}} horas.',
  'passwordReset.ignore': 'Si no lo has solicitado, puedes ignorar este correo.',

  'invitation.subject': 'Te han invitado a unirte a {{org}} en HBCField',
  'invitation.heading': '¡Tienes una invitación!',
  'invitation.intro': 'Te han invitado a unirte a {{org}} como {{role}}.',
  'invitation.codeLabel': 'Tu código de invitación',
  'invitation.stepsIntro': 'Para empezar:',
  'invitation.step1': 'Descarga la app de HBCField',
  'invitation.step2': 'Crea tu cuenta',
  'invitation.step3': 'Elige «Usar invitación» durante la configuración',
  'invitation.step4': 'Introduce el código de arriba',
  'invitation.expires': 'Esta invitación caduca el {{date}}.',
  'invitation.footer': 'Este es un correo automático de HBCField. Si no esperabas esta invitación, puedes ignorarla.',
  'invitation.subjectNoOrg': 'Te han invitado a unirte a HBCField',
  'invitation.introNoOrg': 'Te han invitado a unirte a tu organización como {{role}}.',

  'geofence.subject.clock_in': 'Alerta de zona: {{name}} – entrada',
  'geofence.subject.clock_out': 'Alerta de zona: {{name}} – salida',
  'geofence.heading': 'Alerta de zona',
  'geofence.intro.clock_in': 'Un miembro ha fichado la entrada fuera de la zona permitida.',
  'geofence.intro.clock_out': 'Un miembro ha fichado la salida fuera de la zona permitida.',
  'geofence.details': 'Detalles',

  'taskAssigned.subject': 'Tarea asignada: {{task}}',
  'taskAssigned.heading': 'Se te ha asignado una nueva tarea',
  'taskCompleted.subject': 'Tarea completada: {{task}}',
  'taskCompleted.heading': 'Tarea completada',
  'taskCompleted.body': 'La tarea se ha marcado como completada.',

  'autoClockOut.subject': 'Salida fichada automáticamente: {{location}}',
  'autoClockOut.heading': 'Aviso de salida automática',
  'autoClockOut.reason.exceeded_duration':
    'Se ha fichado tu salida automáticamente porque tu turno superó la duración máxima permitida (16 horas).',
  'autoClockOut.reason.end_of_day': 'Se ha fichado tu salida automáticamente al final de la jornada.',
  'autoClockOut.details': 'Detalles del turno',
  'autoClockOut.contact': 'Si crees que se trata de un error, contacta con tu responsable.',

  'report.subject': 'Informe: {{name}}',
  'report.generated': 'Generado el {{date}}',
  'report.empty': 'No hay datos para este período.',
  'report.footer': 'HBCField — informe programado',

  'sign.subject.one': 'Un documento necesita tu firma — {{org}}',
  'sign.subject.other': '{{count}} documentos necesitan tu firma — {{org}}',
  'sign.heading.one': 'Un documento necesita tu firma',
  'sign.heading.other': '{{count}} documentos necesitan tu firma',
  'sign.intro.one':
    '{{org}} te pide que refrendes el trabajo que aparece abajo. Ya lo ha firmado la persona que lo realizó y lo ha aprobado su responsable.',
  'sign.intro.other':
    '{{org}} te pide que refrendes los trabajos que aparecen abajo. Cada uno ya lo ha firmado la persona que lo realizó y lo ha aprobado su responsable.',
  'sign.waiting': 'Pendiente de ti',
  'sign.button': 'Revisar y firmar',
  'sign.validity.one':
    'Este enlace es válido hasta el {{date}} y te permite volver a estos documentos; si caduca, puedes pedir uno nuevo desde la misma página.',
  'sign.validity.other':
    'Puedes firmarlos todos a la vez. Este enlace es válido hasta el {{date}} y te permite volver a estos documentos; si caduca, puedes pedir uno nuevo desde la misma página.',
  'sign.footer': 'Recibes este correo porque {{org}} te indicó como cliente de este trabajo.',
  'signReissue.subject': 'Tus documentos con {{org}}',
  'signReissue.heading': 'Aquí tienes tu enlace',
  'signReissue.intro': 'Abre tus documentos con {{org}}: tanto los que esperan tu firma como los que ya has firmado.',
  'signReissue.button': 'Abrir mis documentos',
  'signReissue.validity': 'Válido hasta el {{date}}. Cualquier enlace anterior que te enviamos ya no funciona.',
};

const fr: Record<EmailKey, string> = {
  'layout.tagline': 'Gestion des interventions terrain',
  'layout.automatedMessage': 'Ceci est un message automatique de HBCField.',
  'layout.automatedAlert': 'Ceci est une alerte automatique de HBCField.',
  'layout.greeting': 'Bonjour {{name}},',
  'layout.linkFallback': 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
  'layout.notAvailable': 'N/D',

  'label.title': 'Titre',
  'label.description': 'Description',
  'label.priority': 'Priorité',
  'label.location': 'Lieu',
  'label.clockIn': 'Arrivée',
  'label.clockOut': 'Départ',
  'label.totalHours': 'Total des heures',
  'label.member': 'Membre',
  'label.distance': 'Distance du lieu',
  'label.allowedRadius': 'Rayon autorisé',

  'unit.hours.one': '{{count}} heure',
  'unit.hours.other': '{{count}} heures',
  'unit.meters': '{{meters}} m',

  'priority.LOW': 'Basse',
  'priority.MEDIUM': 'Moyenne',
  'priority.HIGH': 'Haute',
  'priority.URGENT': 'Urgente',

  'role.ADMIN': 'Administrateur',
  'role.MANAGER': 'Responsable',
  'role.EMPLOYEE': 'Employé',
  'role.CUSTOMER': 'Client',

  'passwordReset.subject': 'HBCField – Réinitialisez votre mot de passe',
  'passwordReset.heading': 'Demande de réinitialisation du mot de passe',
  'passwordReset.intro':
    'Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau :',
  'passwordReset.button': 'Réinitialiser le mot de passe',
  'passwordReset.expires.one': 'Ce lien expire dans {{count}} heure.',
  'passwordReset.expires.other': 'Ce lien expire dans {{count}} heures.',
  'passwordReset.ignore': 'Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.',

  'invitation.subject': 'Vous êtes invité à rejoindre {{org}} sur HBCField',
  'invitation.heading': 'Vous avez reçu une invitation !',
  'invitation.intro': 'Vous êtes invité à rejoindre {{org}} en tant que {{role}}.',
  'invitation.codeLabel': 'Votre code d’invitation',
  'invitation.stepsIntro': 'Pour commencer :',
  'invitation.step1': 'Téléchargez l’application HBCField',
  'invitation.step2': 'Créez votre compte',
  'invitation.step3': 'Choisissez « Utiliser une invitation » lors de la configuration',
  'invitation.step4': 'Saisissez le code ci-dessus',
  'invitation.expires': 'Cette invitation expire le {{date}}.',
  'invitation.footer':
    'Ceci est un e-mail automatique de HBCField. Si vous n’attendiez pas cette invitation, vous pouvez l’ignorer.',
  'invitation.subjectNoOrg': 'Vous êtes invité à rejoindre HBCField',
  'invitation.introNoOrg': 'Vous êtes invité à rejoindre votre organisation en tant que {{role}}.',

  'geofence.subject.clock_in': 'Alerte de zone : {{name}} – arrivée',
  'geofence.subject.clock_out': 'Alerte de zone : {{name}} – départ',
  'geofence.heading': 'Alerte de zone',
  'geofence.intro.clock_in': 'Un membre a pointé son arrivée en dehors de la zone autorisée.',
  'geofence.intro.clock_out': 'Un membre a pointé son départ en dehors de la zone autorisée.',
  'geofence.details': 'Détails',

  'taskAssigned.subject': 'Tâche affectée : {{task}}',
  'taskAssigned.heading': 'Une nouvelle tâche vous a été affectée',
  'taskCompleted.subject': 'Tâche terminée : {{task}}',
  'taskCompleted.heading': 'Tâche terminée',
  'taskCompleted.body': 'La tâche a été marquée comme terminée.',

  'autoClockOut.subject': 'Départ pointé automatiquement : {{location}}',
  'autoClockOut.heading': 'Avis de départ automatique',
  'autoClockOut.reason.exceeded_duration':
    'Votre départ a été pointé automatiquement car votre poste a dépassé la durée maximale autorisée (16 heures).',
  'autoClockOut.reason.end_of_day': 'Votre départ a été pointé automatiquement en fin de journée.',
  'autoClockOut.details': 'Détails du poste',
  'autoClockOut.contact': 'Si vous pensez qu’il s’agit d’une erreur, contactez votre responsable.',

  'report.subject': 'Rapport : {{name}}',
  'report.generated': 'Généré le {{date}}',
  'report.empty': 'Aucune donnée pour cette période.',
  'report.footer': 'HBCField — rapport planifié',

  'sign.subject.one': 'Un document attend votre signature — {{org}}',
  'sign.subject.other': '{{count}} documents attendent votre signature — {{org}}',
  'sign.heading.one': 'Un document attend votre signature',
  'sign.heading.other': '{{count}} documents attendent votre signature',
  'sign.intro.one':
    '{{org}} vous demande de contresigner le travail ci-dessous. Il a déjà été signé par la personne qui l’a réalisé et approuvé par son responsable.',
  'sign.intro.other':
    '{{org}} vous demande de contresigner les travaux ci-dessous. Chacun a déjà été signé par la personne qui l’a réalisé et approuvé par son responsable.',
  'sign.waiting': 'En attente de votre part',
  'sign.button': 'Vérifier et signer',
  'sign.validity.one':
    'Ce lien est valable jusqu’au {{date}} et vous permet de revenir à ces documents — s’il expire, vous pouvez en demander un nouveau depuis la même page.',
  'sign.validity.other':
    'Vous pouvez tous les signer en une fois. Ce lien est valable jusqu’au {{date}} et vous permet de revenir à ces documents — s’il expire, vous pouvez en demander un nouveau depuis la même page.',
  'sign.footer': 'Vous recevez cet e-mail car {{org}} vous a indiqué comme client pour ce travail.',
  'signReissue.subject': 'Vos documents avec {{org}}',
  'signReissue.heading': 'Voici votre lien',
  'signReissue.intro':
    'Il ouvre vos documents avec {{org}} — ceux qui attendent votre signature comme ceux que vous avez déjà signés.',
  'signReissue.button': 'Ouvrir mes documents',
  'signReissue.validity': 'Valable jusqu’au {{date}}. Les liens envoyés précédemment ne fonctionnent plus.',
};

const it: Record<EmailKey, string> = {
  'layout.tagline': 'Gestione dei servizi sul campo',
  'layout.automatedMessage': 'Questo è un messaggio automatico di HBCField.',
  'layout.automatedAlert': 'Questo è un avviso automatico di HBCField.',
  'layout.greeting': 'Ciao {{name}},',
  'layout.linkFallback': 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
  'layout.notAvailable': 'N/D',

  'label.title': 'Titolo',
  'label.description': 'Descrizione',
  'label.priority': 'Priorità',
  'label.location': 'Luogo',
  'label.clockIn': 'Entrata',
  'label.clockOut': 'Uscita',
  'label.totalHours': 'Ore totali',
  'label.member': 'Membro',
  'label.distance': 'Distanza dal luogo',
  'label.allowedRadius': 'Raggio consentito',

  'unit.hours.one': '{{count}} ora',
  'unit.hours.other': '{{count}} ore',
  'unit.meters': '{{meters}} m',

  'priority.LOW': 'Bassa',
  'priority.MEDIUM': 'Media',
  'priority.HIGH': 'Alta',
  'priority.URGENT': 'Urgente',

  'role.ADMIN': 'Amministratore',
  'role.MANAGER': 'Responsabile',
  'role.EMPLOYEE': 'Dipendente',
  'role.CUSTOMER': 'Cliente',

  'passwordReset.subject': 'HBCField – Reimposta la password',
  'passwordReset.heading': 'Richiesta di reimpostazione della password',
  'passwordReset.intro':
    'Abbiamo ricevuto una richiesta di reimpostazione della tua password. Fai clic sul pulsante qui sotto per impostarne una nuova:',
  'passwordReset.button': 'Reimposta password',
  'passwordReset.expires.one': 'Questo link scade tra {{count}} ora.',
  'passwordReset.expires.other': 'Questo link scade tra {{count}} ore.',
  'passwordReset.ignore': 'Se non l’hai richiesto tu, puoi ignorare questa email.',

  'invitation.subject': 'Sei stato invitato a unirti a {{org}} su HBCField',
  'invitation.heading': 'Hai ricevuto un invito!',
  'invitation.intro': 'Sei stato invitato a unirti a {{org}} come {{role}}.',
  'invitation.codeLabel': 'Il tuo codice di invito',
  'invitation.stepsIntro': 'Per iniziare:',
  'invitation.step1': 'Scarica l’app HBCField',
  'invitation.step2': 'Crea il tuo account',
  'invitation.step3': 'Scegli «Usa un invito» durante la configurazione',
  'invitation.step4': 'Inserisci il codice qui sopra',
  'invitation.expires': 'Questo invito scade il {{date}}.',
  'invitation.footer': 'Questa è un’email automatica di HBCField. Se non aspettavi questo invito, puoi ignorarlo.',
  'invitation.subjectNoOrg': 'Sei stato invitato su HBCField',
  'invitation.introNoOrg': 'Sei stato invitato a unirti alla tua organizzazione come {{role}}.',

  'geofence.subject.clock_in': 'Avviso geofence: {{name}} – entrata',
  'geofence.subject.clock_out': 'Avviso geofence: {{name}} – uscita',
  'geofence.heading': 'Avviso geofence',
  'geofence.intro.clock_in': 'Un membro ha timbrato l’entrata fuori dall’area geofence consentita.',
  'geofence.intro.clock_out': 'Un membro ha timbrato l’uscita fuori dall’area geofence consentita.',
  'geofence.details': 'Dettagli',

  'taskAssigned.subject': 'Attività assegnata: {{task}}',
  'taskAssigned.heading': 'Ti è stata assegnata una nuova attività',
  'taskCompleted.subject': 'Attività completata: {{task}}',
  'taskCompleted.heading': 'Attività completata',
  'taskCompleted.body': 'L’attività è stata segnata come completata.',

  'autoClockOut.subject': 'Uscita timbrata automaticamente: {{location}}',
  'autoClockOut.heading': 'Avviso di uscita automatica',
  'autoClockOut.reason.exceeded_duration':
    'La tua uscita è stata timbrata automaticamente perché il turno ha superato la durata massima consentita (16 ore).',
  'autoClockOut.reason.end_of_day': 'La tua uscita è stata timbrata automaticamente a fine giornata.',
  'autoClockOut.details': 'Dettagli del turno',
  'autoClockOut.contact': 'Se pensi che si tratti di un errore, contatta il tuo responsabile.',

  'report.subject': 'Report: {{name}}',
  'report.generated': 'Generato il {{date}}',
  'report.empty': 'Nessun dato per questo periodo.',
  'report.footer': 'HBCField — report programmato',

  'sign.subject.one': 'Un documento richiede la tua firma — {{org}}',
  'sign.subject.other': '{{count}} documenti richiedono la tua firma — {{org}}',
  'sign.heading.one': 'Un documento richiede la tua firma',
  'sign.heading.other': '{{count}} documenti richiedono la tua firma',
  'sign.intro.one':
    '{{org}} ti chiede di controfirmare il lavoro qui sotto. È già stato firmato da chi lo ha svolto e approvato dal suo responsabile.',
  'sign.intro.other':
    '{{org}} ti chiede di controfirmare i lavori qui sotto. Ognuno è già stato firmato da chi lo ha svolto e approvato dal suo responsabile.',
  'sign.waiting': 'In attesa di te',
  'sign.button': 'Rivedi e firma',
  'sign.validity.one':
    'Questo link è valido fino al {{date}} e resta il tuo modo per tornare a questi documenti: se scade, puoi richiederne uno nuovo dalla stessa pagina.',
  'sign.validity.other':
    'Puoi firmarli tutti in una volta. Questo link è valido fino al {{date}} e resta il tuo modo per tornare a questi documenti: se scade, puoi richiederne uno nuovo dalla stessa pagina.',
  'sign.footer': 'Ricevi questa email perché {{org}} ti ha indicato come cliente per questo lavoro.',
  'signReissue.subject': 'I tuoi documenti con {{org}}',
  'signReissue.heading': 'Ecco il tuo link',
  'signReissue.intro': 'Apre i tuoi documenti con {{org}}: sia quelli in attesa della tua firma sia quelli che hai già firmato.',
  'signReissue.button': 'Apri i miei documenti',
  'signReissue.validity': 'Valido fino al {{date}}. I link inviati in precedenza non funzionano più.',
};

export const EMAIL_MESSAGES: Record<SupportedLocale, Record<EmailKey, string>> = { en, de, es, fr, it };
