import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Bewusst eine eigene Datei statt eines test-Blocks in vite.config.js:
// der Produktions-Build (GitHub Actions -> Pages) liest ausschliesslich
// vite.config.js und bleibt damit von der Test-Einrichtung unberuehrt.
// Vitest bevorzugt vitest.config.js, sobald sie existiert - deshalb wird das
// React-Plugin hier erneut registriert (JSX-Transform fuer die Testlaeufe).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    // globals bleibt auf dem Standard false - Testfunktionen werden importiert.
    css: false,
  },
})
