/**
 * The words on the update page, in the five languages the product speaks.
 *
 * ⚠️ NOT IN `src/i18n/locales/*.json`, and that is a considered exception
 * rather than an oversight. Those files are ~1.8 MB in total and are loaded
 * through machinery (`localeBundle`, namespaces, a request-scoped i18next
 * instance) built for pages a marketing visitor browses. This page is a link
 * sent by SMS to somebody standing next to a van, on a phone, possibly on one
 * bar of signal. Fifteen strings shipped inline cost less than the loader would,
 * and the page has no other reason to pull i18next in at all.
 *
 * ⚠️ THE LANGUAGE LIST ITSELF IS NOT DUPLICATED — it is imported from
 * `i18n/languages`, so a sixth language added to the product fails this file's
 * type check instead of silently rendering English.
 *
 * ⚠️ NEVER write "paid"/"unpaid" here (or anywhere a member reads). Hours are
 * worked, counted or approved.
 */

import type { Supported } from '@/i18n/languages';

export interface UpdateCopy {
  /** Browser tab + the page's own heading. */
  title: string;
  lede: string;
  /** The version chips. */
  yours: string;
  yoursUnknown: string;
  latest: string;
  /** The one button, by platform. */
  ctaIos: string;
  ctaAndroid: string;
  ctaDesktop: string;
  noteIos: string;
  noteAndroid: string;
  noteDesktop: string;
  /** Steps. */
  stepsHeading: string;
  step1: string;
  step2: string;
  step2Emphasis: string;
  step3: string;
  /** The reassurance panel — the first thing a field member worries about. */
  safeLead: string;
  safeStrong: string;
  safeTail: string;
  /** What changed. */
  newHeading: string;
  new1Strong: string;
  new1: string;
  new2Strong: string;
  new2: string;
  new3Strong: string;
  new3: string;
  /** Fallback row + help. */
  otherPhone: string;
  iphone: string;
  android: string;
  helpLead: string;
  helpLink: string;
}

