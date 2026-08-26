// ===========================================================================
// Datenschicht: der einzige Weg der App zur Datenbank.
//
// Aller Datenverkehr laeuft ueber diese Datei. Die Komponenten kennen weder
// die Adresse der Datenbank noch das Schreibgeheimnis noch die Kopfzeilen -
// sie rufen nur alleLesen / anlegen / aendern / loeschen auf.
//
// ---------------------------------------------------------------------------
// UEBERGANGSZUSTAND (Stand 2026-08-26) - BITTE LESEN
//
// Ab diesem Umbau liest und schreibt die App ausschliesslich diese Datenbank.
// Der MCP-Server unter mcp/ schreibt zu diesem Zeitpunkt aber noch nach
// public/data.json. Diese Datei wird von der App NICHT mehr geladen.
//
// Folge: solange die MCP-Umstellung nicht fertig ist, landen ueber den
// MCP-Weg eingetragene Reise-Infos NICHT in der App. Sie gehen ins Leere.
// Bis dahin bitte nichts ueber den MCP-Weg eintragen lassen.
//
// Sobald mcp/ auf die Datenbank umgestellt ist, kann dieser Hinweis weg.
// ---------------------------------------------------------------------------
//
// Offline-Kopie: jeder erfolgreiche Ladevorgang legt das Ergebnis im
// Browserspeicher ab. Ist die Datenbank nicht erreichbar, liefert alleLesen
// diese Kopie zurueck und meldet das ueber das Feld "ausKopie". Die Kopie ist
// ausdruecklich NUR zum Lesen da - Schreiben ohne Verbindung schlaegt sichtbar
// fehl und wird nirgends zwischengespeichert.
// ===========================================================================

const DB_URL = 'https://yrsdfiskfpefzqgoscze.supabase.co'

// Oeffentlicher Lese-Schluessel. Er darf im Quelltext stehen: er erlaubt nur
// das, was die Zeilenschutz-Regeln der Datenbank ohnehin jedem erlauben -
// lesen. Jeder Schreibvorgang verlangt zusaetzlich das Schreibgeheimnis, und
// das steht NICHT hier, sondern nur im Browserspeicher des jeweiligen Geraets.
const DB_KEY = 'sb_publishable_ZDpxCF_YHauqkktcx-z0_Q_paZnPWfi'

const GEHEIMNIS_SCHLUESSEL = 'urlaub-app.schreibgeheimnis'
const GEHEIMNIS_KOPFZEILE = 'x-urlaub-schreibgeheimnis'

// Eigener Namensraum fuer die Offline-Kopie. Die alten Schluessel
// (urlaub-app.etappen usw.) bleiben unangetastet liegen - sie sind ab jetzt
// bedeutungslos fuer die App, aber ein zusaetzlicher Rettungsanker.
const KOPIE_PRAEFIX = 'urlaub-app.kopie.'

const ZEITGRENZE_MS = 12000

// Die Felder, die eine Liste in der App hat. Sie sind wortgleich zu den
// Spaltennamen in der Datenbank - deshalb muss in den Komponenten nichts
// umbenannt werden.
//
// Die Liste ist zugleich Filter in BEIDE Richtungen:
//   Lesen:     nur diese Spalten werden angefordert. Die Verwaltungsspalten
//              id_numerisch und aktualisiert_am kommen gar nicht erst mit,
//              die App bekommt also genau die Objektform von frueher.
//   Schreiben: nur diese Felder werden gesendet. Damit kann ein gelesener
//              Eintrag gefahrlos zurueckgeschickt werden, ohne dass die
//              Verwaltungsspalten ueberschrieben werden.
export const FELDER = {
  etappen: ['id', 'name', 'vonDatum', 'bisDatum', 'notiz', 'link'],
  bookings: ['id', 'titel', 'typ', 'datum', 'checkIn', 'checkOut', 'notiz', 'link', 'etappeId'],
  route: ['id', 'von', 'nach', 'datum', 'distanz', 'notiz', 'link', 'etappeId'],
  sightseeing: ['id', 'titel', 'ort', 'kategorie', 'notiz', 'link', 'status', 'etappeId'],
  events: ['id', 'titel', 'datum', 'ort', 'kontakt', 'status', 'notiz', 'link', 'etappeId'],
  restaurants: ['id', 'name', 'ort', 'kueche', 'reservierung', 'kontakt', 'notiz', 'link', 'etappeId'],
}

export const LISTEN = Object.keys(FELDER)

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

