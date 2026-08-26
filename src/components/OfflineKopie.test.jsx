import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Restaurants from './Restaurants'
import {
  dbAttrappeAufsetzen,
  dbAttrappeOhneNetz,
  kopieSetzen,
  geheimnisSetzenFuerTest,
} from '../test/dbAttrappe'

// Verhaltenstests fuer die Offline-Kopie.
//
// Hintergrund: Christof faehrt mit dem Auto durch Frankreich und hat streckenweise
// keinen Empfang. Ohne Kopie saehe er dort eine leere Liste - keine Adressen,
// keine Buchungsnummern, keine Reservierungen. Genau dieser Fall wird hier
// durchgespielt, stellvertretend am Bereich "Restaurants".
//
// "Kein Netz" wird nachgebildet, wie es der Browser tut: fetch scheitert ohne
// HTTP-Status.

let db = null

afterEach(() => {
  if (db) db.wiederherstellen()
  db = null
})

describe('Offline-Kopie', () => {
  it('Nutzerpfad: mit Verbindung laden -> die Kopie liegt danach auf dem Gerät bereit', async () => {
    db = dbAttrappeAufsetzen({
      etappen: [],
      restaurants: [
        { id: '51', name: 'Brasserie du Boulingrin', ort: 'Reims', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: '' },
      ],
    })
    render(<Restaurants />)

    expect(await screen.findByText('Brasserie du Boulingrin')).toBeTruthy()
    // Beim normalen Laden darf KEIN Offline-Hinweis erscheinen.
    expect(screen.queryByText(/Offline-Kopie/)).toBeNull()

    const roh = window.localStorage.getItem('urlaub-app.kopie.restaurants')
    expect(roh).toBeTruthy()
    const kopie = JSON.parse(roh)
    expect(kopie.eintraege).toHaveLength(1)
    expect(kopie.eintraege[0].name).toBe('Brasserie du Boulingrin')
    expect(kopie.stand).toBeTruthy()
  })

  it('Nutzerpfad: ohne Verbindung neu laden -> die Kopie erscheint mit Hinweis auf ihren Stand', async () => {
    kopieSetzen(
      'restaurants',
      [
        { id: '51', name: 'Brasserie du Boulingrin', ort: 'Reims', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: '' },
      ],
      '2026-08-26T09:30:00.000Z',
    )
    db = dbAttrappeOhneNetz()
    render(<Restaurants />)

    // Der Inhalt ist da, obwohl kein Netz vorhanden ist.
    expect(await screen.findByText('Brasserie du Boulingrin')).toBeTruthy()
    expect(screen.getByText('Ort: Reims')).toBeTruthy()

    // Und der Nutzer erfaehrt, dass es eine Kopie ist - samt Stand.
    const hinweis = screen.getByRole('status')
    expect(hinweis.textContent).toContain('Offline-Kopie')
    expect(hinweis.textContent).toContain('Stand 26.08.2026')
    expect(hinweis.textContent).toContain('Nur lesen')

    // Der Stand der Kopie darf durch das Anzeigen NICHT hochgesetzt werden -
    // sonst behauptet die App beim naechsten Mal Aktualitaet, die es nicht gibt.
    const kopie = JSON.parse(window.localStorage.getItem('urlaub-app.kopie.restaurants'))
    expect(kopie.stand).toBe('2026-08-26T09:30:00.000Z')
  })

  it('Nutzerpfad: ohne Verbindung und ohne Kopie -> verstaendliche Meldung statt stiller Leere', async () => {
    db = dbAttrappeOhneNetz()
    render(<Restaurants />)

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toContain('Keine Verbindung zur Datenbank')
    expect(meldung.textContent).toContain('keine Offline-Kopie')

    // Die App darf hier NICHT behaupten, es gaebe einfach keine Eintraege.
    expect(screen.queryByText('Noch keine Restaurants erfasst.')).toBeNull()
  })

  it('Nutzerpfad: ohne Verbindung speichern -> der Versuch scheitert sichtbar', async () => {
    geheimnisSetzenFuerTest()
    kopieSetzen('restaurants', [], '2026-08-26T09:30:00.000Z')
    kopieSetzen('etappen', [], '2026-08-26T09:30:00.000Z')
    db = dbAttrappeOhneNetz()
    const user = userEvent.setup()
    render(<Restaurants />)

    await screen.findByText('Noch keine Restaurants erfasst.')

    await user.type(screen.getByLabelText('Name'), 'Le Test')
    await user.click(screen.getByRole('button', { name: 'Restaurant hinzufügen' }))

    const meldungen = await screen.findAllByRole('alert')
    const text = meldungen.map((m) => m.textContent).join(' ')
    expect(text).toContain('Keine Verbindung zur Datenbank')
    expect(text).toContain('NICHT gespeichert')

    // Kein stilles Erfolgserlebnis: der Eintrag darf nirgends auftauchen.
    expect(screen.queryByText('Le Test')).toBeNull()
    // Und er darf auch nicht heimlich in der Kopie landen.
    const kopie = JSON.parse(window.localStorage.getItem('urlaub-app.kopie.restaurants'))
    expect(kopie.eintraege).toHaveLength(0)
  })

  it('Nutzerpfad: Löschen ohne Verbindung -> der Eintrag bleibt stehen und der Fehler steht da', async () => {
    geheimnisSetzenFuerTest()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    kopieSetzen(
      'restaurants',
      [
        { id: '51', name: 'Brasserie du Boulingrin', ort: '', kueche: '', reservierung: '', kontakt: '', notiz: '', link: '', etappeId: '' },
      ],
      '2026-08-26T09:30:00.000Z',
    )
    db = dbAttrappeOhneNetz()
    const user = userEvent.setup()
    render(<Restaurants />)

    await screen.findByText('Brasserie du Boulingrin')
    await user.click(screen.getByRole('button', { name: 'Löschen' }))

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toContain('Keine Verbindung zur Datenbank')
    // Der Eintrag darf NICHT aus der Anzeige verschwinden - er ist nicht geloescht.
    expect(screen.getByText('Brasserie du Boulingrin')).toBeTruthy()
  })
})
