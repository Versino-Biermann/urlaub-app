import { useState, useEffect } from 'react'
import Navigation from './components/Navigation'
import DataBackup from './components/DataBackup'
import Bookings from './components/Bookings'
import Sightseeing from './components/Sightseeing'
import Route from './components/Route'
import Etappen from './components/Etappen'
import Events from './components/Events'
import Restaurants from './components/Restaurants'
import './App.css'

const STARTUP_KEYS = {
  etappen: 'urlaub-app.etappen',
  bookings: 'urlaub-app.bookings',
  route: 'urlaub-app.route',
  sightseeing: 'urlaub-app.sightseeing',
  events: 'urlaub-app.events',
  restaurants: 'urlaub-app.restaurants',
}

function App() {
  const [current, setCurrent] = useState('etappen')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadStartupData() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data.json`)
        if (!response.ok) {
          if (!cancelled) setReady(true)
          return
        }
        const json = await response.json()
        const incoming = json.data || {}

        for (const [dataKey, storageKey] of Object.entries(STARTUP_KEYS)) {
          const incomingList = Array.isArray(incoming[dataKey]) ? incoming[dataKey] : []
          const incomingIds = new Set(incomingList.map((item) => String(item && item.id)))

          let localList = []
          try {
            const raw = localStorage.getItem(storageKey)
            localList = raw ? JSON.parse(raw) : []
            if (!Array.isArray(localList)) localList = []
          } catch {
            localList = []
          }

          const extraLocal = localList.filter(
            (item) => !incomingIds.has(String(item && item.id))
          )

          const mergedList = [...incomingList, ...extraLocal]
          localStorage.setItem(storageKey, JSON.stringify(mergedList))
        }
      } catch {
        // Netzfehler/404 defensiv abfangen - App darf nie haengen bleiben
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    loadStartupData()

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <div className="app">
        <p className="empty">Daten werden geladen…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Urlaub-App</h1>
        <Navigation current={current} onChange={setCurrent} />
        <DataBackup />
      </header>

      <main className="app-main">
        {current === 'etappen' ? (
          <Etappen />
        ) : current === 'buchungen' ? (
          <Bookings />
        ) : current === 'reiseroute' ? (
          <Route />
        ) : current === 'events' ? (
          <Events />
        ) : current === 'restaurants' ? (
          <Restaurants />
        ) : (
          <Sightseeing />
        )}
      </main>
    </div>
  )
}

export default App
