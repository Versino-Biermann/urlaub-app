import { useState } from 'react'
import { LISTEN, kopieLesen } from '../db'

// Sicherungs-Export.
//
// Zwei Entscheidungen, die man dem Knopf nicht ansieht:
//
// 1. Die Daten kommen aus der Offline-Kopie im Browserspeicher, nicht aus
//    einem eigenen Netzabruf. Die Kopie wird von der Datenschicht bei jedem
//    erfolgreichen Ladevorgang und nach jeder Aenderung nachgefuehrt - sie
//    enthaelt also genau das, was die App anzeigt. Und weil das Lesen
//    synchron ist, steht vor dem Klick auf den Download keine await-Kette.
//    Das ist Absicht: iOS Safari ignoriert einen Anker-Klick mit Blob-Adresse
//    still, wenn er nicht mehr im echten Ereignis-Handler steckt.
//
// 2. Der Import ist ersatzlos entfallen - Begruendung siehe unten beim
//    Hinweistext.

function formatDateForFilename(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function DataBackup() {
  const [warnung, setWarnung] = useState('')

  const handleExport = () => {
    const data = {}
    const fehlend = []
    for (const liste of LISTEN) {
      const kopie = kopieLesen(liste)
      if (kopie) {
        data[liste] = kopie.eintraege
      } else {
        // Kein Stand vorhanden: der Bereich wurde in diesem Browser noch nie
        // geladen. Das gehoert benannt, sonst sieht das Backup vollstaendig
        // aus und ist es nicht.
        data[liste] = []
        fehlend.push(liste)
      }
    }

    setWarnung(
      fehlend.length > 0
        ? `Achtung: ${fehlend.length} von ${LISTEN.length} Bereichen liegen in diesem Browser noch nicht vor und stehen im Backup leer: ${fehlend.join(', ')}. Bitte die App einmal mit Verbindung öffnen und erneut exportieren.`
        : '',
    )

    const backup = {
      app: 'urlaub-app',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `urlaub-app-backup-${formatDateForFilename(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="backup-bar">
      <span className="backup-hint">
        Die Daten liegen in der Datenbank. Der Export ist eine Sicherungskopie zum Mitnehmen.
      </span>
      <button type="button" onClick={handleExport}>
        Backup exportieren
      </button>
      {warnung ? (
        <span className="backup-error" role="alert">
          {warnung}
        </span>
      ) : null}
    </div>
  )
}

export default DataBackup
