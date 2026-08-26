import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Schreibzugang from './Schreibzugang'

// Verhaltenstests fuer die Eingabe des Schreibgeheimnisses.
//
// Der wichtigste Punkt steht im letzten Test: die Anzeige darf nicht mehr
// behaupten, als die App weiss. Ein hinterlegtes Geheimnis ist nicht dasselbe
// wie ein gueltiges - geprueft wird es erst von der Datenbank.

const SCHLUESSEL = 'urlaub-app.schreibgeheimnis'

describe('Schreibzugang', () => {
  it('Nutzerpfad: frisches Gerät -> die App sagt von sich aus, dass nur Lesen geht', () => {
    render(<Schreibzugang />)

    expect(screen.getByText('Schreibzugang: nur Lesen')).toBeTruthy()
    // Der Weg zum Schreiben muss ohne Suchen sichtbar sein.
    expect(screen.getByRole('button', { name: 'Schreibgeheimnis eingeben' })).toBeTruthy()
  })

  it('Nutzerpfad: Geheimnis eingeben -> es liegt auf dem Gerät und das Feld ist wieder zu', async () => {
    const user = userEvent.setup()
    render(<Schreibzugang />)

    await user.click(screen.getByRole('button', { name: 'Schreibgeheimnis eingeben' }))
    await user.type(screen.getByLabelText('Schreibgeheimnis'), 'mein-geheimnis')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(window.localStorage.getItem(SCHLUESSEL)).toBe('mein-geheimnis')
    // Das Eingabefeld ist verschwunden - der Nutzer ist fertig.
    expect(screen.queryByLabelText('Schreibgeheimnis')).toBeNull()
  })

  it('Nutzerpfad: leere Eingabe speichern -> Hinweis statt leerem Geheimnis', async () => {
    const user = userEvent.setup()
    render(<Schreibzugang />)

    await user.click(screen.getByRole('button', { name: 'Schreibgeheimnis eingeben' }))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(window.localStorage.getItem(SCHLUESSEL)).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('Bitte das Schreibgeheimnis eingeben')
  })

  it('Nutzerpfad: Schreibzugang entfernen -> das Geheimnis ist vom Gerät weg', async () => {
    window.localStorage.setItem(SCHLUESSEL, 'mein-geheimnis')
    const user = userEvent.setup()
    render(<Schreibzugang />)

    await user.click(screen.getByRole('button', { name: 'Schreibzugang entfernen' }))

    expect(window.localStorage.getItem(SCHLUESSEL)).toBeNull()
    expect(screen.getByText('Schreibzugang: nur Lesen')).toBeTruthy()
  })

  it('Nutzerpfad: hinterlegtes Geheimnis wird NICHT als geprüft ausgegeben', async () => {
    const user = userEvent.setup()
    render(<Schreibzugang />)

    await user.click(screen.getByRole('button', { name: 'Schreibgeheimnis eingeben' }))
    await user.type(screen.getByLabelText('Schreibgeheimnis'), 'vielleicht-ein-tippfehler')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    // Abwesenheit zuerst, das ist der eigentliche Befund: die App kennt die
    // Gueltigkeit nicht und darf sie deshalb auch nicht behaupten.
    expect(screen.queryByText(/aktiv/)).toBeNull()
    expect(screen.getByText('Schreibzugang: Geheimnis hinterlegt')).toBeTruthy()
  })
})
