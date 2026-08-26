import { useState } from 'react'
import Navigation from './components/Navigation'
import DataBackup from './components/DataBackup'
import ThemeToggle from './components/ThemeToggle'
import Schreibzugang from './components/Schreibzugang'
import Bookings from './components/Bookings'
import Sightseeing from './components/Sightseeing'
import Route from './components/Route'
import Etappen from './components/Etappen'
import Events from './components/Events'
import Restaurants from './components/Restaurants'
import './App.css'

// Der Startup-Merge aus public/data.json ist ersatzlos entfallen. Die
// Datenbank ist die Wahrheit; jede Liste laedt sich selbst ueber die
// Datenschicht (src/db.js) und zeigt ihren Ladezustand selbst an. Deshalb
// braucht die App hier auch keinen eigenen "ready"-Zustand mehr.
// public/data.json bleibt als Sicherung liegen, wird aber nicht mehr geladen.

function App() {
  const [current, setCurrent] = useState('etappen')

  return (
    <div className="app">
      <header className="app-header">
        <h1>La Grande Virée</h1>
        <Navigation current={current} onChange={setCurrent} />
        <ThemeToggle />
        <Schreibzugang />
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
