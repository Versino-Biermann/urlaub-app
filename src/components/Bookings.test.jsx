import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bookings from './Bookings'
import { dbAttrappeAufsetzen, geheimnisSetzenFuerTest } from '../test/dbAttrappe'

// Verhaltenstests fuer den Bereich "Buchungen".
//
// Wie bei den Etappen wird geprueft, was der Nutzer tut und danach sieht.
// Zusaetzlich zur Anlegen/Bearbeiten/Loeschen-Kette wird der Typwechsel
// geprueft: bei "Unterkunft" erwartet der Nutzer Check-in/Check-out statt
// eines einzelnen Datums.
//
// Datenquelle ist die Datenbank-Attrappe (src/test/dbAttrappe.js) - derselbe
// Weg wie in allen anderen Testdateien.

let db = null

function aufsetzen(bookings = [], etappen = []) {
  geheimnisSetzenFuerTest()
  db = dbAttrappeAufsetzen({ bookings, etappen })
  return db
}

function gespeicherteBuchungen() {
  return db.tabellen.bookings
}

afterEach(() => {
  if (db) db.wiederherstellen()
  db = null
})

describe('Buchungen anlegen', () => {
  it('Nutzerpfad: leere Liste -> Flug erfassen -> Buchung steht mit Typ-Kennzeichen in der Liste', async () => {
    aufsetzen([])
    const user = userEvent.setup()
    render(<Bookings />)

    expect(await screen.findByText('Noch keine Buchungen erfasst.')).toBeTruthy()

    await user.type(screen.getByLabelText('Titel'), 'Lufthansa LH123')
    await user.type(screen.getByLabelText('Datum'), '2026-08-15')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(await screen.findByText('Lufthansa LH123')).toBeTruthy()
    expect(screen.queryByText('Noch keine Buchungen erfasst.')).toBeNull()
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
    aufsetzen([])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Noch keine Buchungen erfasst.')

    // Vor dem Wechsel: ein einzelnes Datumsfeld.
    // Die Abwesenheits-Pruefung steht absichtlich VOR der Anwesenheits-Pruefung:
    // scheitert die vordere, bricht der Test ab und die hintere laeuft nie -
    // die Reihenfolge entscheidet also, welcher Befund berichtet wird.
    expect(screen.queryByLabelText('Check-in')).toBeNull()
    expect(screen.getByLabelText('Datum')).toBeTruthy()

    await user.selectOptions(screen.getByLabelText('Typ'), 'Unterkunft')

    // Nach dem Wechsel: zwei Felder, kein einzelnes Datum mehr
    expect(screen.queryByLabelText('Datum')).toBeNull()
    expect(screen.getByLabelText('Check-in')).toBeTruthy()
    expect(screen.getByLabelText('Check-out')).toBeTruthy()

    await user.type(screen.getByLabelText('Titel'), 'Hotel de la Paix')
    await user.type(screen.getByLabelText('Check-in'), '2026-08-15')
    await user.type(screen.getByLabelText('Check-out'), '2026-08-18')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(await screen.findByText('Hotel de la Paix')).toBeTruthy()
    expect(screen.getByText('Check-in: 15.08.2026')).toBeTruthy()
    expect(screen.getByText('Check-out: 18.08.2026')).toBeTruthy()

    const gespeichert = gespeicherteBuchungen()
    expect(gespeichert[0].typ).toBe('Unterkunft')
    expect(gespeichert[0].checkIn).toBe('2026-08-15')
    expect(gespeichert[0].checkOut).toBe('2026-08-18')
  })

  it('Nutzerpfad: Absenden ohne Titel legt nichts an', async () => {
    aufsetzen([])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Noch keine Buchungen erfasst.')

    await user.type(screen.getByLabelText('Notiz'), 'nur eine Notiz')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(screen.getByText('Noch keine Buchungen erfasst.')).toBeTruthy()
    expect(gespeicherteBuchungen()).toHaveLength(0)
  })

  it('Nutzerpfad: Buchung einer Etappe zuordnen -> Etappenname steht am Eintrag', async () => {
    aufsetzen([], [{ id: '7', name: 'Reims' }])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Noch keine Buchungen erfasst.')

    await user.type(screen.getByLabelText('Titel'), 'Hotel de la Paix')
    // Es gibt zwei Auswahlfelder mit der Beschriftung "Etappe": den Listen-Filter
    // (bietet "Alle Etappen" an) und das Zuordnungsfeld im Formular (bietet das
    // nicht an). Unterschieden wird ueber genau dieselbe sichtbare Eigenschaft,
    // die auch EtappeFilter.test.jsx verwendet - damit gibt es in der Testbasis
    // nur einen einzigen Begriff, der sich aendern kann, statt zweier.
    const zuordnung = screen
      .getAllByLabelText('Etappe')
      .find((el) => ![...el.options].some((o) => o.textContent === 'Alle Etappen'))
    // Ohne diese Schranke liefert .find() still undefined und der Test scheitert
    // erst weiter unten mit einer Meldung, die die Ursache nicht nennt.
    if (!zuordnung) {
      throw new Error(
        'Kein Etappen-Zuordnungsfeld im Formular gefunden (nur der Listen-Filter).',
      )
    }
    await user.selectOptions(zuordnung, '7')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    expect(await screen.findByText('Etappe: Reims')).toBeTruthy()
    expect(String(gespeicherteBuchungen()[0].etappeId)).toBe('7')
  })
})

