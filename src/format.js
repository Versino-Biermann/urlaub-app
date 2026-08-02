// Zentrale Anzeige-Helfer. Gespeichert wird immer ISO (YYYY-MM-DD) -
// hier wird ausschliesslich fuer die Darstellung umgeformt.

/**
 * ISO-Datum (YYYY-MM-DD) als deutsches Datum (TT.MM.JJJJ) ausgeben.
 * Leere/fehlende Werte ergeben "" - Nicht-ISO-Text bleibt unveraendert,
 * damit Freitext-Felder (z.B. "Tisch 20 Uhr") nicht zerstoert werden.
 */
export function formatDate(iso) {
  if (!iso) return ''
  const text = String(iso).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return text
  const [, jahr, monat, tag] = match
  return `${tag}.${monat}.${jahr}`
}

/**
 * Kopie der Liste, chronologisch nach einem ISO-Datumsschluessel sortiert.
 * Eintraege ohne Datum wandern ans Ende und behalten dort ihre bisherige
 * Reihenfolge.
 *
 * ISO-Strings (YYYY-MM-DD) sind lexikografisch vergleichbar - deshalb kein
 * Date-Parsing. Array.prototype.sort ist seit ES2019 stabil, gleiche
 * Schluessel behalten also die Ausgangsreihenfolge. Sortiert wird nur eine
 * Kopie: die gespeicherte Reihenfolge bleibt unveraendert.
 */
export function sortByDate(list, getKey) {
  return [...list].sort((a, b) => {
    const ka = getKey(a) || ''
    const kb = getKey(b) || ''
    if (ka === kb) return 0
    if (!ka) return 1
    if (!kb) return -1
    return ka < kb ? -1 : 1
  })
}

/**
 * Kurzes Label fuer eine URL (Hostname), Fallback: die URL selbst.
 */
export function linkLabel(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * href-Wert fuer eine gespeicherte URL. Fehlt das Schema, wird https://
 * ergaenzt - sonst wuerde der Browser den Wert als relativen Pfad deuten.
 *
 * Sicherheit: Es werden ausschliesslich http/https als Ziel zugelassen
 * (Allowlist). Alles andere - insbesondere javascript: und data: - ergibt ""
 * und wird von EntryLink gar nicht gerendert. Der gespeicherte Wert bleibt
 * unveraendert; gefiltert wird nur bei der Anzeige.
 */
export function linkHref(url) {
  const text = String(url || '').trim()
  if (!text) return ''
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
  const kandidat = hasScheme ? text : `https://${text}`
  return /^https?:\/\//i.test(kandidat) ? kandidat : ''
}
