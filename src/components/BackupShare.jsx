import { useState, useRef } from 'react'
import {
  baueBackup,
  backupDateiname,
  BACKUP_DATEI_TYP,
  BEREICH_NAMEN,
  benenneFehler,
} from '../backup'

// Zweiter Sicherungsweg - bewusst OHNE die Download-Mechanik.
//
// Der bestehende Export-Knopf haengt an einem Blob-Link mit `download`-Attribut.
// Genau dieser Weg ist der Verdaechtige beim Fehlerbild "Export geht auf dem
// Handy nicht" (Android WebView loest Blob-URLs teils nicht auf, der Klick wird
// dann stumm ignoriert). Dieser Weg hier beruehrt weder Blob-URL noch
// `download` und ist damit unabhaengig davon, ob jener Verdacht stimmt.
//
// Zwei Stufen:
//   1. Teilen ueber `navigator.share` mit Datei - wo verfuegbar.
//   2. Text anzeigen + kopieren - immer verfuegbar, auch ohne Netz, auch ohne
//      Teilen-Funktion. Stufe 2 ist der Rueckfall fuer Stufe 1 UND ein
//      eigenstaendiger Weg.
//
// Leitplanke fuer beide Stufen: NIE stillschweigend scheitern. Jeder Ausgang
// setzt eine sichtbare Meldung mit Grund.

const TEILEN_TITEL = 'urlaub-app Backup'

