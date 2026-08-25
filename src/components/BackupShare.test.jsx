import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BackupShare from './BackupShare'

// Verhaltenstests fuer den zweiten Sicherungsweg (Teilen + Text-Rueckfall).
//
// Gepruefte Leitplanke ueber alle Tests: der Weg darf NIE stillschweigend
// scheitern. Zu jedem Ausgang gehoert deshalb eine Pruefung, dass der Nutzer
// danach etwas Sichtbares mit Grund vor sich hat - nicht nur, dass die
// richtige Funktion aufgerufen wurde.

const ETAPPEN_KEY = 'urlaub-app.etappen'
const EVENTS_KEY = 'urlaub-app.events'

function seedEtappen(liste) {
  window.localStorage.setItem(ETAPPEN_KEY, JSON.stringify(liste))
}

const gesetzteEigenschaften = new Set()

/** navigator-Eigenschaft setzen, die es in jsdom nicht von Haus aus gibt. */
function ruesteNavigator(name, wert) {
  gesetzteEigenschaften.add(name)
  Object.defineProperty(window.navigator, name, {
    value: wert,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  for (const name of gesetzteEigenschaften) {
    delete window.navigator[name]
  }
  gesetzteEigenschaften.clear()
})

/** Textfeld des Rueckfalls, oder null wenn es (noch) nicht da ist. */
function textfeld() {
  return screen.queryByLabelText('Backup als Text')
}

function gelesenesBackup() {
  return JSON.parse(textfeld().value)
}

describe('Stufe 1: Backup teilen', () => {
  it('Nutzerpfad: Browser kann Dateien teilen -> "Backup teilen" -> Backup geht als Datei an die Teilen-Auswahl', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Reims' }])

    const share = vi.fn(() => Promise.resolve())
    ruesteNavigator('share', share)
    ruesteNavigator('canShare', vi.fn(() => true))

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))

    expect(share).toHaveBeenCalledTimes(1)
    const nutzlast = share.mock.calls[0][0]
    expect(nutzlast.files).toHaveLength(1)

    const datei = nutzlast.files[0]
    // Chromium laesst beim Teilen nur Endungen und MIME-Typen aus einer festen
    // Positivliste durch; weder ".json" noch "application/json" stehen darin.
    // Diese beiden Zusicherungen sind der Grund, warum der Weg auf dem Handy
    // ueberhaupt ankommt - sie sind kein Formalkram.
    expect(datei.name.endsWith('.txt')).toBe(true)
    expect(datei.type).toBe('text/plain')
    expect(await datei.text()).toContain('"urlaub-app"')

    expect(
      await screen.findByText('Backup wurde an die ausgewählte App übergeben.'),
    ).toBeTruthy()
  })

  it('Nutzerpfad: Browser kennt Teilen gar nicht -> "Backup teilen" -> Grund wird genannt und der Text-Rueckfall steht bereit', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Rouen' }])
    // navigator.share bleibt bewusst ungesetzt - das ist der Desktop-Fall.

    render(<BackupShare />)

    // Vor dem Klick gibt es kein Textfeld. Diese Abwesenheits-Pruefung steht
    // vorn, damit sie ueberhaupt ausgefuehrt wird.
    expect(textfeld()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))

    expect(
      screen.getByText(
        'Dieser Browser kann nicht teilen. Der Backup-Text steht unten zum Kopieren bereit.',
      ),
    ).toBeTruthy()
    // Entscheidend: der Rueckfall ist ohne zweiten Klick da und enthaelt die Daten.
    expect(textfeld()).not.toBeNull()
    expect(gelesenesBackup().data.etappen[0].name).toBe('Rouen')
  })

  it('Nutzerpfad: Browser teilt zwar, aber keine Dateien -> "Backup teilen" -> share wird nicht aufgerufen, Rueckfall erscheint', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Honfleur' }])

    const share = vi.fn(() => Promise.resolve())
    ruesteNavigator('share', share)
    ruesteNavigator('canShare', vi.fn(() => false))

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))

    // Erst die Abwesenheit: ein Aufruf trotz canShare=false waere ein echter Defekt.
    expect(share).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'Dieser Browser kann keine Dateien teilen. Der Backup-Text steht unten zum Kopieren bereit.',
      ),
    ).toBeTruthy()
    expect(textfeld()).not.toBeNull()
  })

  it('Nutzerpfad: Nutzer bricht die Teilen-Auswahl ab -> Hinweis auf den Abbruch, kein Fehlalarm, Rueckfall bleibt nutzbar', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Rennes' }])

    const abbruch = Object.assign(new Error('abgebrochen'), { name: 'AbortError' })
    ruesteNavigator('share', vi.fn(() => Promise.reject(abbruch)))
    ruesteNavigator('canShare', vi.fn(() => true))

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))

    expect(
      await screen.findByText(
        'Teilen abgebrochen. Der Backup-Text steht unten zum Kopieren bereit.',
      ),
    ).toBeTruthy()
    expect(textfeld()).not.toBeNull()
  })

  it('Nutzerpfad: Teilen wird vom Browser abgelehnt -> Fehlermeldung nennt den Grund beim Namen', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Saint-Malo' }])

    const abgelehnt = Object.assign(new Error('nope'), { name: 'NotAllowedError' })
    ruesteNavigator('share', vi.fn(() => Promise.reject(abgelehnt)))
    ruesteNavigator('canShare', vi.fn(() => true))

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))

    expect(
      await screen.findByText(
        'Teilen fehlgeschlagen (NotAllowedError). Der Backup-Text steht unten zum Kopieren bereit.',
      ),
    ).toBeTruthy()
    expect(textfeld()).not.toBeNull()
  })
})

