import { useState, useRef } from 'react'
import BackupShare from './BackupShare'
// STORAGE_KEYS und formatDateForFilename liegen jetzt in src/backup.js, damit
// Download-Export und Teilen-Weg dieselbe Quelle benutzen. Zwei Kopien der
// Schluesselliste laufen auseinander, sobald ein Bereich dazukommt.
import { STORAGE_KEYS, formatDateForFilename } from '../backup'

function readKeyRaw(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function DataBackup() {
  const [errorText, setErrorText] = useState('')
  const fileInputRef = useRef(null)

  const handleExport = () => {
    const data = {}
    for (const [dataKey, storageKey] of Object.entries(STORAGE_KEYS)) {
      data[dataKey] = readKeyRaw(storageKey)
    }

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

  const handleImportChange = async (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) return

    setErrorText('')

    try {
      const text = await file.text()
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        setErrorText('Die ausgewählte Datei ist kein gültiges JSON.')
        return
      }

      if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object' || parsed.data === null) {
        setErrorText('Die Backup-Datei hat kein gültiges Format.')
        return
      }

      const confirmed = window.confirm(
        'Aktuelle Daten werden durch das Backup ersetzt. Fortfahren?'
      )
      if (!confirmed) {
        return
      }

      for (const [dataKey, storageKey] of Object.entries(STORAGE_KEYS)) {
        if (Object.prototype.hasOwnProperty.call(parsed.data, dataKey)) {
          localStorage.setItem(storageKey, JSON.stringify(parsed.data[dataKey]))
        }
      }

      location.reload()
    } catch {
      setErrorText('Die Backup-Datei konnte nicht gelesen werden.')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="backup-bar">
      <span className="backup-hint">
        Daten liegen nur lokal in diesem Browser. Änderungen und Löschungen bleiben
        erhalten, bis ein neuer Stand veröffentlicht wird; dann gewinnt der veröffentlichte
        Stand bei bestehenden Einträgen.
      </span>
      <button type="button" onClick={handleExport}>
        Backup exportieren
      </button>
      <label className="backup-import-label">
        Backup importieren
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </label>
      {errorText ? <span className="backup-error">{errorText}</span> : null}
      <BackupShare />
    </div>
  )
}

export default DataBackup
