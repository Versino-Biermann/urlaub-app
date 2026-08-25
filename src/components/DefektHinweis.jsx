import { BEREICH_NAMEN } from '../backup'

// Ein Hinweis, zwei Sicherungswege.
//
// Sowohl der Download-Export als auch der Teilen-/Text-Weg koennen auf einen
// Bereich stossen, der sich nicht lesen laesst. Beide melden das mit exakt
// derselben Anzeige - ein zweiter Mechanismus fuer dieselbe Aussage waere die
// Stelle, an der die beiden Wege spaeter auseinanderlaufen.
//
// Bewusst nur informierend: der Hinweis erscheint NEBEN dem Ergebnis, er
// verhindert die Sicherung nicht. Ein lueckenhaftes Backup ist mehr wert als
// gar keins - der Nutzer muss nur wissen, dass es lueckenhaft ist.

function DefektHinweis({ defekte }) {
  if (!defekte || defekte.length === 0) return null

  const gesamt = Object.keys(BEREICH_NAMEN).length
  const aufzaehlung = defekte
    .map((eintrag) => `${BEREICH_NAMEN[eintrag.bereich] || eintrag.bereich} (${eintrag.grund})`)
    .join(', ')

  return (
    <p className="backup-share-warnung" role="alert">
      {`Achtung: ${defekte.length} von ${gesamt} Bereichen konnten nicht gelesen werden und stehen im Backup leer: ${aufzaehlung}.`}
    </p>
  )
}

export default DefektHinweis
