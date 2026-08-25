import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// ---------------------------------------------------------------------------
// Startup-Merge: data.json gegen localStorage
// ---------------------------------------------------------------------------
//
// ACHTUNG BEIM LESEN: Dieser Test haelt eine ENTSCHEIDUNG fest, keinen Bug.
//
// Beim Start liest die App public/data.json und mischt sie in den
// Browser-Speicher (App.jsx, useEffect). Die Regel lautet: bei gleicher id
// gewinnt data.json, lokale Eintraege mit unbekannter id bleiben erhalten.
//
// Daraus folgt zwangslaeufig, und zwar gewollt:
//   - eine lokale Aenderung an einem Eintrag, den data.json kennt, wird beim
//     naechsten Laden ueberschrieben
//   - eine lokale Loeschung eines Eintrags, den data.json kennt, kommt beim
//     naechsten Laden zurueck
//
// Quelle der Entscheidung: Vault-Hub P:/OBSIDIAN/CLAUDE-Vault/Projekte/
// urlaub-app.md, Abschnitt "Architektur-Entscheidung (MCP-Integration,
// Option 1)": "data.json gewinnt bei gleicher id, lokale Zusatz-Eintraege
// bleiben. Bewusster Tradeoff: verlaesslicher Schreib-Weg ist der MCP; reine
// In-Browser-Eingaben bleiben lokal und fliessen nicht automatisch zurueck.
// Echte Zwei-Wege-Sync waere Option 2 (Supabase o.ae.) - bewusst nicht
// gebaut." Christof hat 2026-08-24 bestaetigt, dass dieser Tradeoff bleibt.
//
// Wenn ein Test hier rot wird, ist das kein Testfehler, der wegzureparieren
// ist. Dann wurde die Merge-Regel geaendert, und es braucht eine Entscheidung
// dazu - nicht eine Anpassung dieser Erwartungen.

const ETAPPEN_KEY = 'urlaub-app.etappen'
const BOOKINGS_KEY = 'urlaub-app.bookings'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/**
 * Ersetzt die Netzabfrage nach data.json. Der Netzweg selbst ist damit
 * gemockt - in jsdom gibt es keinen Server, der public/data.json ausliefert.
 * Die Merge-Logik dahinter laeuft echt: es ist der unveraenderte useEffect
 * aus App.jsx, der in den echten jsdom-localStorage schreibt.
 */
function dataJsonAusliefern(payload) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  }))
}

function gespeichert(key) {
  return JSON.parse(window.localStorage.getItem(key) || '[]')
}

/** Wartet, bis die App den Ladezustand verlassen hat. */
function appIstGeladen() {
  return screen.findByRole('heading', { name: 'Etappen', level: 2 })
}

