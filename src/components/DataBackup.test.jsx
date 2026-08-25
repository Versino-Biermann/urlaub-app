import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataBackup from './DataBackup'

// Verhaltenstests fuer den Download-Export.
//
// Geprueft wird die eine Zusicherung, an der beim Sichern alles haengt: der
// Export laeuft auch dann durch, wenn ein Bereich unlesbar ist - aber er sagt
// es dann. Ein Backup, das eine Luecke stillschweigend als leeren Bereich
// wegschreibt, faellt erst auf, wenn man es braucht.
//
// Die Download-Mechanik selbst (Blob-URL, Anker, download-Attribut) wird hier
// nicht bewertet, nur festgestellt, DASS sie ausgeloest wurde.

const ETAPPEN_KEY = 'urlaub-app.etappen'
const EVENTS_KEY = 'urlaub-app.events'

const urspruenglich = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
}

/**
 * Blob-URLs gibt es in jsdom nicht. Statt den Export zu umgehen, wird die
 * URL-Erzeugung ersetzt und dabei der Blob festgehalten - so laesst sich
 * pruefen, was der Nutzer tatsaechlich heruntergeladen haette.
 */
function ruesteDownloadAus() {
  const blobs = []
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob)
    return `blob:test-${blobs.length}`
  })
  URL.revokeObjectURL = vi.fn()
  const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { blobs, klick }
}

/**
 * location.reload gibt es in jsdom nicht ausfuehrbar. Ersetzt wird nur die
 * Methode, damit der Test sehen kann, DASS die Seite neu geladen haette -
 * das ist der letzte Schritt des Wiederherstellungs-Ablaufs.
 */
function ruesteReloadAus() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, href: window.location.href, reload },
  })
  return reload
}

const echteLocation = window.location

afterEach(() => {
  URL.createObjectURL = urspruenglich.createObjectURL
  URL.revokeObjectURL = urspruenglich.revokeObjectURL
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: echteLocation,
  })
})

/** Datei mit gueltigem Backup-Inhalt, so wie der Export sie erzeugt. */
function backupDatei(data, name = 'urlaub-app-backup-2026-08-29.json') {
  const inhalt = JSON.stringify({
    app: 'urlaub-app',
    version: 1,
    exportedAt: '2026-08-29T10:00:00.000Z',
    data,
  })
  return new File([inhalt], name, { type: 'application/json' })
}

function dateiFeld() {
  return screen.getByLabelText('Backup importieren')
}

function gespeichert(schluessel) {
  const roh = window.localStorage.getItem(schluessel)
  return roh === null ? null : JSON.parse(roh)
}

describe('Download-Export meldet unlesbare Bereiche', () => {
  it('Nutzerpfad: ein Speicher-Schluessel ist beschaedigt -> "Backup exportieren" -> Download laeuft trotzdem, aber die Luecke wird benannt', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(ETAPPEN_KEY, JSON.stringify([{ id: 'e1', name: 'Reims' }]))
    window.localStorage.setItem(EVENTS_KEY, '{kein gueltiges json')

    const { blobs, klick } = ruesteDownloadAus()
    render(<DataBackup />)

    // Vor dem Klick keine Warnung - sonst waere der Test auch bei einer
    // Dauerwarnung gruen.
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    // 1. Der Export wurde tatsaechlich ausgeloest - der Hinweis blockiert nicht.
    expect(klick).toHaveBeenCalledTimes(1)
    expect(blobs).toHaveLength(1)

    // 2. Die heruntergeladene Datei enthaelt die lesbaren Daten.
    const inhalt = JSON.parse(await blobs[0].text())
    expect(inhalt.app).toBe('urlaub-app')
    expect(inhalt.version).toBe(1)
    expect(inhalt.data.etappen).toEqual([{ id: 'e1', name: 'Reims' }])
    expect(inhalt.data.events).toEqual([])

    // 3. Und der Nutzer erfaehrt, dass ein Bereich fehlt.
    const warnung = screen.getByRole('alert').textContent
    expect(warnung).toContain('1 von 6 Bereichen')
    expect(warnung).toContain('Events')
    expect(warnung).toContain('kein gültiges JSON')
  })

  it('Nutzerpfad: alle Bereiche lesbar -> "Backup exportieren" -> Download ohne Warnung', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(ETAPPEN_KEY, JSON.stringify([{ id: 'e1', name: 'Rouen' }]))

    const { blobs, klick } = ruesteDownloadAus()
    render(<DataBackup />)

    await user.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(klick).toHaveBeenCalledTimes(1)

    const inhalt = JSON.parse(await blobs[0].text())
    expect(inhalt.data.etappen).toEqual([{ id: 'e1', name: 'Rouen' }])
    // Alle sechs Bereiche stehen im Backup, auch die leeren.
    expect(Object.keys(inhalt.data).sort()).toEqual(
      ['bookings', 'etappen', 'events', 'restaurants', 'route', 'sightseeing'].sort(),
    )
  })

  it('Nutzerpfad: jeder einzelne Bereich beschaedigt -> Export laeuft, alle sechs Luecken werden benannt', async () => {
    const user = userEvent.setup()
    for (const schluessel of [
      'urlaub-app.etappen',
      'urlaub-app.bookings',
      'urlaub-app.route',
      'urlaub-app.sightseeing',
      'urlaub-app.events',
      'urlaub-app.restaurants',
    ]) {
      window.localStorage.setItem(schluessel, 'kaputt')
    }

    const { blobs, klick } = ruesteDownloadAus()
    render(<DataBackup />)
    await user.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    // Auch ein vollstaendig unlesbarer Speicher darf den Export nicht abwuergen.
    expect(klick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('6 von 6 Bereichen')

    const inhalt = JSON.parse(await blobs[0].text())
    expect(inhalt.data.etappen).toEqual([])
    expect(inhalt.data.restaurants).toEqual([])
  })
})

