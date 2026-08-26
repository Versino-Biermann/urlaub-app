import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Etappen from './Etappen'
import { dbAttrappeAufsetzen, geheimnisSetzenFuerTest } from '../test/dbAttrappe'

// Verhaltenstests fuer den Bereich "Etappen".
//
// Geprueft wird, was der Nutzer tut und was er danach sieht: Formular
// ausfuellen, Knopf druecken, Liste lesen. Es wird kein Elementbaum und kein
// Markup-Snapshot geprueft. Zusaetzlich wird der Datenbank-Inhalt gelesen,
// weil "die Eingabe ist nach einem Neuladen noch da" fuer diese App ein
// nutzersichtbares Versprechen ist - seit dem Umbau steht dieser Inhalt in der
// Datenbank, nicht mehr im Browserspeicher.
//
// Die Datenbank wird ueber eine fetch-Attrappe nachgebildet (src/test/
// dbAttrappe.js). Damit laeuft die echte Datenschicht mit.
//
// Eingaben laufen ueber userEvent, nicht ueber fireEvent: userEvent erzeugt
// die vollstaendige Ereigniskette eines echten Browsers.

let db = null

function aufsetzen(etappen = [], neben = {}) {
  geheimnisSetzenFuerTest()
  db = dbAttrappeAufsetzen({
    etappen,
    bookings: [],
    route: [],
    sightseeing: [],
    events: [],
    restaurants: [],
    ...neben,
  })
  return db
}

function gespeicherteEtappen() {
  return db.tabellen.etappen
}

afterEach(() => {
  if (db) db.wiederherstellen()
  db = null
})

describe('Etappen anlegen', () => {
  it('Nutzerpfad: leere Liste -> Formular ausfuellen -> Etappe steht in der Liste', async () => {
    aufsetzen([])
    const user = userEvent.setup()
    render(<Etappen />)

    // Ausgangslage, die der Nutzer sieht - erst nach dem Laden.
    expect(await screen.findByText('Noch keine Etappen erfasst.')).toBeTruthy()

    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims')
    await user.type(screen.getByLabelText('Von'), '2026-08-15')
    await user.type(screen.getByLabelText('Bis'), '2026-08-18')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    // Was der Nutzer danach sieht
    expect(await screen.findByText('Reims')).toBeTruthy()
    expect(screen.queryByText('Noch keine Etappen erfasst.')).toBeNull()
    // Anzeige in TT.MM.JJJJ - gespeichert wird ISO (siehe format.js)
    expect(screen.getByText('15.08.2026 – 18.08.2026')).toBeTruthy()

    // Formular ist geleert, der Nutzer kann direkt die naechste Etappe erfassen
    expect(screen.getByLabelText('Stadt/Abschnitt').value).toBe('')

    // Versprechen "bleibt nach Neuladen erhalten": Wert liegt in der Datenbank
    const gespeichert = gespeicherteEtappen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].name).toBe('Reims')
    expect(gespeichert[0].vonDatum).toBe('2026-08-15')
    expect(gespeichert[0].bisDatum).toBe('2026-08-18')
    // Die Kennung wird von der App erzeugt und ist eine Zeichenkette.
    expect(typeof gespeichert[0].id).toBe('string')
  })

  it('Nutzerpfad: Absenden ohne Namen legt nichts an', async () => {
    aufsetzen([])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Noch keine Etappen erfasst.')

    await user.type(screen.getByLabelText('Notiz'), 'nur eine Notiz, kein Name')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    expect(screen.getByText('Noch keine Etappen erfasst.')).toBeTruthy()
    expect(gespeicherteEtappen()).toHaveLength(0)
  })

  it('Nutzerpfad: zwei Etappen anlegen -> Anzeige chronologisch, nicht in Eingabereihenfolge', async () => {
    aufsetzen([])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Noch keine Etappen erfasst.')

    // Absichtlich die spaetere Etappe zuerst eingeben
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Troyes')
    await user.type(screen.getByLabelText('Von'), '2026-09-05')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))
    await screen.findByText('Troyes')

    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims')
    await user.type(screen.getByLabelText('Von'), '2026-08-15')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))
    await screen.findByText('Reims')

    const eintraege = screen.getAllByRole('listitem').map((li) => li.textContent)
    const indexReims = eintraege.findIndex((t) => t.includes('Reims'))
    const indexTroyes = eintraege.findIndex((t) => t.includes('Troyes'))
    expect(indexReims).toBeGreaterThanOrEqual(0)
    expect(indexReims).toBeLessThan(indexTroyes)

    // Die Speicher-Reihenfolge bleibt die Anlege-Reihenfolge - sortiert wird
    // nur die Anzeige (siehe Kommentar in Etappen.jsx).
    expect(gespeicherteEtappen().map((e) => e.name)).toEqual(['Troyes', 'Reims'])
  })
})

