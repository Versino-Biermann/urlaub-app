// Gemeinsame Zustandsanzeige ueber jeder Liste.
//
// Sie beantwortet drei Fragen, die der Nutzer sonst raten muesste:
//   Wird gerade geladen?
//   Sehe ich den echten Stand oder eine Offline-Kopie - und von wann?
//   Ist mein letzter Speicherversuch durchgekommen?

function standText(iso) {
  if (!iso) return 'unbekanntem Stand'
  const zeit = new Date(iso)
  if (Number.isNaN(zeit.getTime())) return 'unbekanntem Stand'
  const zwei = (n) => String(n).padStart(2, '0')
  return `Stand ${zwei(zeit.getDate())}.${zwei(zeit.getMonth() + 1)}.${zeit.getFullYear()}, ${zwei(zeit.getHours())}:${zwei(zeit.getMinutes())} Uhr`
}

export default function Datenstand({
  laden,
  ladeFehler,
  ausKopie,
  stand,
  schreibFehler,
  nichtGeladeneBereiche = [],
  bereicheGesamt = 0,
}) {
  return (
    <>
      {laden && <p className="datenstand laden">Daten werden geladen…</p>}

      {/*
        Teilausfall der verknuepften Bereiche. Ohne diesen Hinweis waere eine
        nicht ladbare Nebenliste von einer wirklich leeren nicht zu
        unterscheiden - der Nutzer saehe schlicht nichts und hielte das fuer
        die Wahrheit.
      */}
      {!laden && nichtGeladeneBereiche.length > 0 && (
        <p className="datenstand fehler" role="alert">
          Achtung: {nichtGeladeneBereiche.length} von {bereicheGesamt} verknüpften Bereichen{' '}
          {nichtGeladeneBereiche.length === 1 ? 'konnte' : 'konnten'} nicht geladen werden:{' '}
          {nichtGeladeneBereiche.join(', ')}.{' '}
          {nichtGeladeneBereiche.length === 1 ? 'Für diesen Bereich' : 'Für diese Bereiche'}{' '}
          bedeutet ein fehlender Eintrag in der Übersicht NICHT, dass keiner vorhanden ist.
        </p>
      )}

      {!laden && ladeFehler && (
        <p className="datenstand fehler" role="alert">
          {ladeFehler} Es liegt auch keine Offline-Kopie auf diesem Gerät vor.
        </p>
      )}

      {!laden && !ladeFehler && ausKopie && (
        <p className="datenstand offline" role="status">
          Keine Verbindung zur Datenbank. Angezeigt wird die Offline-Kopie dieses Geräts ({standText(stand)}).
          Nur lesen — Änderungen sind ohne Verbindung nicht möglich.
        </p>
      )}

      {schreibFehler && (
        <p className="datenstand fehler" role="alert">
          {schreibFehler}
        </p>
      )}
    </>
  )
}