// Regressionstests fuer den Wiederherstellungs-Weg.
//
// Diese Tests haben gefehlt, und genau deshalb blieb ein ReferenceError in
// handleImportChange trotz "73 von 73 gruen" unsichtbar: kein einziger Test
// hat den Upload-Pfad je angefasst.
//
// Sie gehen bewusst den ganzen Weg ueber die Oberflaeche - Datei auswaehlen,
// bestaetigen, schreiben, neu laden. Ein Test, der handleImportChange isoliert
// aufruft, haette denselben Fehler ebenfalls verpasst, weil er die Bindung der
// Funktion an ihr Modul nicht mitprueft.
describe('Backup wiederherstellen', () => {
  it('Nutzerpfad: gueltige Backup-Datei waehlen -> bestaetigen -> alle sechs Bereiche stehen im Speicher und die Seite laedt neu', async () => {
    const user = userEvent.setup()
    // Alter Stand, der ersetzt werden soll.
    window.localStorage.setItem(
      'urlaub-app.etappen',
      JSON.stringify([{ id: 'alt', name: 'Alter Eintrag' }]),
    )

    const bestaetigen = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const reload = ruesteReloadAus()

    render(<DataBackup />)

    await user.upload(
      dateiFeld(),
      backupDatei({
        etappen: [{ id: 'e1', name: 'Reims' }],
        bookings: [{ id: 'b1', titel: 'Hotel Reims' }],
        route: [{ id: 'r1', von: 'Ulm', nach: 'Reims' }],
        sightseeing: [{ id: 's1', name: 'Kathedrale' }],
        events: [{ id: 'v1', name: 'Weinfest' }],
        restaurants: [{ id: 'g1', name: 'Brasserie' }],
      }),
    )

    // Der Nutzer wurde gefragt, bevor sein aktueller Stand ersetzt wurde.
    expect(bestaetigen).toHaveBeenCalledTimes(1)

    // Kern der Regression: der Speicher traegt danach den Inhalt der Datei.
    // Ohne den STORAGE_KEYS-Import flog hier ein ReferenceError und der alte
    // Eintrag blieb stehen.
    expect(gespeichert('urlaub-app.etappen')).toEqual([{ id: 'e1', name: 'Reims' }])
    expect(gespeichert('urlaub-app.bookings')).toEqual([{ id: 'b1', titel: 'Hotel Reims' }])
    expect(gespeichert('urlaub-app.route')).toEqual([{ id: 'r1', von: 'Ulm', nach: 'Reims' }])
    expect(gespeichert('urlaub-app.sightseeing')).toEqual([{ id: 's1', name: 'Kathedrale' }])
    expect(gespeichert('urlaub-app.events')).toEqual([{ id: 'v1', name: 'Weinfest' }])
    expect(gespeichert('urlaub-app.restaurants')).toEqual([{ id: 'g1', name: 'Brasserie' }])

    // Und die Seite laedt neu, damit die App den neuen Stand anzeigt.
    expect(reload).toHaveBeenCalledTimes(1)

    // Keine Fehlermeldung - weder die Datei-Meldung noch die interne.
    expect(screen.queryByText(/konnte nicht gelesen werden/)).toBeNull()
    expect(screen.queryByText(/Interner Fehler/)).toBeNull()
  })

  it('Nutzerpfad: Nutzer bricht die Bestaetigung ab -> nichts wird ueberschrieben, kein Neuladen', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'urlaub-app.etappen',
      JSON.stringify([{ id: 'alt', name: 'Alter Eintrag' }]),
    )

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const reload = ruesteReloadAus()

    render(<DataBackup />)
    await user.upload(dateiFeld(), backupDatei({ etappen: [{ id: 'e1', name: 'Reims' }] }))

    expect(reload).not.toHaveBeenCalled()
    expect(gespeichert('urlaub-app.etappen')).toEqual([{ id: 'alt', name: 'Alter Eintrag' }])
  })

  it('Nutzerpfad: beschaedigte Datei waehlen -> Meldung zeigt auf die DATEI, nicht auf einen internen Fehler', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'urlaub-app.etappen',
      JSON.stringify([{ id: 'alt', name: 'Alter Eintrag' }]),
    )

    const bestaetigen = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const reload = ruesteReloadAus()

    render(<DataBackup />)
    await user.upload(
      dateiFeld(),
      new File(['{kein gueltiges json'], 'kaputt.json', { type: 'application/json' }),
    )

    // Die Unterscheidung ist der Punkt: eine kaputte Datei darf NICHT als
    // interner Fehler erscheinen. Die Abwesenheits-Pruefung steht vorn.
    expect(screen.queryByText(/Interner Fehler/)).toBeNull()
    expect(screen.getByText('Die ausgewählte Datei ist kein gültiges JSON.')).toBeTruthy()

    // Und es wird gar nicht erst gefragt oder geschrieben.
    expect(bestaetigen).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(gespeichert('urlaub-app.etappen')).toEqual([{ id: 'alt', name: 'Alter Eintrag' }])
  })

  it('Nutzerpfad: Datei mit falschem Aufbau -> eigene Meldung zum Format, kein Schreiben', async () => {
    const user = userEvent.setup()
    const reload = ruesteReloadAus()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<DataBackup />)
    await user.upload(
      dateiFeld(),
      new File([JSON.stringify({ app: 'urlaub-app' })], 'ohne-data.json', {
        type: 'application/json',
      }),
    )

    expect(screen.queryByText(/Interner Fehler/)).toBeNull()
    expect(screen.getByText('Die Backup-Datei hat kein gültiges Format.')).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
  })
})
