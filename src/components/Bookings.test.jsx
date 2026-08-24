import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bookings from './Bookings'

// Verhaltenstests fuer den Bereich "Buchungen".
//
// Wie bei den Etappen wird gepruefte, was der Nutzer tut und danach sieht.
// Zusaetzlich zur Anlegen/Bearbeiten/Loeschen-Kette wird der Typwechsel
// geprueft: bei "Unterkunft" erwartet der Nutzer Check-in/Check-out statt
// eines einzelnen Datums.

const STORAGE_KEY = 'urlaub-app.bookings'
const ETAPPEN_KEY = 'urlaub-app.etappen'

function gespeicherteBuchungen() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
}

function seedBuchungen(liste) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(liste))
}

describe('Buchungen anlegen', () => {
  it('Nutzerpfad: leere Liste -> Flug erfassen -> Buchung steht mit Typ-Kennzeichen in der Liste', async () => {
    const user = userEvent.setup()
    render(<Bookings />)

    expect(screen.getByText('Noch keine Buchungen erfasst.')).toBeTruthy()

    await user.type(screen.getByLabelText('Titel'), 'Lufthansa LH123')
    await user.type(screen.getByLabelText('Datum'), '2026-08-15')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(screen.queryByText('Noch keine Buchungen erfasst.')).toBeNull()
    expect(screen.getByText('Lufthansa LH123')).toBeTruthy()
    // Typ wird als Kennzeichen am Eintrag angezeigt, Datum in TT.MM.JJJJ.
    // Gelesen wird der Eintrag selbst, nicht "irgendwo auf der Seite" - das
    // Wort "Flug" steht auch als Auswahlmoeglichkeit im Typ-Feld.
    expect(screen.getByRole('listitem').textContent).toContain('Flug')
    expect(screen.getByText('Datum: 15.08.2026')).toBeTruthy()

    expect(screen.getByLabelText('Titel').value).toBe('')

    const gespeichert = gespeicherteBuchungen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].titel).toBe('Lufthansa LH123')
    expect(gespeichert[0].typ).toBe('Flug')
    expect(gespeichert[0].datum).toBe('2026-08-15')
  })

  it('Nutzerpfad: Typ auf Unterkunft stellen -> Formular fragt Check-in und Check-out statt Datum', async () => {
    const user = userEvent.setup()
    render(<Bookings />)

    // Vor dem Wechsel: ein einzelnes Datumsfeld
    expect(screen.getByLabelText('Datum')).toBeTruthy()
    expect(screen.queryByLabelText('Check-in')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Typ'), 'Unterkunft')

    // Nach dem Wechsel: zwei Felder, kein einzelnes Datum mehr
    expect(screen.queryByLabelText('Datum')).toBeNull()
    expect(screen.getByLabelText('Check-in')).toBeTruthy()
    expect(screen.getByLabelText('Check-out')).toBeTruthy()

    await user.type(screen.getByLabelText('Titel'), 'Hotel de la Paix')
    await user.type(screen.getByLabelText('Check-in'), '2026-08-15')
    await user.type(screen.getByLabelText('Check-out'), '2026-08-18')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(screen.getByText('Hotel de la Paix')).toBeTruthy()
    expect(screen.getByText('Check-in: 15.08.2026')).toBeTruthy()
    expect(screen.getByText('Check-out: 18.08.2026')).toBeTruthy()

    const gespeichert = gespeicherteBuchungen()
    expect(gespeichert[0].typ).toBe('Unterkunft')
    expect(gespeichert[0].checkIn).toBe('2026-08-15')
    expect(gespeichert[0].checkOut).toBe('2026-08-18')
  })

  it('Nutzerpfad: Absenden ohne Titel legt nichts an', async () => {
    const user = userEvent.setup()
    render(<Bookings />)

    await user.type(screen.getByLabelText('Notiz'), 'nur eine Notiz')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(screen.getByText('Noch keine Buchungen erfasst.')).toBeTruthy()
    expect(gespeicherteBuchungen()).toHaveLength(0)
  })

  it('Nutzerpfad: Buchung einer Etappe zuordnen -> Etappenname steht am Eintrag', async () => {
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 7, name: 'Reims' }]),
    )
    const user = userEvent.setup()
    render(<Bookings />)

    await user.type(screen.getByLabelText('Titel'), 'Hotel de la Paix')
    // Das Zuordnungs-Auswahlfeld im Formular ist das, das "— keine —" anbietet;
    // der Listen-Filter darueber bietet stattdessen "Alle Etappen".
    const zuordnung = screen
      .getAllByLabelText('Etappe')
      .find((el) => [...el.options].some((o) => o.textContent === '— keine —'))
    await user.selectOptions(zuordnung, '7')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(screen.getByText('Etappe: Reims')).toBeTruthy()
    expect(String(gespeicherteBuchungen()[0].etappeId)).toBe('7')
  })
})

