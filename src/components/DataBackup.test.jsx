import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataBackup from './DataBackup'
import { kopieSetzen } from '../test/dbAttrappe'

// Verhaltenstests fuer den Sicherungs-Export.
//
// jsdom kennt keine Blob-Adressen. Statt den Export zu umgehen, wird
// URL.createObjectURL ersetzt und der uebergebene Blob festgehalten - so
// prueft der Test den Inhalt, den der Nutzer bekommen haette, statt nur die
// Tatsache eines Aufrufs.

let letzterBlob = null
let klicks = 0

function exportPfadAufsetzen() {
  letzterBlob = null
  klicks = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    letzterBlob = blob
    return 'blob:test'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    klicks += 1
  })
}

async function backupInhalt() {
  expect(letzterBlob).toBeTruthy()
  return JSON.parse(await letzterBlob.text())
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Backup exportieren', () => {
  it('Nutzerpfad: Export liefert genau die Daten, die die App anzeigt', async () => {
    exportPfadAufsetzen()
    // So sieht der Stand aus, nachdem die App die Bereiche geladen hat.
    kopieSetzen('etappen', [{ id: '1', name: 'Reims' }])
    kopieSetzen('bookings', [{ id: '11', titel: 'Hotel Reims', etappeId: '1' }])
    kopieSetzen('route', [{ id: '21', von: 'Ulm', nach: 'Reims' }])
    kopieSetzen('sightseeing', [{ id: '31', titel: 'Kathedrale' }])
    kopieSetzen('events', [{ id: '41', titel: 'Weinprobe' }])
    kopieSetzen('restaurants', [{ id: '51', name: 'Boulingrin' }])

    const user = userEvent.setup()
    render(<DataBackup />)
    await user.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    expect(klicks).toBe(1)
    const backup = await backupInhalt()
    expect(backup.app).toBe('urlaub-app')
    expect(backup.data.etappen[0].name).toBe('Reims')
    expect(backup.data.bookings[0].titel).toBe('Hotel Reims')
    expect(backup.data.route[0].nach).toBe('Reims')
    expect(backup.data.sightseeing[0].titel).toBe('Kathedrale')
    expect(backup.data.events[0].titel).toBe('Weinprobe')
    expect(backup.data.restaurants[0].name).toBe('Boulingrin')

    // Bei vollstaendigem Stand darf keine Warnung erscheinen.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Nutzerpfad: fehlt ein Bereich, sagt die App das - der Export laeuft trotzdem', async () => {
    exportPfadAufsetzen()
    // Nur ein Bereich wurde je geladen. Die uebrigen fuenf fehlen.
    kopieSetzen('etappen', [{ id: '1', name: 'Reims' }])

    const user = userEvent.setup()
    render(<DataBackup />)
    await user.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    const warnung = await screen.findByRole('alert')
    expect(warnung.textContent).toContain('5 von 6')
    expect(warnung.textContent).toContain('restaurants')

    // Der Export darf durch die Warnung nicht blockiert werden.
    expect(klicks).toBe(1)
    const backup = await backupInhalt()
    expect(backup.data.etappen).toHaveLength(1)
    expect(backup.data.restaurants).toEqual([])
  })

  it('Nutzerpfad: der Wiederherstellungs-Knopf ist verschwunden', () => {
    exportPfadAufsetzen()
    render(<DataBackup />)

    // Die Datenbank ist die Wahrheit - ein Import waere ein stiller Rueckschritt.
    expect(screen.queryByText('Backup importieren')).toBeNull()
    expect(screen.getByRole('button', { name: 'Backup exportieren' })).toBeTruthy()
  })
})
