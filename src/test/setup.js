import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest laeuft hier ohne globals, deshalb greift der Auto-Cleanup der
// Testing Library nicht (der haengt sich an ein global vorhandenes afterEach).
// Also explizit nach jedem Test unmounten - sonst stapeln sich die gerenderten
// Baeume und Queries finden mehrere Treffer.
afterEach(() => {
  cleanup()
})

// jsdom liefert eine echte Storage-Implementierung fuer window.localStorage,
// das ist kein Mock. Geleert wird sie zwischen den Tests, damit kein Zustand
// aus einem Test in den naechsten laeuft.
beforeEach(() => {
  window.localStorage.clear()
})
