import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Etappen from './Etappen'

// Verhaltenstests fuer den Bereich "Etappen".
//
// Geprueft wird, was der Nutzer tut und was er danach sieht: Formular
// ausfuellen, Knopf druecken, Liste lesen. Es wird kein Elementbaum und kein
// Markup-Snapshot geprueft. Zusaetzlich wird der Browser-Speicher gelesen,
// weil "die Eingabe ist nach einem Neuladen noch da" fuer diese App ein
// nutzersichtbares Versprechen ist.
//
// Eingaben laufen ueber userEvent, nicht ueber fireEvent: userEvent erzeugt
// die vollstaendige Ereigniskette eines echten Browsers (pointerdown, focus,
// keydown, input, ...) statt eines einzelnen synthetischen Events.

const STORAGE_KEY = 'urlaub-app.etappen'

function gespeicherteEtappen() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
}

function seedEtappen(liste) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(liste))
}

describe('Etappen anlegen', () => {
  it('Nutzerpfad: leere Liste -> Formular ausfuellen -> Etappe steht in der Liste', async () => {
    const user = userEvent.setup()
    render(<Etappen />)

    // Ausgangslage, die der Nutzer sieht
    expect(screen.getByText('Noch keine Etappen erfasst.')).toBeTruthy()

    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims')
    await user.type(screen.getByLabelText('Von'), '2026-08-15')
    await user.type(screen.getByLabelText('Bis'), '2026-08-18')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    // Was der Nutzer danach sieht
    expect(screen.queryByText('Noch keine Etappen erfasst.')).toBeNull()
    expect(screen.getByText('Reims')).toBeTruthy()
    // Anzeige in TT.MM.JJJJ - gespeichert wird ISO (siehe format.js)
    expect(screen.getByText('15.08.2026 – 18.08.2026')).toBeTruthy()

    // Formular ist geleert, der Nutzer kann direkt die naechste Etappe erfassen
    expect(screen.getByLabelText('Stadt/Abschnitt').value).toBe('')

    // Versprechen "bleibt nach Neuladen erhalten": Wert liegt im Browser-Speicher
    const gespeichert = gespeicherteEtappen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].name).toBe('Reims')
    expect(gespeichert[0].vonDatum).toBe('2026-08-15')
    expect(gespeichert[0].bisDatum).toBe('2026-08-18')
  })

  it('Nutzerpfad: Absenden ohne Namen legt nichts an', async () => {
    const user = userEvent.setup()
    render(<Etappen />)

    await user.type(screen.getByLabelText('Notiz'), 'nur eine Notiz, kein Name')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    expect(screen.getByText('Noch keine Etappen erfasst.')).toBeTruthy()
    expect(gespeicherteEtappen()).toHaveLength(0)
  })

  it('Nutzerpfad: zwei Etappen anlegen -> Anzeige chronologisch, nicht in Eingabereihenfolge', async () => {
    const user = userEvent.setup()
    render(<Etappen />)

    // Absichtlich die spaetere Etappe zuerst eingeben
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Troyes')
    await user.type(screen.getByLabelText('Von'), '2026-09-05')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims')
    await user.type(screen.getByLabelText('Von'), '2026-08-15')
    await user.click(screen.getByRole('button', { name: 'Etappe hinzufügen' }))

    const eintraege = screen.getAllByRole('listitem').map((li) => li.textContent)
    const indexReims = eintraege.findIndex((t) => t.includes('Reims'))
    const indexTroyes = eintraege.findIndex((t) => t.includes('Troyes'))
    expect(indexReims).toBeGreaterThanOrEqual(0)
    expect(indexReims).toBeLessThan(indexTroyes)

    // Die Speicher-Reihenfolge bleibt die Eingabereihenfolge - sortiert wird
    // nur die Anzeige (siehe Kommentar in Etappen.jsx).
    expect(gespeicherteEtappen().map((e) => e.name)).toEqual(['Troyes', 'Reims'])
  })
})