describe('Stufe 2: Backup als Text anzeigen und kopieren', () => {
  it('Nutzerpfad: ohne jede Teilen-Funktion -> "Backup als Text anzeigen" -> vollstaendiges Backup im auswaehlbaren Textfeld', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Ploubazlanec' }])

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))

    const feld = textfeld()
    expect(feld).not.toBeNull()
    // Echtes Textfeld, nicht nur Anzeige: der Nutzer muss markieren koennen.
    expect(feld.tagName).toBe('TEXTAREA')

    const backup = JSON.parse(feld.value)
    // Format muss dem Download-Export entsprechen, sonst laesst es sich nicht
    // ueber den bestehenden Import-Weg zurueckspielen.
    expect(backup.app).toBe('urlaub-app')
    expect(backup.version).toBe(1)
    expect(typeof backup.exportedAt).toBe('string')
    expect(Object.keys(backup.data).sort()).toEqual(
      ['bookings', 'etappen', 'events', 'restaurants', 'route', 'sightseeing'].sort(),
    )
    expect(backup.data.etappen[0].name).toBe('Ploubazlanec')
  })

  it('Nutzerpfad: Text anzeigen -> kopieren -> genau der angezeigte Text landet in der Zwischenablage', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Troyes' }])

    const writeText = vi.fn(() => Promise.resolve())
    ruesteNavigator('clipboard', { writeText })

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))
    const angezeigt = textfeld().value

    await user.click(
      screen.getByRole('button', { name: 'Text in die Zwischenablage kopieren' }),
    )

    expect(writeText).toHaveBeenCalledWith(angezeigt)
    expect(await screen.findByText('Backup in die Zwischenablage kopiert.')).toBeTruthy()
  })

  it('Nutzerpfad: Zwischenablage gesperrt -> Kopieren meldet den Fehlschlag UND der Text ist markiert', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Ulm' }])

    const verweigert = Object.assign(new Error('blockiert'), { name: 'NotAllowedError' })
    ruesteNavigator('clipboard', { writeText: vi.fn(() => Promise.reject(verweigert)) })

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))
    await user.click(
      screen.getByRole('button', { name: 'Text in die Zwischenablage kopieren' }),
    )

    expect(
      await screen.findByText(
        'Kopieren fehlgeschlagen (NotAllowedError). Der Text ist markiert – bitte von Hand kopieren.',
      ),
    ).toBeTruthy()

    // Der versprochene Rueckfall des Rueckfalls: von Hand uebernehmbar.
    const feld = textfeld()
    expect(feld.value.length).toBeGreaterThan(0)
    expect(feld.selectionStart).toBe(0)
    expect(feld.selectionEnd).toBe(feld.value.length)
  })

  it('Nutzerpfad: Browser ohne Zwischenablage-Zugriff -> Kopieren nennt den Grund und markiert den Text', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Reims' }])
    // Ausdruecklich abschalten, NACH userEvent.setup(): user-event haengt sich
    // eine eigene Zwischenablage an den navigator. Ohne diese Zeile testet der
    // Test die Attrappe von user-event statt den Browser-ohne-Clipboard-Fall -
    // gemessen, nicht vermutet: der Test lief damit ins Leere.
    ruesteNavigator('clipboard', undefined)

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))
    await user.click(
      screen.getByRole('button', { name: 'Text in die Zwischenablage kopieren' }),
    )

    expect(
      screen.getByText(
        'Dieser Browser gibt keinen Zugriff auf die Zwischenablage. Der Text ist markiert – bitte von Hand kopieren.',
      ),
    ).toBeTruthy()
    const feld = textfeld()
    expect(feld.value.length).toBeGreaterThan(0)
    expect(feld.selectionEnd).toBe(feld.value.length)
  })
})

