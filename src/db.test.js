import { describe, it, expect, afterEach, vi } from 'vitest'
import { neueKennung } from './db'

// Tests fuer die Kennungs-Erzeugung.
//
// Hintergrund: Christof benutzt die App auf Handy und Notebook. Erzeugen beide
// in derselben Millisekunde einen Eintrag, hatten sie mit dem alten
// Date.now()-Verfahren dieselbe Kennung - und der zweite Eintrag haette den
// ersten ueberschrieben. Genau das darf nicht passieren, weil alle Geraete
// denselben Stand zeigen sollen.

afterEach(() => {
  vi.useRealTimers()
})

describe('neueKennung', () => {
  it('zwei Geräte in derselben Millisekunde bekommen verschiedene Kennungen', () => {
    // Die Uhr wird angehalten - beide Aufrufe sehen exakt denselben Zeitpunkt.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))

    const geraetA = neueKennung()
    const geraetB = neueKennung()

    expect(Date.now()).toBe(new Date('2026-08-26T12:00:00.000Z').getTime())
    // Der eigentliche Befund: gleiche Kennung bedeutet Datenverlust.
    expect(geraetA).not.toBe(geraetB)
  })

  it('viele Kennungen in derselben Millisekunde bleiben paarweise verschieden', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))

    const kennungen = Array.from({ length: 500 }, () => neueKennung())
    expect(new Set(kennungen).size).toBe(500)
  })

  it('die Kennung beginnt mit dem Zeitstempel, damit die Sortierung chronologisch bleibt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))
    const frueh = neueKennung()
    vi.setSystemTime(new Date('2026-08-26T12:00:01.000Z'))
    const spaet = neueKennung()

    // Die Datenbank sortiert ueber "order=id.asc", also rein textlich.
    // Steht der Zeitstempel vorn und ist er gleich lang, stimmt die
    // Textsortierung mit der zeitlichen Reihenfolge ueberein.
    expect(frueh < spaet).toBe(true)
    expect(frueh.split('-')[0]).toBe(String(new Date('2026-08-26T12:00:00.000Z').getTime()))
  })

  it('die Kennung ist eine Zeichenkette und passt zu den Vergleichen der App', () => {
    const kennung = neueKennung()
    expect(typeof kennung).toBe('string')
    // Die Komponenten vergleichen durchgehend ueber String(...) - eine Kennung
    // muss diesen Vergleich mit sich selbst bestehen.
    expect(String(kennung) === String(kennung)).toBe(true)
    // Keine Zeichen, die in der Adresse einer Anfrage umkodiert werden muessten.
    expect(/^[0-9]+-[a-z0-9]{6}$/.test(kennung)).toBe(true)
  })
})
