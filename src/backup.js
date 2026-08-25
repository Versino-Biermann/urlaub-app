// Gemeinsame Grundlage fuer alle Sicherungswege (Download-Export, Teilen,
// Text-Rueckfall). Hier steht bewusst nur Logik ohne React und ohne DOM,
// damit sie unabhaengig von der Oberflaeche pruefbar ist.
//
// Warum diese Datei ueberhaupt existiert: die Speicherschluessel und das
// Backup-Format duerfen es nur EINMAL im Projekt geben. Zwei Kopien laufen
// erfahrungsgemaess auseinander, sobald ein Bereich dazukommt - und ein
// Backup, dem ein Bereich fehlt, faellt erst beim Wiederherstellen auf.

export const STORAGE_KEYS = {
  etappen: 'urlaub-app.etappen',
  bookings: 'urlaub-app.bookings',
  route: 'urlaub-app.route',
  sightseeing: 'urlaub-app.sightseeing',
  events: 'urlaub-app.events',
  restaurants: 'urlaub-app.restaurants',
}

// Klarnamen fuer die Anzeige. Die Schluessel oben sind das Datenformat und
// bleiben englisch (der Import liest sie), die Anzeige ist deutsch.
export const BEREICH_NAMEN = {
  etappen: 'Etappen',
  bookings: 'Buchungen',
  route: 'Reiseroute',
  sightseeing: 'Sehenswürdigkeiten',
  events: 'Events',
  restaurants: 'Restaurants',
}

export function formatDateForFilename(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Liest alle Bereiche aus dem localStorage und meldet dabei ausdruecklich,
 * welche Bereiche NICHT lesbar waren.
 *
 * Der Unterschied zum stillen Leseweg des Download-Exports ist der Kern
 * dieser Funktion: dort wird jeder Fehler zu einer leeren Liste, und ein
 * beschaedigter Schluessel landet als leerer Bereich im Backup, ohne dass
 * es jemand merkt. Hier bleibt der Bereich zwar ebenfalls leer - das Backup
 * soll ja trotzdem entstehen, ein halbes Backup ist besser als keins - aber
 * der Befund wird mitgeliefert und ist damit anzeigbar.
 *
 * Nur lesend. Diese Datei schreibt nirgends in den localStorage.
 *
 * @returns {{ data: object, defekte: Array<{bereich: string, grund: string}> }}
 */
export function leseBereicheMitBefund() {
  const data = {}
  const defekte = []

  for (const [dataKey, storageKey] of Object.entries(STORAGE_KEYS)) {
    let roh
    try {
      roh = localStorage.getItem(storageKey)
    } catch (fehler) {
      // Kommt real vor: privater Modus / gesperrter Speicher wirft schon
      // beim Lesen. Dann ist der Bereich nicht "leer", sondern unbekannt.
      data[dataKey] = []
      defekte.push({
        bereich: dataKey,
        grund: `Speicher nicht lesbar (${benenneFehler(fehler)})`,
      })
      continue
    }

    // Nicht vorhanden ist kein Defekt - der Bereich wurde schlicht nie
    // befuellt. Genau das ist der Normalfall bei einer frischen Installation.
    if (roh === null || roh === '') {
      data[dataKey] = []
      continue
    }

    let geparst
    try {
      geparst = JSON.parse(roh)
    } catch {
      data[dataKey] = []
      defekte.push({
        bereich: dataKey,
        grund: 'gespeicherter Text ist kein gültiges JSON',
      })
      continue
    }

    if (!Array.isArray(geparst)) {
      data[dataKey] = []
      defekte.push({
        bereich: dataKey,
        grund: 'gespeicherter Wert ist keine Liste',
      })
      continue
    }

    data[dataKey] = geparst
  }

  return { data, defekte }
}

/**
 * Baut das Backup-Objekt im selben Format wie der Download-Export
 * (app/version/exportedAt/data) und liefert den Lesebefund mit.
 */
export function baueBackup(jetzt = new Date()) {
  const { data, defekte } = leseBereicheMitBefund()

  return {
    backup: {
      app: 'urlaub-app',
      version: 1,
      exportedAt: jetzt.toISOString(),
      data,
    },
    defekte,
  }
}

/**
 * Dateiname fuer den Teilen-Weg.
 *
 * Die Endung ist mit Absicht `.json.txt` und NICHT `.json`. Chromium prueft
 * beim Teilen von Dateien Endung UND MIME-Typ gegen eine feste Positivliste
 * (`share_service_impl.cc`, `IsDangerousFilename` / `IsDangerousMimeType`,
 * dokumentiert in `third_party/blink/.../webshare/FILE_TYPES.md`). Weder
 * `.json` noch `application/json` stehen darin - eine als JSON deklarierte
 * Datei wird also abgelehnt. `.txt` mit `text/plain` steht drin.
 *
 * Der Inhalt bleibt unveraendert JSON, nur die Verpackung ist eine, die der
 * Browser durchlaesst.
 */
export function backupDateiname(jetzt = new Date()) {
  return `urlaub-app-backup-${formatDateForFilename(jetzt)}.json.txt`
}

/** MIME-Typ passend zur Endung oben - siehe Begruendung bei backupDateiname. */
export const BACKUP_DATEI_TYP = 'text/plain'

/**
 * Fehlernamen fuer die Anzeige. Ohne diesen Namen steht in der Meldung nur
 * "hat nicht geklappt", und der Nutzer kann nichts damit anfangen.
 */
export function benenneFehler(fehler) {
  if (!fehler) return 'unbekannter Fehler'
  if (typeof fehler === 'string') return fehler
  return fehler.name || fehler.message || 'unbekannter Fehler'
}