// Ein Fehler mit Ursache. Die Komponenten zeigen nur .nachricht an - die ist
// bewusst in Alltagssprache formuliert, nicht technisch.
export class DbFehler extends Error {
  constructor(art, nachricht, status) {
    super(nachricht)
    this.name = 'DbFehler'
    this.art = art // 'netz' | 'geheimnis-fehlt' | 'geheimnis-abgelehnt' | 'http' | 'antwort'
    this.nachricht = nachricht
    this.status = status || 0
  }
}

const TEXT_GEHEIMNIS_FEHLT =
  'Zum Speichern brauchst du das Schreibgeheimnis. Die Eingabe steht oben im Kopfbereich unter „Schreibzugang“. Ohne Geheimnis kannst du alles lesen, aber nichts ändern.'

const TEXT_GEHEIMNIS_ABGELEHNT =
  'Das gespeicherte Schreibgeheimnis wird von der Datenbank abgelehnt. Bitte oben unter „Schreibzugang“ neu eingeben. Es wurde nichts gespeichert.'

const TEXT_KEIN_NETZ =
  'Keine Verbindung zur Datenbank. Die Änderung wurde NICHT gespeichert. Bitte bei Empfang erneut versuchen.'

// ---------------------------------------------------------------------------
// Schreibgeheimnis - liegt nur im Browserspeicher dieses Geraets
// ---------------------------------------------------------------------------

export function geheimnisLesen() {
  try {
    return localStorage.getItem(GEHEIMNIS_SCHLUESSEL) || ''
  } catch {
    return ''
  }
}

export function hatGeheimnis() {
  return geheimnisLesen().length > 0
}

// Wirft, wenn der Browserspeicher nicht schreibbar ist (privater Modus). Der
// Aufrufer soll das dem Nutzer zeigen statt es zu verschlucken.
export function geheimnisSetzen(wert) {
  localStorage.setItem(GEHEIMNIS_SCHLUESSEL, wert)
}

export function geheimnisLoeschen() {
  try {
    localStorage.removeItem(GEHEIMNIS_SCHLUESSEL)
  } catch {
    // Nicht loeschbar heisst nicht, dass die App haengen bleiben darf.
  }
}

// ---------------------------------------------------------------------------
// Offline-Kopie
// ---------------------------------------------------------------------------

function kopieSchluessel(liste) {
  return KOPIE_PRAEFIX + liste
}

function kopieSchreiben(liste, eintraege) {
  try {
    localStorage.setItem(
      kopieSchluessel(liste),
      JSON.stringify({ stand: new Date().toISOString(), eintraege }),
    )
  } catch {
    // Voller oder gesperrter Speicher darf das Laden nicht scheitern lassen.
    // Der Nutzer hat die Daten in diesem Moment ja vor sich.
  }
}

// Liefert { eintraege, stand } oder null, wenn keine brauchbare Kopie da ist.
export function kopieLesen(liste) {
  try {
    const roh = localStorage.getItem(kopieSchluessel(liste))
    if (!roh) return null
    const inhalt = JSON.parse(roh)
    if (!inhalt || !Array.isArray(inhalt.eintraege)) return null
    return { eintraege: inhalt.eintraege, stand: inhalt.stand || '' }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Anfragen
// ---------------------------------------------------------------------------

function kopfzeilen(mitGeheimnis) {
  const kopf = {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    'Content-Type': 'application/json',
  }
  if (mitGeheimnis) {
    kopf[GEHEIMNIS_KOPFZEILE] = geheimnisLesen()
  }
  return kopf
}

// AbortSignal.timeout gibt es nicht in jeder Umgebung (aeltere Browser,
// Testumgebungen). Fehlt es, laeuft die Anfrage eben ohne Zeitgrenze.
function zeitgrenze() {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ZEITGRENZE_MS)
    }
  } catch {
    // ignorieren
  }
  return undefined
}

function pruefeListe(liste) {
  if (!Object.prototype.hasOwnProperty.call(FELDER, liste)) {
    throw new DbFehler('antwort', `Unbekannte Liste "${liste}".`)
  }
}

// Nimmt genau die Felder, die zur Liste gehoeren. Alles andere - auch die
// Verwaltungsspalten der Datenbank - faellt weg.
function nurBekannteFelder(liste, eintrag) {
  const sauber = {}
  for (const feld of FELDER[liste]) {
    if (eintrag[feld] !== undefined && eintrag[feld] !== null) {
      sauber[feld] = eintrag[feld]
    }
  }
  return sauber
}

