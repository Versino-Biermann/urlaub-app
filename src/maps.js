// Google-Maps-Links werden zur Laufzeit aus von/nach erzeugt.
// Bewusst KEIN neues Datenfeld: data.json und die MCP-Vertraege bleiben
// unveraendert, die Links sind reine Anzeige.

// Privatadresse. Steht ausschliesslich hier und landet nur in den generierten
// Links (Adressleiste/Google) - nie in data.json, nie im MCP, nie im Backup.
// Grund: Eine Route "Ulm -> X" soll an der Haustuer starten, nicht am
// Stadtzentrum. Beim Aendern des Wohnorts nur diese Konstante anfassen.
const START_ADRESSE = 'Selbertstraße 67, 89075 Ulm'
const START_ORT = 'ulm'

/**
 * Ort fuer die ROUTENFUEHRUNG aufloesen: "Ulm" (egal wie geschrieben) wird
 * zur vollen Startadresse, alles andere bleibt wie eingegeben.
 */
function routenOrt(ort) {
  const text = String(ort || '').trim()
  if (!text) return ''
  return text.toLowerCase() === START_ORT ? START_ADRESSE : text
}

/**
 * Link auf die Google-Maps-Routenplanung von A nach B.
 * Leerer String, wenn eine der beiden Seiten fehlt.
 */
export function routenUrl(von, nach) {
  const start = routenOrt(von)
  const ziel = routenOrt(nach)
  if (!start || !ziel) return ''
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${encodeURIComponent(start)}` +
    `&destination=${encodeURIComponent(ziel)}`
  )
}

/**
 * Link auf die Zielstadt in Google Maps. Hier bewusst OHNE die Privatadresse:
 * gezeigt wird die Stadt, nicht die Haustuer.
 */
export function ortsUrl(ort) {
  const text = String(ort || '').trim()
  if (!text) return ''
  return `https://www.google.com/maps?q=${encodeURIComponent(text)}`
}

/**
 * Einbett-URL fuer die kleine Kartenvorschau der Zielstadt (ohne API-Key).
 * Ebenfalls ohne Privatadresse - siehe ortsUrl().
 */
export function karteEinbettenUrl(ort) {
  const text = String(ort || '').trim()
  if (!text) return ''
  return `https://maps.google.com/maps?q=${encodeURIComponent(text)}&z=10&output=embed`
}
