import { useEffect, useState } from 'react'

const STORAGE_KEY = 'urlaub-app.theme'

const MODI = [
  { wert: 'auto', label: 'Auto' },
  { wert: 'light', label: 'Hell' },
  { wert: 'dark', label: 'Dunkel' },
]

/**
 * Gespeicherten Modus lesen. Alles ausser 'light'/'dark' gilt als 'auto' -
 * damit sind auch fehlender Key und Muell-Werte abgedeckt.
 */
function ladeThemeModus() {
  try {
    const roh = localStorage.getItem(STORAGE_KEY)
    return roh === 'light' || roh === 'dark' ? roh : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * Modus auf <html> anwenden. 'auto' entfernt das Attribut, damit wieder die
 * prefers-color-scheme-Media-Query greift.
 */
function wendeThemeAn(modus) {
  const wurzel = document.documentElement
  if (modus === 'light' || modus === 'dark') {
    wurzel.setAttribute('data-theme', modus)
  } else {
    wurzel.removeAttribute('data-theme')
  }
}

export default function ThemeToggle() {
  const [modus, setModus] = useState(ladeThemeModus)

  useEffect(() => {
    wendeThemeAn(modus)
    try {
      if (modus === 'auto') {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, modus)
      }
    } catch {
      // Privater Modus / kein Storage: Auswahl gilt dann nur fuer diese Sitzung.
    }
  }, [modus])

  return (
    <div className="nav theme-switch" role="group" aria-label="Farbschema">
      {MODI.map((m) => (
        <button
          key={m.wert}
          type="button"
          className={modus === m.wert ? 'active' : ''}
          aria-pressed={modus === m.wert}
          onClick={() => setModus(m.wert)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
