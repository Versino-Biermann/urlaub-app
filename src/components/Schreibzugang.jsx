import { useState } from 'react'
import { geheimnisSetzen, geheimnisLoeschen, hatGeheimnis } from '../db'

// Eingabe des Schreibgeheimnisses - einmal pro Geraet.
//
// Der Platz ist bewusst der Kopfbereich, direkt neben der Bereichsauswahl:
// dort steht die Zeile auf jeder Seite und in jedem Bereich, und sie sagt im
// Ruhezustand schon, woran man ist ("Nur Lesen" bzw. "Schreiben moeglich").
// Christof muss also nicht suchen und auch nicht wissen, dass es so etwas
// wie ein Geheimnis gibt, bevor er es braucht.
//
// Das Geheimnis wird nur in den Browserspeicher dieses Geraets geschrieben.
// Es steht nirgends im Quelltext und wird nie an einen anderen Ort geschickt
// als an die Datenbank selbst.
export default function Schreibzugang() {
  const [offen, setOffen] = useState(false)
  const [wert, setWert] = useState('')
  const [aktiv, setAktiv] = useState(hatGeheimnis)
  const [meldung, setMeldung] = useState('')

  function handleSpeichern(event) {
    event.preventDefault()
    const getrimmt = wert.trim()
    if (!getrimmt) {
      setMeldung('Bitte das Schreibgeheimnis eingeben.')
      return
    }
    try {
      geheimnisSetzen(getrimmt)
    } catch {
      // Passiert z.B. im privaten Modus mancher Browser.
      setMeldung('Dieser Browser lässt kein Speichern zu. Ohne Speicher kann dieses Gerät nur lesen.')
      return
    }
    setAktiv(true)
    setWert('')
    setOffen(false)
    setMeldung('')
  }

  function handleEntfernen() {
    geheimnisLoeschen()
    setAktiv(false)
    setWert('')
    setMeldung('')
  }

  return (
    <div className="schreibzugang">
      {/*
        Bewusst NICHT "aktiv": die App weiss an dieser Stelle nur, dass ein
        Geheimnis hinterlegt ist - nicht, ob es stimmt. Geprueft wird es erst
        von der Datenbank beim ersten Speichern. "aktiv" waere ein Versprechen,
        das die App nicht halten kann; bei einem Tippfehler haette Christof
        sich in Sicherheit gewiegt. Passt das Geheimnis nicht, sagt die
        Fehlermeldung beim Speichern genau, was zu tun ist.
      */}
      <span className="schreibzugang-status">
        {aktiv ? 'Schreibzugang: Geheimnis hinterlegt' : 'Schreibzugang: nur Lesen'}
      </span>

      <button type="button" onClick={() => setOffen((v) => !v)}>
        {offen ? 'Schließen' : aktiv ? 'Schreibgeheimnis ändern' : 'Schreibgeheimnis eingeben'}
      </button>

      {aktiv && !offen && (
        <button type="button" onClick={handleEntfernen}>
          Schreibzugang entfernen
        </button>
      )}

      {offen && (
        <form className="schreibzugang-form" onSubmit={handleSpeichern}>
          <label htmlFor="schreibgeheimnis">Schreibgeheimnis</label>
          <input
            id="schreibgeheimnis"
            type="password"
            autoComplete="off"
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            placeholder="einmal pro Gerät"
          />
          <button type="submit">Speichern</button>
          <p className="schreibzugang-hinweis">
            Ohne Geheimnis kannst du alles ansehen, aber nichts anlegen, ändern oder löschen.
            Es bleibt nur auf diesem Gerät.
          </p>
        </form>
      )}

      {meldung && (
        <p className="schreibzugang-hinweis" role="alert">
          {meldung}
        </p>
      )}
    </div>
  )
}