describe('Startup-Merge: gewolltes Verhalten des Tradeoffs', () => {
  it('Nutzerpfad: Etappe im Browser umbenannt, dann neu geladen -> data.json gewinnt, die Umbenennung ist weg (GEWOLLT)', async () => {
    // Der Nutzer hat "Reims" im Browser zu "Reims (mein Name)" umbenannt.
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 1, name: 'Reims (mein Name)', vonDatum: '2026-08-15' }]),
    )
    // data.json kennt dieselbe id 1 mit dem urspruenglichen Namen.
    dataJsonAusliefern({ data: { etappen: [{ id: 1, name: 'Reims', vonDatum: '2026-08-15' }] } })

    render(<App />)
    await appIstGeladen()

    // Das ist die Entscheidung, nicht ein Defekt: die lokale Umbenennung ist fort.
    // Die Abwesenheits-Pruefung steht zuerst, weil sie die eigentliche Regel
    // traegt. Stuende sie hinten, wuerde ein Merge-Ausfall zuerst an
    // getByText('Reims') scheitern und die Regel-Pruefung nie ausfuehren.
    expect(screen.queryByText('Reims (mein Name)')).toBeNull()
    expect(screen.getByText('Reims')).toBeTruthy()

    const etappen = gespeichert(ETAPPEN_KEY)
    expect(etappen).toHaveLength(1)
    expect(etappen[0].name).toBe('Reims')
  })

  it('Nutzerpfad: Etappe im Browser geloescht, dann neu geladen -> sie ist wieder da (GEWOLLT)', async () => {
    // Der Nutzer hat "Rouen" geloescht, lokal steht nur noch Reims.
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 1, name: 'Reims' }]),
    )
    // data.json kennt beide.
    dataJsonAusliefern({
      data: {
        etappen: [
          { id: 1, name: 'Reims' },
          { id: 2, name: 'Rouen' },
        ],
      },
    })

    render(<App />)
    await appIstGeladen()

    // Die Loeschung kehrt zurueck - so ist die Merge-Regel gewollt.
    expect(screen.getByText('Rouen')).toBeTruthy()
    expect(gespeichert(ETAPPEN_KEY).map((e) => e.name)).toEqual(['Reims', 'Rouen'])
  })

  it('Nutzerpfad: Etappe im Browser neu angelegt, dann neu geladen -> sie bleibt erhalten (GEWOLLT)', async () => {
    // Lokal angelegt, id kennt data.json nicht.
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 999, name: 'Nur lokal angelegt' }]),
    )
    dataJsonAusliefern({ data: { etappen: [{ id: 1, name: 'Reims' }] } })

    render(<App />)
    await appIstGeladen()

    expect(screen.getByText('Nur lokal angelegt')).toBeTruthy()
    expect(screen.getByText('Reims')).toBeTruthy()

    // Reihenfolge nach der Merge-Regel: data.json zuerst, lokale Zusaetze danach.
    expect(gespeichert(ETAPPEN_KEY).map((e) => e.name)).toEqual([
      'Reims',
      'Nur lokal angelegt',
    ])
  })

  it('Nutzerpfad: alle drei Faelle gleichzeitig in einem Ladevorgang', async () => {
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([
        { id: 1, name: 'Reims (mein Name)' }, // bearbeitet -> wird ueberschrieben
        // id 2 lokal geloescht                 -> kommt zurueck
        { id: 999, name: 'Nur lokal angelegt' }, // unbekannte id -> bleibt
      ]),
    )
    dataJsonAusliefern({
      data: {
        etappen: [
          { id: 1, name: 'Reims' },
          { id: 2, name: 'Rouen' },
        ],
      },
    })

    render(<App />)
    await appIstGeladen()

    // Diese Abwesenheits-Pruefung stand vorher HINTER der toEqual-Pruefung und
    // war dort nicht ausloesbar: sobald der ueberschriebene Name irgendwo
    // auftaucht, weicht auch die gespeicherte Namensliste ab, und die
    // toEqual-Pruefung bricht vorher ab. Nach vorn gezogen greift sie eigenstaendig.
    expect(screen.queryByText('Reims (mein Name)')).toBeNull()
    expect(gespeichert(ETAPPEN_KEY).map((e) => e.name)).toEqual([
      'Reims',
      'Rouen',
      'Nur lokal angelegt',
    ])
  })

  it('Nutzerpfad: Bereich, den data.json nicht kennt -> lokale Eintraege bleiben unangetastet', async () => {
    // Der Nutzer hat eine Buchung im Browser erfasst. data.json liefert
    // keinen bookings-Schluessel.
    window.localStorage.setItem(
      BOOKINGS_KEY,
      JSON.stringify([{ id: 77, titel: 'Nur lokal erfasste Buchung', typ: 'Flug' }]),
    )
    dataJsonAusliefern({ data: { etappen: [{ id: 1, name: 'Reims' }] } })

    render(<App />)
    await appIstGeladen()

    expect(gespeichert(BOOKINGS_KEY)).toHaveLength(1)
    expect(gespeichert(BOOKINGS_KEY)[0].titel).toBe('Nur lokal erfasste Buchung')
  })
})

describe('Startup-Merge: data.json nicht erreichbar', () => {
  it('Nutzerpfad: data.json liefert 404 -> App startet trotzdem, lokale Daten bleiben', async () => {
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 1, name: 'Reims (mein Name)' }]),
    )
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))

    render(<App />)
    await appIstGeladen()

    // Ohne data.json wird nichts ueberschrieben - der lokale Stand ueberlebt.
    expect(screen.getByText('Reims (mein Name)')).toBeTruthy()
    expect(gespeichert(ETAPPEN_KEY)[0].name).toBe('Reims (mein Name)')
  })

  it('Nutzerpfad: kein Netz (fetch scheitert) -> App haengt nicht im Ladezustand', async () => {
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 1, name: 'Reims (mein Name)' }]),
    )
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    render(<App />)
    await appIstGeladen()

    expect(screen.queryByText('Daten werden geladen…')).toBeNull()
    expect(screen.getByText('Reims (mein Name)')).toBeTruthy()
    expect(gespeichert(ETAPPEN_KEY)[0].name).toBe('Reims (mein Name)')
  })

  it('Nutzerpfad: data.json enthaelt Muell statt einer Liste -> lokale Daten werden nicht zerstoert', async () => {
    window.localStorage.setItem(
      ETAPPEN_KEY,
      JSON.stringify([{ id: 1, name: 'Reims (mein Name)' }]),
    )
    // etappen ist kein Array -> App.jsx behandelt das als leere Liste.
    dataJsonAusliefern({ data: { etappen: 'kaputt' } })

    render(<App />)
    await appIstGeladen()

    expect(screen.getByText('Reims (mein Name)')).toBeTruthy()
    expect(gespeichert(ETAPPEN_KEY)).toHaveLength(1)
  })
})