describe('Etappen bearbeiten', () => {
  it('Nutzerpfad: Bearbeiten -> Formular ist vorbelegt -> Name aendern -> neuer Name sichtbar', async () => {
    seedEtappen([
      { id: 1, name: 'Reims', vonDatum: '2026-08-15', bisDatum: '', notiz: '', link: '' },
    ])
    const user = userEvent.setup()
    render(<Etappen />)

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))

    // Der Nutzer erwartet seine Werte im Formular wiederzufinden
    expect(screen.getByLabelText('Stadt/Abschnitt').value).toBe('Reims')
    expect(screen.getByLabelText('Von').value).toBe('2026-08-15')
    // Der Absende-Knopf wechselt die Bedeutung
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeTruthy()

    await user.clear(screen.getByLabelText('Stadt/Abschnitt'))
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Reims Zentrum')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    expect(screen.getByText('Reims Zentrum')).toBeTruthy()
    expect(screen.queryByText('Reims')).toBeNull()

    // Bearbeiten darf keinen zweiten Eintrag erzeugen
    const gespeichert = gespeicherteEtappen()
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].id).toBe(1)
    expect(gespeichert[0].name).toBe('Reims Zentrum')
    // Nicht angefasste Felder bleiben erhalten
    expect(gespeichert[0].vonDatum).toBe('2026-08-15')

    // Nach dem Speichern ist der Bearbeiten-Modus beendet
    expect(screen.getByRole('button', { name: 'Etappe hinzufügen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull()
  })

  it('Nutzerpfad: Bearbeiten abbrechen laesst den Eintrag unveraendert', async () => {
    seedEtappen([{ id: 1, name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    await user.clear(screen.getByLabelText('Stadt/Abschnitt'))
    await user.type(screen.getByLabelText('Stadt/Abschnitt'), 'Verworfen')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.getByText('Reims')).toBeTruthy()
    expect(screen.queryByText('Verworfen')).toBeNull()
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
    seedEtappen([{ id: 1, name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // Die Rueckfrage nennt die betroffene Etappe
    expect(confirmSpy.mock.calls[0][0]).toContain('Reims')

    expect(screen.queryByText('Reims')).toBeNull()
    expect(screen.getByText('Noch keine Etappen erfasst.')).toBeTruthy()
    expect(gespeicherteEtappen()).toEqual([])
  })

  it('Nutzerpfad: Loeschen -> Rueckfrage abbrechen -> Etappe bleibt', async () => {
    // Rueckgabe false = "der Nutzer klickt Abbrechen".
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    seedEtappen([{ id: 1, name: 'Reims', vonDatum: '', bisDatum: '', notiz: '', link: '' }])
    const user = userEvent.setup()
    render(<Etappen />)

    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Reims')).toBeTruthy()
    expect(gespeicherteEtappen()).toHaveLength(1)
  })

  it('Nutzerpfad: von zwei Etappen wird nur die gewaehlte geloescht', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    seedEtappen([
      { id: 1, name: 'Reims', vonDatum: '2026-08-15', bisDatum: '', notiz: '', link: '' },
      { id: 2, name: 'Troyes', vonDatum: '2026-09-05', bisDatum: '', notiz: '', link: '' },
    ])
    const user = userEvent.setup()
    render(<Etappen />)

    // Die Loeschen-Knoepfe stehen in derselben Reihenfolge wie die Eintraege.
    // Reims ist chronologisch zuerst, also der erste Knopf.
    const loeschKnoepfe = screen.getAllByRole('button', { name: 'Löschen' })
    await user.click(loeschKnoepfe[0])

    expect(screen.queryByText('Reims')).toBeNull()
    expect(screen.getByText('Troyes')).toBeTruthy()
    expect(gespeicherteEtappen().map((e) => e.name)).toEqual(['Troyes'])
  })
})