describe('Etappen bearbeiten', () => {
  it('Nutzerpfad: Bearbeiten -> Formular ist vorbelegt -> Name aendern -> neuer Name sichtbar', async () => {
    aufsetzen([
      { id: '1', name: 'Reims', vonDatum: '2026-08-15', bisDatum: '', notiz: '', link: '' },
    ])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Reims')

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    // Der Nutzer erwartet seine Werte im Formular wiederzufinden
    expect(screen.getByLabelText('Stadt/Abschnitt').value).toBe('Reims')
    expect(screen.getByLabelText('Von').value).toBe('2026-08-15')
    // Der Absende-Knopf wechselt die Bedeutung
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeTruthy()

    await user.clear(screen.getByLabelText('Stadt/Abschnitt'))
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims Zentrum')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    // Abwesenheit zuerst: bleibt der alte Name stehen, ist genau das der
    // Befund, den der Testlauf melden soll - nicht "Reims Zentrum fehlt".
    await waitFor(() => expect(screen.queryByText('Reims')).toBeNull())
    expect(screen.getByText('Reims Zentrum')).toBeTruthy()

    // Bearbeiten darf keinen zweiten Eintrag erzeugen
    const gespeichert = gespeicherteEtappen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].id).toBe('1')
    expect(gespeichert[0].name).toBe('Reims Zentrum')
    // Nicht angefasste Felder bleiben erhalten
    expect(gespeichert[0].vonDatum).toBe('2026-08-15')

    // Nach dem Speichern ist der Bearbeiten-Modus beendet.
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Etappe hinzufügen' })).toBeTruthy()
  })

  it('Nutzerpfad: Bearbeiten abbrechen laesst den Eintrag unveraendert', async () => {
    aufsetzen([{ id: '1', name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Reims')

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.clear(screen.getByLabelText('Stadt/Abschnitt'))
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Verworfen')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    // Abwesenheit zuerst: haette Abbrechen die Eingabe doch gespeichert, ist
    // das der Befund - nicht "Reims fehlt".
    expect(screen.queryByText('Verworfen')).toBeNull()
    expect(screen.getByText('Reims')).toBeTruthy()
    expect(gespeicherteEtappen()[0].name).toBe('Reims')
    // Formular ist wieder leer und im Anlege-Modus
    expect(screen.getByLabelText('Stadt/Abschnitt').value).toBe('')
    expect(screen.getByRole('button', { name: 'Etappe hinzufügen' })).toBeTruthy()
  })
})

describe('Etappen loeschen', () => {
  it('Nutzerpfad: Loeschen -> Rueckfrage bestaetigen -> Etappe ist weg', async () => {
    // window.confirm ist in jsdom nicht implementiert und wird hier ersetzt.
    // Rueckgabe true = "der Nutzer klickt OK".
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    aufsetzen([{ id: '1', name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Reims')

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // Die Rueckfrage nennt die betroffene Etappe
    expect(confirmSpy.mock.calls[0][0]).toContain('Reims')

    await waitFor(() => expect(screen.queryByText('Reims')).toBeNull())
    expect(screen.getByText('Noch keine Etappen erfasst.')).toBeTruthy()
    expect(gespeicherteEtappen()).toEqual([])
  })

  it('Nutzerpfad: Loeschen -> Rueckfrage abbrechen -> Etappe bleibt', async () => {
    // Rueckgabe false = "der Nutzer klickt Abbrechen".
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    aufsetzen([{ id: '1', name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Reims')

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Reims')).toBeTruthy()
    expect(gespeicherteEtappen()).toHaveLength(1)
  })

  it('Nutzerpfad: von zwei Etappen wird nur die gewaehlte geloescht', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    aufsetzen([
      { id: '1', name: 'Reims', vonDatum: '2026-08-15', bisDatum: '', notiz: '', link: '' },
      { id: '2', name: 'Troyes', vonDatum: '2026-09-05', bisDatum: '', notiz: '', link: '' },
    ])
    const user = userEvent.setup()
    render(<Etappen />)
    await screen.findByText('Reims')

    // Die Loeschen-Knoepfe stehen in derselben Reihenfolge wie die Eintraege.
    // Reims ist chronologisch zuerst, also der erste Knopf.
    const loeschKnoepfe = screen.getAllByRole('button', { name: 'Löschen' })
    await user.click(loeschKnoepfe[0])

    await waitFor(() => expect(screen.queryByText('Reims')).toBeNull())
    expect(screen.getByText('Troyes')).toBeTruthy()
    expect(gespeicherteEtappen().map((e) => e.name)).toEqual(['Troyes'])
  })
})

describe('Etappen verknuepfen die anderen Listen ueber etappeId', () => {
  it('Nutzerpfad: Uebersicht einer Etappe zeigt die zugeordneten Eintraege aller fuenf Bereiche', async () => {
    aufsetzen(
      [{ id: '1', name: 'Reims', vonDatum: '2026-08-29', bisDatum: '', notiz: '', link: '' }],
      {
        bookings: [{ id: '11', titel: 'Hotel Reims', typ: 'Unterkunft', etappeId: '1' }],
        route: [{ id: '21', von: 'Ulm', nach: 'Reims', etappeId: '1' }],
        sightseeing: [{ id: '31', titel: 'Kathedrale', etappeId: '1' }],
        events: [{ id: '41', titel: 'Weinprobe', etappeId: '1' }],
        restaurants: [{ id: '51', name: 'Boulingrin', etappeId: '1' }],
      },
    )
    render(<Etappen />)

    const eintrag = await screen.findByRole('listitem')
    // Alle fuenf Nebenlisten haengen an derselben Etappe und muessen dort auftauchen.
    expect(eintrag.textContent).toContain('Hotel Reims')
    expect(eintrag.textContent).toContain('Ulm → Reims')
    expect(eintrag.textContent).toContain('Kathedrale')
    expect(eintrag.textContent).toContain('Weinprobe')
    expect(eintrag.textContent).toContain('Boulingrin')
    // Abwesenheit: "keine" darf gerade NICHT dastehen.
    expect(screen.queryByText('keine')).toBeNull()
  })

  it('Nutzerpfad: eine Etappe ohne Zuordnungen zeigt ausdruecklich "keine"', async () => {
    aufsetzen(
      [{ id: '1', name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }],
      {
        // Der Eintrag haengt an einer ANDEREN Etappe und darf hier nicht auftauchen.
        bookings: [{ id: '11', titel: 'Hotel Troyes', typ: 'Unterkunft', etappeId: '2' }],
      },
    )
    render(<Etappen />)

    await screen.findByText('Reims')
    expect(screen.queryByText(/Hotel Troyes/)).toBeNull()
    expect(await screen.findByText('keine')).toBeTruthy()
  })
})