describe('Buchungen bearbeiten', () => {
  it('Nutzerpfad: Bearbeiten -> Formular ist vorbelegt -> Titel aendern -> neuer Titel sichtbar', async () => {
    aufsetzen([
      {
        id: '1',
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
    await screen.findByText('Hotel de la Paix')

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    expect(screen.getByLabelText('Titel').value).toBe('Hotel de la Paix')
    expect(screen.getByLabelText('Typ').value).toBe('Unterkunft')
    expect(screen.getByLabelText('Check-in').value).toBe('2026-08-15')
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeTruthy()

    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Hotel Central')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    // Abwesenheit zuerst: bleibt der alte Titel stehen, ist genau das der
    // Befund, den der Testlauf melden soll.
    await waitFor(() => expect(screen.queryByText('Hotel de la Paix')).toBeNull())
    expect(screen.getByText('Hotel Central')).toBeTruthy()

    const gespeichert = gespeicherteBuchungen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].id).toBe('1')
    // Nicht angefasste Felder bleiben erhalten
    expect(gespeichert[0].checkOut).toBe('2026-08-18')
    expect(gespeichert[0].notiz).toBe('Fruehstueck inklusive')

    expect(screen.getByRole('button', { name: 'Buchung hinzufügen' })).toBeTruthy()
  })

  it('Nutzerpfad: Bearbeiten abbrechen laesst die Buchung unveraendert', async () => {
    aufsetzen([
      { id: '1', titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Hotel Central')

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Verworfen')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    // Abwesenheit zuerst: haette Abbrechen die Eingabe doch gespeichert, ist
    // das der Befund - nicht "Hotel Central fehlt".
    expect(screen.queryByText('Verworfen')).toBeNull()
    expect(screen.getByText('Hotel Central')).toBeTruthy()
    expect(gespeicherteBuchungen()[0].titel).toBe('Hotel Central')
    expect(screen.getByLabelText('Titel').value).toBe('')
  })
})

describe('Buchungen loeschen', () => {
  it('Nutzerpfad: Loeschen -> Rueckfrage bestaetigen -> Buchung ist weg', async () => {
    // window.confirm ist in jsdom nicht implementiert und wird ersetzt.
    // true = "der Nutzer klickt OK".
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    aufsetzen([
      { id: '1', titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Hotel Central')

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0]).toContain('Hotel Central')
    expect(await screen.findByText('Noch keine Buchungen erfasst.')).toBeTruthy()
    expect(gespeicherteBuchungen()).toEqual([])
  })

  it('Nutzerpfad: Loeschen -> Rueckfrage abbrechen -> Buchung bleibt', async () => {
    // false = "der Nutzer klickt Abbrechen".
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    aufsetzen([
      { id: '1', titel: 'Hotel Central', typ: 'Unterkunft', checkIn: '', checkOut: '', datum: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Hotel Central')

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(screen.getByText('Hotel Central')).toBeTruthy()
    expect(gespeicherteBuchungen()).toHaveLength(1)
  })

  it('Nutzerpfad: von zwei Buchungen wird nur die gewaehlte geloescht', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    aufsetzen([
      { id: '1', titel: 'Lufthansa LH123', typ: 'Flug', datum: '2026-08-15', checkIn: '', checkOut: '', notiz: '', link: '', etappeId: '' },
      { id: '2', titel: 'Mietwagen Ulm', typ: 'Mietwagen', datum: '2026-08-20', checkIn: '', checkOut: '', notiz: '', link: '', etappeId: '' },
    ])
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Lufthansa LH123')

    // Angezeigt wird chronologisch, der Flug (15.08.) steht also zuerst.
    const loeschKnoepfe = screen.getAllByRole('button', { name: 'Löschen' })
    await user.click(loeschKnoepfe[0])

    await waitFor(() => expect(screen.queryByText('Lufthansa LH123')).toBeNull())
    expect(screen.getByText('Mietwagen Ulm')).toBeTruthy()
    expect(gespeicherteBuchungen().map((b) => b.titel)).toEqual(['Mietwagen Ulm'])
  })
})

describe('Buchungen ohne Schreibgeheimnis', () => {
  it('Nutzerpfad: ohne Geheimnis speichern -> verstaendliche Meldung statt technischem Fehler', async () => {
    db = dbAttrappeAufsetzen({ bookings: [], etappen: [] })
    // Kein Geheimnis hinterlegt - genau der Zustand auf einem frischen Geraet.
    const user = userEvent.setup()
    render(<Bookings />)
    await screen.findByText('Noch keine Buchungen erfasst.')

    await user.type(screen.getByLabelText('Titel'), 'Lufthansa LH123')
    await user.click(screen.getByRole('button', { name: 'Buchung hinzufügen' }))

    const meldung = await screen.findByRole('alert')
    // Klartext, kein HTTP-Status und kein Code der Datenbank.
    expect(meldung.textContent).toContain('Schreibgeheimnis')
    expect(meldung.textContent).toContain('Schreibzugang')
    expect(meldung.textContent).not.toContain('401')
    expect(meldung.textContent).not.toContain('42501')

    // Und es wurde wirklich nichts angelegt.
    expect(gespeicherteBuchungen()).toHaveLength(0)
    expect(screen.getByText('Noch keine Buchungen erfasst.')).toBeTruthy()
  })
})
