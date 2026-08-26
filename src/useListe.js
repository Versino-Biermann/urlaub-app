// ===========================================================================
// React-Anbindung an die Datenschicht (src/db.js).
//
// Hier steht kein einziger fetch-Aufruf - der gesamte Datenverkehr liegt in
// db.js. Diese Datei uebersetzt ihn nur in React-Zustand.
//
// Wichtigster Unterschied zu vorher: die Listen kommen nicht mehr synchron
// beim Anlegen der Komponente aus dem Browserspeicher, sondern asynchron aus
// dem Netz. Der Anfangszustand ist deshalb IMMER die leere Liste mit
// laden === true. Jede Komponente muss diesen Ladezustand anzeigen, sonst
// blitzt fuer einen Moment "Noch keine Eintraege erfasst." auf, obwohl
// Eintraege da sind.
// ===========================================================================

import { useCallback, useEffect, useState } from 'react'
import * as db from './db'

function fehlerText(fehler) {
  if (fehler && fehler.name === 'DbFehler') return fehler.nachricht
  return 'Unerwarteter Fehler. Es wurde nichts gespeichert.'
}

// Eine Liste mit vollem Zugriff: lesen, anlegen, aendern, loeschen.
//
// Rueckgabe:
//   eintraege      aktuelle Liste (leer, solange geladen wird)
//   laden          true, solange der erste Ladevorgang laeuft
//   ladeFehler     Text, wenn weder Datenbank noch Kopie etwas liefern
//   ausKopie       true, wenn die Anzeige aus der Offline-Kopie stammt
//   stand          Zeitpunkt dieser Kopie (ISO), sonst null
//   schreibFehler  Text des letzten fehlgeschlagenen Schreibversuchs
//   anlegen/aendern/loeschen  liefern true bei Erfolg, false bei Misserfolg
export function useListe(name) {
  const [eintraege, setEintraege] = useState([])
  const [laden, setLaden] = useState(true)
  const [ladeFehler, setLadeFehler] = useState('')
  const [ausKopie, setAusKopie] = useState(false)
  const [stand, setStand] = useState(null)
  const [schreibFehler, setSchreibFehler] = useState('')

  useEffect(() => {
    // Schutz gegen Wettlauf: React fuehrt Effekte im Entwicklungsmodus doppelt
    // aus, und ein Bereichswechsel kann einen laufenden Ladevorgang ueberholen.
    // Ohne diese Marke schriebe die alte Antwort den neuen Zustand zu.
    let abgebrochen = false

    async function laufen() {
      setLaden(true)
      setLadeFehler('')
      try {
        const ergebnis = await db.alleLesen(name)
        if (abgebrochen) return
        setEintraege(ergebnis.eintraege)
        setAusKopie(ergebnis.ausKopie)
        setStand(ergebnis.stand)
      } catch (fehler) {
        if (abgebrochen) return
        setEintraege([])
        setAusKopie(false)
        setStand(null)
        setLadeFehler(fehlerText(fehler))
      } finally {
        if (!abgebrochen) setLaden(false)
      }
    }

    laufen()
    return () => {
      abgebrochen = true
    }
  }, [name])

  const anlegen = useCallback(
    async (werte) => {
      setSchreibFehler('')
      try {
        const neu = await db.anlegen(name, { id: db.neueKennung(), ...werte })
        setEintraege((vorher) => [...vorher, neu])
        // Ein erfolgreicher Schreibvorgang beweist, dass die Verbindung wieder
        // steht - der Offline-Hinweis darf dann nicht stehenbleiben.
        setAusKopie(false)
        return true
      } catch (fehler) {
        setSchreibFehler(fehlerText(fehler))
        return false
      }
    },
    [name],
  )

  const aendern = useCallback(
    async (id, werte) => {
      setSchreibFehler('')
      try {
        const neu = await db.aendern(name, id, werte)
        setEintraege((vorher) =>
          vorher.map((e) => (String(e.id) === String(id) ? { ...e, ...neu } : e)),
        )
        setAusKopie(false)
        return true
      } catch (fehler) {
        setSchreibFehler(fehlerText(fehler))
        return false
      }
    },
    [name],
  )

  const loeschen = useCallback(
    async (id) => {
      setSchreibFehler('')
      try {
        await db.loeschen(name, id)
        setEintraege((vorher) => vorher.filter((e) => String(e.id) !== String(id)))
        setAusKopie(false)
        return true
      } catch (fehler) {
        setSchreibFehler(fehlerText(fehler))
        return false
      }
    },
    [name],
  )

  return {
    eintraege,
    laden,
    ladeFehler,
    ausKopie,
    stand,
    schreibFehler,
    setSchreibFehler,
    anlegen,
    aendern,
    loeschen,
  }
}

// Mehrere Listen auf einmal, nur lesend. Wird von der Etappen-Ansicht
// gebraucht, die alle fuenf anderen Listen ueber "etappeId" verknuepft.
//
// "namen" MUSS ein Array sein, das seine Identitaet zwischen zwei
// Darstellungen behaelt (also ausserhalb der Komponente stehen) - sonst laedt
// der Effekt endlos nach.
export function useListen(namen) {
  const schluessel = namen.join(',')
  const [daten, setDaten] = useState({})
  const [laden, setLaden] = useState(true)
  const [ausKopie, setAusKopie] = useState(false)
  const [stand, setStand] = useState(null)

  useEffect(() => {
    let abgebrochen = false
    const liste = schluessel.split(',')

    async function laufen() {
      setLaden(true)
      const ergebnisse = await Promise.all(
        liste.map(async (name) => {
          try {
            const e = await db.alleLesen(name)
            return { name, ...e }
          } catch {
            // Eine unerreichbare Nebenliste darf die Etappen-Ansicht nicht
            // ganz verhindern - sie erscheint dann eben leer.
            return { name, eintraege: [], ausKopie: false, stand: null }
          }
        }),
      )
      if (abgebrochen) return
      const neu = {}
      let irgendeineKopie = false
      let aeltesterStand = null
      for (const e of ergebnisse) {
        neu[e.name] = e.eintraege
        if (e.ausKopie) {
          irgendeineKopie = true
          if (e.stand && (!aeltesterStand || e.stand < aeltesterStand)) aeltesterStand = e.stand
        }
      }
      setDaten(neu)
      setAusKopie(irgendeineKopie)
      setStand(aeltesterStand)
      setLaden(false)
    }

    laufen()
    return () => {
      abgebrochen = true
    }
  }, [schluessel])

  return { daten, laden, ausKopie, stand }
}