describe('Sicherungsweg meldet unlesbare Bereiche', () => {
  it('Nutzerpfad: ein Speicher-Schluessel ist beschaedigt -> Backup entsteht trotzdem, aber der leere Bereich wird benannt', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Reims' }])
    // Genau der Fall, den der Download-Export still zu einer leeren Liste macht.
    window.localStorage.setItem(EVENTS_KEY, '{kein gueltiges json')

    render(<BackupShare />)

    // Vor dem Klick darf keine Warnung stehen - sonst wuerde der Test auch bei
    // einer Dauerwarnung gruen bleiben.
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))

    const warnung = screen.getByRole('alert').textContent
    expect(warnung).toContain('1 von 6 Bereichen')
    expect(warnung).toContain('Events')
    expect(warnung).toContain('kein gültiges JSON')

    // Das Backup selbst entsteht weiter - ein halbes Backup ist besser als keins.
    const backup = gelesenesBackup()
    expect(backup.data.etappen[0].name).toBe('Reims')
    expect(backup.data.events).toEqual([])
  })

  it('Nutzerpfad: alle Bereiche lesbar -> kein Alarm, der Nutzer wird nicht grundlos beunruhigt', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Reims' }])

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(gelesenesBackup().data.etappen).toHaveLength(1)
  })
})

describe('Sicherungsweg veraendert den Speicher nicht', () => {
  it('Nutzerpfad: teilen, anzeigen und kopieren nacheinander -> kein einziger Schreibzugriff auf den Speicher', async () => {
    const user = userEvent.setup()
    seedEtappen([{ id: 'e1', name: 'Reims' }])

    ruesteNavigator('share', vi.fn(() => Promise.resolve()))
    ruesteNavigator('canShare', vi.fn(() => true))
    ruesteNavigator('clipboard', { writeText: vi.fn(() => Promise.resolve()) })

    // Attrappen an Storage.prototype, nicht an window.localStorage: jsdom
    // liefert dort einen Proxy, an dem ein Spy nie anschlaegt.
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    const clear = vi.spyOn(Storage.prototype, 'clear')

    render(<BackupShare />)
    await user.click(screen.getByRole('button', { name: 'Backup teilen' }))
    await user.click(screen.getByRole('button', { name: 'Backup als Text anzeigen' }))
    await user.click(
      screen.getByRole('button', { name: 'Text in die Zwischenablage kopieren' }),
    )
    await screen.findByText('Backup in die Zwischenablage kopiert.')

    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()

    // Gegenprobe, dass die Attrappe ueberhaupt anschlaegt - sonst waere die
    // Pruefung oben wertlos.
    window.localStorage.setItem('probe', '1')
    expect(setItem).toHaveBeenCalledTimes(1)
  })
})