function BackupShare() {
  const [backupText, setBackupText] = useState('')
  const [meldung, setMeldung] = useState('')
  const [istFehler, setIstFehler] = useState(false)
  const [defekte, setDefekte] = useState([])
  const textfeldRef = useRef(null)

  const melde = (text, fehler = false) => {
    setMeldung(text)
    setIstFehler(fehler)
  }

  // Backup erzeugen und den Rueckfall (Stufe 2) sofort bereitstellen.
  // Wird von BEIDEN Knoepfen aufgerufen: auch wer auf "Teilen" drueckt, hat
  // danach den Text vor sich - falls das Teilen scheitert, ist der Rueckfall
  // schon da und braucht keinen zweiten Klick.
  const erzeugeUndZeige = () => {
    const { backup, defekte: befund } = baueBackup()
    const inhalt = JSON.stringify(backup, null, 2)
    setBackupText(inhalt)
    setDefekte(befund)
    return inhalt
  }

  const handleTeilen = () => {
    // Alles hier ist synchron. Kein `await` vor `navigator.share` - die
    // Nutzergeste muss beim Aufruf noch gelten, sonst lehnt der Browser mit
    // NotAllowedError ab (MDN: "requires transient activation").
    const inhalt = erzeugeUndZeige()

    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      melde(
        'Dieser Browser kann nicht teilen. Der Backup-Text steht unten zum Kopieren bereit.',
        true,
      )
      return
    }

    let datei
    try {
      datei = new File([inhalt], backupDateiname(new Date()), { type: BACKUP_DATEI_TYP })
    } catch (fehler) {
      melde(
        `Die Backup-Datei ließ sich nicht erzeugen (${benenneFehler(fehler)}). ` +
          'Der Backup-Text steht unten zum Kopieren bereit.',
        true,
      )
      return
    }

    const nutzlast = { files: [datei], title: TEILEN_TITEL }

    // canShare prueft, ob die Daten ueberhaupt teilbar sind. Wichtige Grenze:
    // es prueft in Chromium NICHT den Dateityp (`CanShareInternal` in
    // navigator_share.cc schaut nur, ob ein bekanntes Feld gesetzt und eine
    // etwaige URL gueltig ist). Ein `true` von canShare ist deshalb KEINE
    // Zusage, dass share() gelingt - der Fehlerpfad unten ist der eigentliche
    // Schutz, nicht diese Abfrage.
    if (typeof navigator.canShare !== 'function' || !navigator.canShare(nutzlast)) {
      melde(
        'Dieser Browser kann keine Dateien teilen. Der Backup-Text steht unten zum Kopieren bereit.',
        true,
      )
      return
    }

    let versprechen
    try {
      versprechen = navigator.share(nutzlast)
    } catch (fehler) {
      // share() kann auch synchron werfen (z.B. TypeError bei ungueltigen Daten).
      melde(
        `Teilen nicht möglich (${benenneFehler(fehler)}). ` +
          'Der Backup-Text steht unten zum Kopieren bereit.',
        true,
      )
      return
    }

    melde('Teilen-Dialog wird geöffnet …')

    Promise.resolve(versprechen).then(
      () => melde('Backup wurde an die ausgewählte App übergeben.'),
      (fehler) => {
        const name = benenneFehler(fehler)
        if (name === 'AbortError') {
          // Abbruch durch den Nutzer ist kein Defekt - aber auch kein Grund,
          // gar nichts zu sagen. Sonst sieht der Bildschirm aus wie bei einem
          // stillen Fehlschlag.
          melde('Teilen abgebrochen. Der Backup-Text steht unten zum Kopieren bereit.')
          return
        }
        melde(
          `Teilen fehlgeschlagen (${name}). Der Backup-Text steht unten zum Kopieren bereit.`,
          true,
        )
      },
    )
  }

  const handleAnzeigen = () => {
    erzeugeUndZeige()
    melde('Backup steht unten als Text bereit.')
  }

  const handleKopieren = () => {
    const feld = textfeldRef.current
    if (!feld) {
      melde('Das Textfeld ist nicht bereit. Bitte zuerst das Backup anzeigen lassen.', true)
      return
    }

    // Zuerst markieren, dann kopieren. Wenn das Kopieren scheitert, ist der
    // Text bereits ausgewaehlt und laesst sich von Hand uebernehmen - das ist
    // der eigentliche Rueckfall des Rueckfalls.
    feld.focus()
    feld.select()

    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      melde(
        'Dieser Browser gibt keinen Zugriff auf die Zwischenablage. ' +
          'Der Text ist markiert – bitte von Hand kopieren.',
        true,
      )
      return
    }

    let versprechen
    try {
      versprechen = navigator.clipboard.writeText(feld.value)
    } catch (fehler) {
      melde(
        `Kopieren fehlgeschlagen (${benenneFehler(fehler)}). ` +
          'Der Text ist markiert – bitte von Hand kopieren.',
        true,
      )
      return
    }

    Promise.resolve(versprechen).then(
      () => melde('Backup in die Zwischenablage kopiert.'),
      (fehler) =>
        melde(
          `Kopieren fehlgeschlagen (${benenneFehler(fehler)}). ` +
            'Der Text ist markiert – bitte von Hand kopieren.',
          true,
        ),
    )
  }

  return (
    <div className="backup-share">
      <button type="button" onClick={handleTeilen}>
        Backup teilen
      </button>
      <button type="button" onClick={handleAnzeigen}>
        Backup als Text anzeigen
      </button>

      {defekte.length > 0 ? (
        <p className="backup-share-warnung" role="alert">
          {`Achtung: ${defekte.length} von ${Object.keys(BEREICH_NAMEN).length} Bereichen konnten nicht gelesen werden und stehen im Backup leer: `}
          {defekte
            .map((eintrag) => `${BEREICH_NAMEN[eintrag.bereich] || eintrag.bereich} (${eintrag.grund})`)
            .join(', ')}
          .
        </p>
      ) : null}

      {meldung ? (
        <p className={istFehler ? 'backup-error' : 'backup-share-meldung'} role="status">
          {meldung}
        </p>
      ) : null}

      {backupText ? (
        <div className="backup-share-text">
          <textarea
            ref={textfeldRef}
            className="backup-share-feld"
            aria-label="Backup als Text"
            readOnly
            rows={8}
            value={backupText}
          />
          <button type="button" onClick={handleKopieren}>
            Text in die Zwischenablage kopieren
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default BackupShare