describe('Buchungen bearbeiten', () => {
  it('Nutzerpfad: Bearbeiten -> Formular ist vorbelegt -> Titel aendern -> neuer Titel sichtbar', async () => {
    seedBuchungen([
      {
        id: 1,
        titel: 'Hotel de la Paix',
        typ: 'Unterkunft',
        datum: '',
        checkIn: '2026-08-15',
        checkOut: '2026-08-18',
        notiz: 'Fruehstueck inklusive',
        link: '',
        etappeId: '',
      },
    ])
    const user = userEvent.setup()
    render(<Bookings />)

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    expect(screen.getByLabelText('Titel').value).toBe('Hotel de la Paix')
    expect(screen.getByLabelText('Typ').value).toBe('Unterkunft')
    expect(screen.getByLabelText('Check-in').value).toBe('2026-08-15')
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeTruthy()

    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Hotel Central')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    expect(screen.getByText('Hotel Central')).toBeTruthy()
    expect(screen.queryByText('Hotel de la Paix')).toBeNull()

    const gespeichert = gespeicherteBuchungen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].id).toBe(1)
    // Nicht angefasste Felder bleiben erhalten
    expect(gespeichert[0].checkOut).toBe('2026-08-18')
    expect(gespeichert[0].notiz).toBe('Fruehstueck inklusive')

    expect(screen.getByRole('button', { name: 'Buchung hinzufügen' })).toBeTruthy()
  })

  it('Nutzerpfad: Bearbeiten abbrechen laesst die Buchung unveraendert', async () => {
    seedBuchungen([
      { id: 1, titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Verworfen')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.getByText('Hotel Central')).toBeTruthy()
    expect(screen.queryByText('Verworfen')).toBeNull()
    expect(gespeicherteBuchungen()[0].titel).toBe('Hotel Central')
    expect(screen.getByLabelText('Titel').value).toBe('')
  })
})

describe('Buchungen loeschen', () => {
  it('Nutzerpfad: Loeschen -> Rueckfrage bestaetigen -> Buchung ist weg', async () => {
    // window.confirm ist in jsdom nicht implementiert und wird ersetzt.
    // true = "der Nutzer klickt OK".
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    seedBuchungen([
      { id: 1, titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0]).toContain('Hotel Central')
    expect(screen.getByText('Noch keine Buchungen erfasst.')).toBeTruthy()
    expect(gespeicherteBuchungen()).toEqual([])
  })

  it('Nutzerpfad: Loeschen -> Rueckfrage abbrechen -> Buchung bleibt', async () => {
    // false = "der Nutzer klickt Abbrechen".
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    seedBuchungen([
      { id: 1, titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(screen.getByText('Hotel Central')).toBeTruthy()
    expect(gespeicherteBuchungen()).toHaveLength(1)
  })

  it('Nutzerpfad: von zwei Buchungen wird nur die gewaehlte geloescht', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    seedBuchungen([
      { id: 1, titel: 'Lufthansa LH123', typ: 'Flug', datum: '2026-08-15', checkIn: '', checkOut: '', notiz: '', link: '', etappeId: '' },
      { id: 2, titel: 'Mietwagen Ulm', typ: 'Mietwagen', datum: '2026-08-20', checkIn: '', checkOut: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)

    // Angezeigt wird chronologisch, der Flug (15.08.) steht also zuerst.
    const loeschKnoepfe = screen.getAllByRole('button', { name: 'Löschen' })
    await user.click(loeschKnoepfe[0])

    expect(screen.queryByText('Lufthansa LH123')).toBeNull()
    expect(screen.getByText('Mietwagen Ulm')).toBeTruthy()
    expect(gespeicherteBuchungen().map((b) => b.titel)).toEqual(['Mietwagen Ulm'])
  })
})