async function anfrage(pfad, optionen, mitGeheimnis) {
  let antwort
  try {
    antwort = await fetch(`${DB_URL}/rest/v1/${pfad}`, {
      ...optionen,
      // Zusatz-Kopfzeilen des Aufrufers ergaenzen die Grundkopfzeilen, statt
      // sie zu ersetzen.
      headers: { ...kopfzeilen(mitGeheimnis), ...(optionen.headers || {}) },
      signal: zeitgrenze(),
    })
  } catch {
    // Kein HTTP-Status: Netz weg, Zeitgrenze gerissen oder Herkunft blockiert.
    throw new DbFehler('netz', TEXT_KEIN_NETZ, 0)
  }

  const roh = await antwort.text()

  if (!antwort.ok) {
    if (mitGeheimnis && (antwort.status === 401 || antwort.status === 403)) {
      throw new DbFehler(
        hatGeheimnis() ? 'geheimnis-abgelehnt' : 'geheimnis-fehlt',
        hatGeheimnis() ? TEXT_GEHEIMNIS_ABGELEHNT : TEXT_GEHEIMNIS_FEHLT,
        antwort.status,
      )
    }
    throw new DbFehler(
      'http',
      `Die Datenbank hat die Anfrage abgelehnt (HTTP ${antwort.status}). Es wurde nichts gespeichert.`,
      antwort.status,
    )
  }

  if (!roh) return null
  try {
    return JSON.parse(roh)
  } catch {
    throw new DbFehler('antwort', 'Die Datenbank hat eine unlesbare Antwort geschickt.', antwort.status)
  }
}

// Vor jedem Schreibvorgang: ohne Geheimnis gar nicht erst losschicken. Der
// Nutzer bekommt sofort den Klartext statt eine Absage der Datenbank.
function pruefeSchreibrecht() {
  if (!hatGeheimnis()) {
    throw new DbFehler('geheimnis-fehlt', TEXT_GEHEIMNIS_FEHLT, 0)
  }
}

// ---------------------------------------------------------------------------
// Die vier Operationen je Liste
// ---------------------------------------------------------------------------

// Liefert { eintraege, ausKopie, stand }.
//   ausKopie === false -> frisch aus der Datenbank, stand === null
//   ausKopie === true  -> Datenbank war nicht erreichbar, Kopie vom "stand"
// Ist die Datenbank nicht erreichbar UND es gibt keine Kopie, wirft die
// Funktion - dann hat die App nichts anzuzeigen und muss das sagen.
export async function alleLesen(liste) {
  pruefeListe(liste)
  const spalten = FELDER[liste].join(',')
  try {
    const zeilen = await anfrage(`${liste}?select=${spalten}&order=id.asc`, { method: 'GET' }, false)
    const eintraege = Array.isArray(zeilen) ? zeilen : []
    kopieSchreiben(liste, eintraege)
    return { eintraege, ausKopie: false, stand: null }
  } catch (fehler) {
    const kopie = kopieLesen(liste)
    if (kopie) {
      return { eintraege: kopie.eintraege, ausKopie: true, stand: kopie.stand }
    }
    throw fehler
  }
}

// Erzeugt eine neue Kennung. Bewusst als Zeichenkette: die Spalte "id" ist
// text, und die App vergleicht Kennungen ohnehin durchgehend als Zeichenkette.
export function neueKennung() {
  return String(Date.now())
}

// Legt an und liefert den Eintrag so zurueck, wie die Datenbank ihn gespeichert
// hat - inklusive aller Standardwerte.
export async function anlegen(liste, eintrag) {
  pruefeListe(liste)
  pruefeSchreibrecht()
  const spalten = FELDER[liste].join(',')
  const zeilen = await anfrage(
    `${liste}?select=${spalten}`,
    {
      method: 'POST',
      // Ohne diese Kopfzeile liefert die Datenbank einen leeren Rumpf zurueck.
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(nurBekannteFelder(liste, eintrag)),
    },
    true,
  )
  return Array.isArray(zeilen) && zeilen.length > 0 ? zeilen[0] : nurBekannteFelder(liste, eintrag)
}

export async function aendern(liste, id, eintrag) {
  pruefeListe(liste)
  pruefeSchreibrecht()
  const spalten = FELDER[liste].join(',')
  const daten = nurBekannteFelder(liste, eintrag)
  delete daten.id // Die Kennung wird nie umgeschrieben.
  const zeilen = await anfrage(
    `${liste}?id=eq.${encodeURIComponent(String(id))}&select=${spalten}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(daten),
    },
    true,
  )
  if (Array.isArray(zeilen) && zeilen.length === 0) {
    throw new DbFehler('antwort', 'Der Eintrag wurde in der Datenbank nicht gefunden. Es wurde nichts geändert.', 0)
  }
  return Array.isArray(zeilen) && zeilen.length > 0 ? zeilen[0] : { ...daten, id }
}

export async function loeschen(liste, id) {
  pruefeListe(liste)
  pruefeSchreibrecht()
  await anfrage(
    `${liste}?id=eq.${encodeURIComponent(String(id))}`,
    { method: 'DELETE' },
    true,
  )
}