export const UPDATE_COPY: Record<Supported, UpdateCopy> = {
  en: {
    title: 'Time to update',
    lede: "You're running an older version of HBCField. Updating takes about a minute and keeps your clock-in working properly.",
    yours: 'On your phone',
    yoursUnknown: 'Older',
    latest: 'Latest',
    ctaIos: 'Update from the App Store',
    ctaAndroid: 'Get it on Google Play',
    ctaDesktop: 'Open this page on your phone',
    noteIos: 'Opens the App Store on this iPhone',
    noteAndroid: 'Opens Google Play on this phone',
    noteDesktop: "We can't tell which phone you use from a computer — pick yours below",
    stepsHeading: 'What to do',
    step1: 'Tap the button above.',
    step2: 'in the store. Wait for it to finish.',
    step2Emphasis: 'Update',
    step3: 'Open HBCField again and sign in as usual.',
    safeLead: 'Nothing is lost.',
    safeStrong: 'Your hours, photos and anything saved while you had no signal stay on your phone',
    safeTail: "and are sent once you're back online.",
    newHeading: 'What you get',
    new1Strong: 'Works with no signal.',
    new1: 'A whole shift in a basement or a lift shaft, sent when the phone comes back.',
    new2Strong: 'Faster clock-in.',
    new2: "Fewer taps, and it tells you straight away if you're outside the site.",
    new3Strong: 'Fixes.',
    new3: 'Several crashes and sign-in problems reported from the field are gone.',
    otherPhone: 'Updating a different phone?',
    iphone: 'iPhone',
    android: 'Android',
    helpLead: 'Stuck, or the store shows no update?',
    helpLink: "Tell us and we'll sort it.",
  },
  de: {
    title: 'Zeit für ein Update',
    lede: 'Sie nutzen eine ältere Version von HBCField. Das Update dauert etwa eine Minute und hält Ihre Zeiterfassung zuverlässig.',
    yours: 'Auf Ihrem Telefon',
    yoursUnknown: 'Älter',
    latest: 'Aktuell',
    ctaIos: 'Im App Store aktualisieren',
    ctaAndroid: 'Bei Google Play holen',
    ctaDesktop: 'Diese Seite am Telefon öffnen',
    noteIos: 'Öffnet den App Store auf diesem iPhone',
    noteAndroid: 'Öffnet Google Play auf diesem Telefon',
    noteDesktop: 'Am Computer erkennen wir Ihr Telefon nicht — bitte unten auswählen',
    stepsHeading: 'So geht es',
    step1: 'Tippen Sie oben auf die Schaltfläche.',
    step2: 'im Store und warten Sie, bis es fertig ist.',
    step2Emphasis: 'Aktualisieren',
    step3: 'Öffnen Sie HBCField erneut und melden Sie sich wie gewohnt an.',
    safeLead: 'Es geht nichts verloren.',
    safeStrong:
      'Ihre Stunden, Fotos und alles, was Sie ohne Empfang gespeichert haben, bleiben auf dem Telefon',
    safeTail: 'und werden gesendet, sobald Sie wieder online sind.',
    newHeading: 'Das ist neu',
    new1Strong: 'Funktioniert ohne Empfang.',
    new1: 'Eine ganze Schicht im Keller oder im Aufzugsschacht — gesendet, sobald das Telefon zurück ist.',
    new2Strong: 'Schneller einstempeln.',
    new2: 'Weniger Tippen, und Sie erfahren sofort, wenn Sie außerhalb des Standorts sind.',
    new3Strong: 'Fehlerbehebungen.',
    new3: 'Mehrere Abstürze und Anmeldeprobleme aus dem Feld sind behoben.',
    otherPhone: 'Ein anderes Telefon aktualisieren?',
    iphone: 'iPhone',
    android: 'Android',
    helpLead: 'Klappt es nicht, oder zeigt der Store kein Update?',
    helpLink: 'Sagen Sie uns Bescheid, wir kümmern uns darum.',
  },
  es: {
    title: 'Toca actualizar',
    lede: 'Estás usando una versión antigua de HBCField. Actualizar lleva un minuto y mantiene el fichaje funcionando bien.',
    yours: 'En tu teléfono',
    yoursUnknown: 'Antigua',
    latest: 'Última',
    ctaIos: 'Actualizar en el App Store',
    ctaAndroid: 'Conseguir en Google Play',
    ctaDesktop: 'Abre esta página en tu teléfono',
    noteIos: 'Abre el App Store en este iPhone',
    noteAndroid: 'Abre Google Play en este teléfono',
    noteDesktop: 'Desde un ordenador no sabemos qué teléfono usas: elige abajo',
    stepsHeading: 'Qué hacer',
    step1: 'Pulsa el botón de arriba.',
    step2: 'en la tienda y espera a que termine.',
    step2Emphasis: 'Actualizar',
    step3: 'Abre HBCField otra vez e inicia sesión como siempre.',
    safeLead: 'No se pierde nada.',
    safeStrong: 'Tus horas, fotos y todo lo guardado sin cobertura siguen en el teléfono',
    safeTail: 'y se envían en cuanto vuelvas a tener conexión.',
    newHeading: 'Qué ganas',
    new1Strong: 'Funciona sin cobertura.',
    new1: 'Un turno entero en un sótano, enviado cuando el teléfono vuelve.',
    new2Strong: 'Fichaje más rápido.',
    new2: 'Menos toques, y te avisa al momento si estás fuera del centro.',
    new3Strong: 'Correcciones.',
    new3: 'Varios fallos y problemas de acceso reportados desde el terreno ya no están.',
    otherPhone: '¿Actualizar otro teléfono?',
    iphone: 'iPhone',
    android: 'Android',
    helpLead: '¿Atascado, o la tienda no muestra actualización?',
    helpLink: 'Dínoslo y lo resolvemos.',
  },
  fr: {
    title: 'Il est temps de mettre à jour',
    lede: 'Vous utilisez une ancienne version de HBCField. La mise à jour prend une minute et garde votre pointage fiable.',
    yours: 'Sur votre téléphone',
    yoursUnknown: 'Ancienne',
    latest: 'Dernière',
    ctaIos: "Mettre à jour sur l'App Store",
    ctaAndroid: 'Télécharger sur Google Play',
    ctaDesktop: 'Ouvrez cette page sur votre téléphone',
    noteIos: "Ouvre l'App Store sur cet iPhone",
    noteAndroid: 'Ouvre Google Play sur ce téléphone',
    noteDesktop:
      "Depuis un ordinateur, nous ne savons pas quel téléphone vous utilisez — choisissez ci-dessous",
    stepsHeading: 'Que faire',
    step1: 'Appuyez sur le bouton ci-dessus.',
    step2: 'dans le store et attendez la fin.',
    step2Emphasis: 'Mettre à jour',
    step3: "Rouvrez HBCField et connectez-vous comme d'habitude.",
    safeLead: "Rien n'est perdu.",
    safeStrong:
      'Vos heures, vos photos et tout ce qui a été enregistré sans réseau restent sur le téléphone',
    safeTail: 'et partent dès que vous êtes de nouveau en ligne.',
    newHeading: 'Ce que vous gagnez',
    new1Strong: 'Fonctionne sans réseau.',
    new1: 'Un poste entier dans un sous-sol, envoyé au retour du réseau.',
    new2Strong: 'Pointage plus rapide.',
    new2: "Moins d'appuis, et vous savez tout de suite si vous êtes hors du site.",
    new3Strong: 'Corrections.',
    new3: 'Plusieurs plantages et problèmes de connexion signalés sur le terrain ont disparu.',
    otherPhone: 'Mettre à jour un autre téléphone ?',
    iphone: 'iPhone',
    android: 'Android',
    helpLead: "Bloqué, ou le store n'affiche aucune mise à jour ?",
    helpLink: "Dites-le-nous, on s'en occupe.",
  },
  it: {
    title: 'È ora di aggiornare',
    lede: "Stai usando una versione precedente di HBCField. L'aggiornamento richiede un minuto e mantiene la timbratura affidabile.",
    yours: 'Sul tuo telefono',
    yoursUnknown: 'Precedente',
    latest: 'Ultima',
    ctaIos: "Aggiorna dall'App Store",
    ctaAndroid: 'Scarica da Google Play',
    ctaDesktop: 'Apri questa pagina sul telefono',
    noteIos: "Apre l'App Store su questo iPhone",
    noteAndroid: 'Apre Google Play su questo telefono',
    noteDesktop: 'Da un computer non sappiamo quale telefono usi: scegli qui sotto',
    stepsHeading: 'Cosa fare',
    step1: 'Tocca il pulsante qui sopra.',
    step2: 'nello store e aspetta che finisca.',
    step2Emphasis: 'Aggiorna',
    step3: 'Riapri HBCField e accedi come sempre.',
    safeLead: 'Non si perde nulla.',
    safeStrong: 'Le tue ore, le foto e tutto ciò che hai salvato senza campo restano sul telefono',
    safeTail: 'e vengono inviati appena torni online.',
    newHeading: 'Cosa ottieni',
    new1Strong: 'Funziona senza campo.',
    new1: 'Un turno intero in un seminterrato, inviato quando il telefono torna in rete.',
    new2Strong: 'Timbratura più rapida.',
    new2: 'Meno tocchi, e ti dice subito se sei fuori dalla sede.',
    new3Strong: 'Correzioni.',
    new3: 'Diversi crash e problemi di accesso segnalati sul campo sono risolti.',
    otherPhone: 'Aggiornare un altro telefono?',
    iphone: 'iPhone',
    android: 'Android',
    helpLead: 'Bloccato, o lo store non mostra aggiornamenti?',
    helpLink: 'Scrivici e lo risolviamo.',
  },
};
