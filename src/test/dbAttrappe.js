// ===========================================================================
// Attrappe der Datenbank fuer die Tests.
//
// Abgefangen wird globalThis.fetch - genau wie es App.merge.test.jsx im
// Repo schon vorgemacht hat. Dieser Weg wird in ALLEN Testdateien gleich
// benutzt.
//
// Warum fetch und nicht das Modul src/db.js selbst:
// Mit einer fetch-Attrappe laeuft die echte Datenschicht mit - Adressbau,
// Feldfilter, Kopfzeilen, Fehlerklassen, Offline-Kopie. Eine Modul-Attrappe
// wuerde genau diesen Teil ueberspringen und die Tests wuerden nur noch die
// Attrappe pruefen.
//
// Nachgebildet wird nur so viel von der Datenbankschnittstelle, wie die App
// tatsaechlich benutzt: GET mit select und order, POST, PATCH und DELETE mit
// "?id=eq.<kennung>".
// ===========================================================================

import { vi } from 'vitest'

const BASIS = 'https://yrsdfiskfpefzqgoscze.supabase.co/rest/v1/'

function antwort(status, koerper) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(koerper === undefined ? '' : JSON.stringify(koerper)),
  })
}

function nurSpalten(zeile, auswahl) {
  if (!auswahl) return { ...zeile }
  const gefiltert = {}
  for (const spalte of auswahl.split(',')) {
    if (Object.prototype.hasOwnProperty.call(zeile, spalte)) gefiltert[spalte] = zeile[spalte]
  }
  return gefiltert
}

/**
 * Baut eine fetch-Attrappe ueber einem Satz Tabellen im Arbeitsspeicher.
 *
 * @param tabellen  z.B. { etappen: [...], bookings: [...] }
 * @param optionen  { geheimnisNoetig }  - true (Standard) heisst: Schreiben
 *                  ohne die Kopfzeile x-urlaub-schreibgeheimnis wird mit 401
 *                  abgewiesen, so wie es die echte Datenbank tut.
 * @returns { tabellen, aufrufe, wiederherstellen }
 */
export function dbAttrappeAufsetzen(tabellen = {}, optionen = {}) {
  const geheimnisNoetig = optionen.geheimnisNoetig !== false
  const daten = {}
  for (const [name, zeilen] of Object.entries(tabellen)) {
    daten[name] = zeilen.map((z) => ({ ...z }))
  }
  const aufrufe = []
  const vorher = globalThis.fetch

  globalThis.fetch = vi.fn((adresse, einstellungen = {}) => {
    const text = String(adresse)
    if (!text.startsWith(BASIS)) {
      return Promise.reject(new TypeError(`Unerwartete Adresse in der Attrappe: ${text}`))
    }

    const url = new URL(text)
    const liste = url.pathname.split('/').pop()
    const verfahren = (einstellungen.method || 'GET').toUpperCase()
    const kopf = einstellungen.headers || {}
    const geheimnis = kopf['x-urlaub-schreibgeheimnis'] || ''
    const auswahl = url.searchParams.get('select')
    const kennungFilter = (url.searchParams.get('id') || '').replace(/^eq\./, '')

    aufrufe.push({ liste, verfahren, adresse: text, kopf, koerper: einstellungen.body })

    if (!daten[liste]) daten[liste] = []

    if (verfahren === 'GET') {
      const zeilen = [...daten[liste]]
        .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))
        .map((z) => nurSpalten(z, auswahl))
      return antwort(200, zeilen)
    }

    // Ab hier: schreibende Verfahren.
    if (geheimnisNoetig && !geheimnis) {
      return antwort(401, { code: '42501', message: 'new row violates row-level security policy' })
    }

    if (verfahren === 'POST') {
      const neu = JSON.parse(einstellungen.body)
      daten[liste].push({ ...neu })
      return antwort(201, [nurSpalten(neu, auswahl)])
    }

    if (verfahren === 'PATCH') {
      const werte = JSON.parse(einstellungen.body)
      const treffer = daten[liste].filter((z) => String(z.id) === kennungFilter)
      for (const zeile of treffer) Object.assign(zeile, werte)
      return antwort(200, treffer.map((z) => nurSpalten(z, auswahl)))
    }

    if (verfahren === 'DELETE') {
      daten[liste] = daten[liste].filter((z) => String(z.id) !== kennungFilter)
      return antwort(204)
    }

    return antwort(405, { message: `Verfahren ${verfahren} nicht nachgebildet` })
  })

  return {
    tabellen: daten,
    aufrufe,
    wiederherstellen() {
      globalThis.fetch = vorher
    },
  }
}

/**
 * Simuliert "kein Netz": jeder Zugriff scheitert ohne HTTP-Status, genau wie
 * ein echter fetch bei fehlender Verbindung.
 */
export function dbAttrappeOhneNetz() {
  const vorher = globalThis.fetch
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
  return {
    wiederherstellen() {
      globalThis.fetch = vorher
    },
  }
}

/**
 * Legt eine Offline-Kopie im Browserspeicher an - so, wie die Datenschicht sie
 * nach einem erfolgreichen Ladevorgang selbst hinterlassen wuerde.
 */
export function kopieSetzen(liste, eintraege, stand) {
  window.localStorage.setItem(
    `urlaub-app.kopie.${liste}`,
    JSON.stringify({ stand: stand || new Date().toISOString(), eintraege }),
  )
}

/** Schreibgeheimnis fuer die Tests hinterlegen. */
export function geheimnisSetzenFuerTest(wert = 'test-geheimnis') {
  window.localStorage.setItem('urlaub-app.schreibgeheimnis', wert)
}
