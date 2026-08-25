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

afterEach(() => {
  URL.createObjectURL = urspruenglich.createObjectURL
  URL.revokeObjectURL = urspruenglich.revokeObjectURL
})

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
